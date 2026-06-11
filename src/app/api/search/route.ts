import { NextRequest, NextResponse } from 'next/server'
import { runIngestionCycle } from '@/lib/workers/ingestion-worker'

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

  try {
    const result = await runIngestionCycle(query, location)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
