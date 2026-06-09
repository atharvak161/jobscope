/**
 * GET /api/jobs/:id — single job detail
 *
 * Returns the full job record, all sponsor matches (with sponsor details),
 * and the current user's application status for this job (if one exists).
 *
 * Security:
 *   - Auth required — 401 if no session
 *   - No user-level ownership check needed: jobs are not user-private data
 *   - Application lookup uses userId from session — no IDOR exposure
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §5 (Job feed endpoints)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getSession } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  // Auth gate
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await context.params

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      sponsorMatches: {
        include: { sponsor: true },
      },
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Fetch the user's application for this job if one exists.
  // userId is taken from the session — not from the request body/params —
  // so this cannot be manipulated to reveal another user's application.
  const application = await prisma.application.findUnique({
    where: {
      userId_jobId: {
        userId: session.id,
        jobId: id,
      },
    },
  })

  return NextResponse.json({
    job,
    userApplication: application ?? null,
  })
}
