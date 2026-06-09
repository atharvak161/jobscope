import { NextRequest, NextResponse } from 'next/server'
import { runIngestionCycle } from '@/lib/workers/ingestion-worker'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-ingest-token')
  if (token !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Query/location are optional; default to broad terms so the pipeline
  // runs out of the box (RemoteOK ignores them; keyed sources use them).
  let query = 'software'
  let location = 'remote'
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.query === 'string') query = body.query
    if (body && typeof body.location === 'string') location = body.location
  } catch {
    // No/invalid body — fall back to defaults.
  }

  try {
    const result = await runIngestionCycle(query, location)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
