/**
 * POST /api/applications/:id/ghosting-check
 *
 * Checks whether an application should be flagged as GHOSTED.
 * Ghosting condition: status is APPLIED and appliedAt is 21+ days ago with no update.
 *
 * If the condition is met:
 *   - Sets status to GHOSTED
 *   - Sets ghostingFlaggedAt to now
 *
 * Returns: { ghosted: boolean, daysSinceApplied: number }
 *
 * Security:
 *   - Auth required — 401 if no session
 *   - Ownership verified at DB level: id + userId must match
 *   - 404 returned on ownership mismatch (prevents ID enumeration)
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §5 (Application tracker)
 * Schema: Application.ghostingFlaggedAt, ApplicationStatus.GHOSTED
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getSession } from '@/lib/auth'
import { $Enums } from '@/generated/prisma/client'

const GHOSTING_THRESHOLD_DAYS = 21

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await context.params

  // Ownership enforced at query level — id + userId must both match
  const application = await prisma.application.findFirst({
    where: { id, userId: session.id },
  })

  if (!application) {
    // 404 not 403 — prevents ID enumeration
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // Only APPLIED applications can be ghosted
  if (application.status !== $Enums.ApplicationStatus.APPLIED) {
    return NextResponse.json(
      {
        ghosted: false,
        daysSinceApplied: application.appliedAt
          ? Math.floor((Date.now() - application.appliedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        reason: `Application is in status "${application.status}", not APPLIED`,
      },
      { status: 200 },
    )
  }

  // No appliedAt timestamp — cannot compute staleness
  if (!application.appliedAt) {
    return NextResponse.json(
      {
        ghosted: false,
        daysSinceApplied: 0,
        reason: 'Application has no appliedAt timestamp',
      },
      { status: 200 },
    )
  }

  const now = Date.now()
  const daysSinceApplied = Math.floor(
    (now - application.appliedAt.getTime()) / (1000 * 60 * 60 * 24),
  )

  const shouldGhost = daysSinceApplied >= GHOSTING_THRESHOLD_DAYS

  if (shouldGhost) {
    await prisma.application.update({
      where: { id },
      data: {
        status: $Enums.ApplicationStatus.GHOSTED,
        ghostingFlaggedAt: new Date(now),
      },
    })
  }

  return NextResponse.json({
    ghosted: shouldGhost,
    daysSinceApplied,
  })
}
