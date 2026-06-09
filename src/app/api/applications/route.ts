/**
 * GET  /api/applications — list the authenticated user's applications
 * POST /api/applications — create a new application
 *
 * GET query parameters:
 *   status   string  — comma-separated ApplicationStatus values to filter by
 *   page     number  — default 1
 *   limit    number  — default 20, max 50
 *
 * POST body (JSON):
 *   jobId    string  — required — UUID of the job being applied to
 *   notes    string  — optional
 *
 * Security:
 *   - Auth required on all methods — 401 if no session
 *   - EVERY query includes userId: session.user.id — no IDOR possible
 *   - POST creates an Application scoped to the authenticated user only
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §5 (Application tracker), §6.2 (IDOR prevention)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getSession } from '@/lib/auth'
import { $Enums } from '@/generated/prisma/client'

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20
const DEFAULT_PAGE = 1

// ─────────────────────────────────────────────────────────────────────────────
// GET — list applications
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE)
  const limitRaw = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw))
  const skip = (page - 1) * limit

  // Optional status filter
  const statusParam = searchParams.get('status')
  const statusValues = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(Boolean) as $Enums.ApplicationStatus[]
    : undefined

  // SECURITY: userId is ALWAYS sourced from the session — never from request params
  const where = {
    userId: session.id,
    ...(statusValues && statusValues.length > 0
      ? { status: { in: statusValues } }
      : {}),
  }

  const [applications, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: { job: true },
    }),
    prisma.application.count({ where }),
  ])

  return NextResponse.json({
    applications,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create application
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body is required' }, { status: 400 })
  }

  const { jobId, notes } = body as { jobId?: unknown; notes?: unknown }

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required and must be a string' }, { status: 400 })
  }

  // Verify the job exists before creating an application
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Snapshot the sponsor confidence at application time.
  // The register may change later — the snapshot preserves the historical state.
  const bestSponsorMatch = await prisma.jobSponsorMatch.findFirst({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
  })

  const application = await prisma.application.create({
    data: {
      userId: session.id,               // always from session — not user-provided
      jobId,
      status: $Enums.ApplicationStatus.SAVED,
      notes: typeof notes === 'string' ? notes : undefined,
      sponsorConfidenceAtApply: bestSponsorMatch?.confidenceTier ?? null,
      clearanceStatusAtApply: job.clearanceStatus,
    },
  })

  return NextResponse.json({ application }, { status: 201 })
}
