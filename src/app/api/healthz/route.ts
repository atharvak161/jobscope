// Health check endpoint for container/uptime monitoring
// Returns 200 OK with pipeline freshness data
// Returns 503 if any job source is stale (>25h since last fetch)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET() {
  try {
    // Check DB connectivity
    await prisma.$queryRaw`SELECT 1`

    // Check job source freshness (25h threshold per SLO)
    const sources = ['ADZUNA', 'REED', 'JOOBLE']
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
