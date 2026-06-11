import { NextRequest, NextResponse } from 'next/server'
import { runIngestionCycle } from '@/lib/workers/ingestion-worker'
import { prisma } from '@/lib/db/client'

// Client-callable endpoint — no token required (local app only).
// Called by the "Search Jobs" button in the job feed.
export async function POST(req: NextRequest) {
  let query = 'cybersecurity'
  let location = 'uk'
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.query === 'string') query = body.query
    if (body && typeof body.location === 'string') location = body.location
  } catch {
    // fall back to defaults
  }

  // Auto-cleanup: delete jobs older than 60 days before fetching fresh ones
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  const { count: deleted } = await prisma.job.deleteMany({
    where: { postedAt: { lt: cutoff } },
  })

  try {
    const result = await runIngestionCycle(query, location)
    return NextResponse.json({ ok: true, result: { ...result, deleted } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
