/**
 * GET    /api/applications/:id — get a single application (must be owner)
 * PATCH  /api/applications/:id — update status, notes, salary, recruiter contact
 * DELETE /api/applications/:id — soft delete (sets status to WITHDRAWN)
 *
 * PATCH body (JSON, all fields optional):
 *   status            ApplicationStatus
 *   notes             string
 *   salaryOffered     number  (annual GBP)
 *   recruiterName     string
 *   recruiterEmail    string
 *   recruiterAgency   string
 *
 * Security (IDOR prevention — per JOBSCOPE_ARCHITECTURE.md §6.2):
 *   - Auth required on all methods — 401 if no session
 *   - Every query includes userId: session.id in the WHERE clause
 *   - Ownership is verified at the DB query level, not just in application code
 *   - 404 is returned (not 403) on ownership mismatch — prevents ID enumeration
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §5 (Application tracker), §6.2 (IDOR prevention)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getSession } from '@/lib/auth'
import { $Enums } from '@/generated/prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — single application
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await context.params

  // Ownership enforced at query level: userId + id must both match
  const application = await prisma.application.findFirst({
    where: { id, userId: session.id },
    include: { job: true },
  })

  if (!application) {
    // 404 — not 403 — prevents ID enumeration
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  return NextResponse.json({ application })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — update application
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await context.params

  // Verify ownership before any mutation
  const existing = await prisma.application.findFirst({
    where: { id, userId: session.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
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

  const patch = body as {
    status?: unknown
    notes?: unknown
    salaryOffered?: unknown
    recruiterName?: unknown
    recruiterEmail?: unknown
    recruiterAgency?: unknown
  }

  // Validate and build the update payload — only include fields that were provided
  const validStatuses = Object.values($Enums.ApplicationStatus) as string[]

  const data: Record<string, unknown> = {}

  if (patch.status !== undefined) {
    if (typeof patch.status !== 'string' || !validStatuses.includes(patch.status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid values: ${validStatuses.join(', ')}` },
        { status: 400 },
      )
    }
    data.status = patch.status as $Enums.ApplicationStatus

    // Set appliedAt when status transitions TO APPLIED (and it hasn't been set yet)
    if (
      patch.status === $Enums.ApplicationStatus.APPLIED &&
      existing.status !== $Enums.ApplicationStatus.APPLIED &&
      !existing.appliedAt
    ) {
      data.appliedAt = new Date()
    }
  }

  if (patch.notes !== undefined) {
    data.notes = typeof patch.notes === 'string' ? patch.notes : null
  }

  if (patch.salaryOffered !== undefined) {
    if (
      patch.salaryOffered !== null &&
      (typeof patch.salaryOffered !== 'number' || !Number.isInteger(patch.salaryOffered) || patch.salaryOffered < 0)
    ) {
      return NextResponse.json({ error: 'salaryOffered must be a non-negative integer or null' }, { status: 400 })
    }
    data.salaryOffered = patch.salaryOffered as number | null
  }

  if (patch.recruiterName !== undefined) {
    data.recruiterName = typeof patch.recruiterName === 'string' ? patch.recruiterName : null
  }

  if (patch.recruiterEmail !== undefined) {
    data.recruiterEmail = typeof patch.recruiterEmail === 'string' ? patch.recruiterEmail : null
  }

  if (patch.recruiterAgency !== undefined) {
    data.recruiterAgency = typeof patch.recruiterAgency === 'string' ? patch.recruiterAgency : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const application = await prisma.application.update({
    where: { id, userId: session.id },
    data,
  })

  return NextResponse.json({ application })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — soft delete (set status to WITHDRAWN)
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await context.params

  // Verify ownership before mutation
  const existing = await prisma.application.findFirst({
    where: { id, userId: session.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // Soft delete — preserve the record for audit/history
  const application = await prisma.application.update({
    where: { id, userId: session.id },
    data: { status: $Enums.ApplicationStatus.WITHDRAWN },
  })

  return NextResponse.json({ application })
}
