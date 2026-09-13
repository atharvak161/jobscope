// Health check endpoint for container/uptime monitoring
// Returns 200 OK with pipeline freshness data
// Returns 503 if any job source is stale (>25h since last fetch)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET() {
  try {
    // Check DB connectivity
    await prisma.$queryRaw`SELECT 1`

    // Check job source freshness (25h threshold per SLO).
    // Only sources the ingestion worker can actually produce rows for belong
    // here — JOOBLE's adapter was removed in #33, so it can never be fresh
    // and would permanently trip this into 'degraded'. Key-gated sources are
    // only checked when their key is configured; otherwise they're legitimately
    // never ingested (by design — the app must run with zero API keys) and
    // including them would cause the same false-degraded failure JOOBLE did.
    // Keep this enablement logic in sync with `adapterRuns` in
    // src/lib/workers/ingestion-worker.ts.
    const sources = [
      'ADZUNA',
      'REED',
      'REMOTEOK',
      ...(process.env.JSEARCH_API_KEY ? ['JSEARCH'] : []),
      ...(process.env.RAPIDAPI_KEY ? ['ACTIVEJOBS', 'INDEED', 'REMOOTE'] : []),
    ]
    const freshnessChecks = await Promise.all(
      sources.map(async (source) => {
        const latest = await prisma.rawJobIngestion.findFirst({
          where: { source: source as any },
          orderBy: { ingestedAt: 'desc' },
        })
        const ageMs = latest ? Date.now() - new Date(latest.ingestedAt).getTime() : Infinity
        const ageHours = ageMs / (1000 * 60 * 60)
        return { source, ageHours: Math.round(ageHours * 10) / 10, stale: ageHours > 25 }
      })
    )

    const anyStale = freshnessChecks.some(f => f.stale)

    return NextResponse.json(
      { status: anyStale ? 'degraded' : 'ok', sources: freshnessChecks, timestamp: new Date().toISOString() },
      { status: anyStale ? 503 : 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: 'Database connectivity failure' },
      { status: 503 }
    )
  }
}
