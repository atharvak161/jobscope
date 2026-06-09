/**
 * GET /api/jobs — paginated, filtered job feed
 *
 * Query parameters:
 *   q            string     — keyword search against title + employer + description
 *   location     string     — default "London" — raw location string contains match
 *   salaryMin    number     — filter jobs where salaryMaxGbp >= salaryMin
 *   salaryMax    number     — filter jobs where salaryMinGbp <= salaryMax
 *   seniority    string     — comma-separated: JUNIOR,MID,SENIOR
 *   subDomain    string     — comma-separated sub-domain values
 *   sponsorConfidence string — comma-separated: CONFIRMED,LIKELY,UNKNOWN
 *   excludeSC    boolean    — default true — exclude scClearanceRequired REQUIRED jobs
 *   page         number     — default 1
 *   limit        number     — default 20, max 50
 *
 * Returns: { jobs, total, page, totalPages }
 *
 * Security:
 *   - Auth required — 401 if no session
 *   - excludeSC=true is the default — SC_REQUIRED jobs are never shown unless
 *     caller explicitly passes excludeSC=false (power-user override)
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §5 (Job feed endpoints)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getSession } from '@/lib/auth'
import { Prisma, $Enums } from '@/generated/prisma/client'

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20
const DEFAULT_PAGE = 1

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth gate
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE)
  const limitRaw = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw))
  const skip = (page - 1) * limit

  // ── Filters ───────────────────────────────────────────────────────────────
  const q = searchParams.get('q')?.trim() || undefined
  const salaryMinParam = searchParams.get('salaryMin')
  const salaryMaxParam = searchParams.get('salaryMax')
  const salaryMin = salaryMinParam ? parseInt(salaryMinParam, 10) : undefined
  const salaryMax = salaryMaxParam ? parseInt(salaryMaxParam, 10) : undefined

  // excludeSC defaults to true — a missing or non-"false" value means exclude
  const excludeSCParam = searchParams.get('excludeSC')
  const excludeSC = excludeSCParam !== 'false'

  // Comma-separated enum lists
  const seniorityParam = searchParams.get('seniority')
  const seniorityValues = seniorityParam
    ? seniorityParam.split(',').map(s => s.trim()).filter(Boolean) as $Enums.Seniority[]
    : undefined

  const subDomainParam = searchParams.get('subDomain')
  const subDomainValues = subDomainParam
    ? subDomainParam.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const sponsorConfidenceParam = searchParams.get('sponsorConfidence')
  const sponsorConfidenceValues = sponsorConfidenceParam
    ? sponsorConfidenceParam.split(',').map(s => s.trim()).filter(Boolean) as $Enums.SponsorConfidence[]
    : undefined

  // ── Build WHERE clause ────────────────────────────────────────────────────
  const where: Prisma.JobWhereInput = {
    isActive: true,
    feedVisible: true,
  }

  // Keyword search: title OR employer OR description contains query string
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { employer: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  // SC clearance exclusion — hard requirement, never show REQUIRED jobs in default view
  if (excludeSC) {
    where.clearanceStatus = { not: $Enums.ClearanceStatus.REQUIRED }
  }

  // Salary range: job's max salary >= caller's min, and job's min salary <= caller's max
  if (salaryMin !== undefined && !isNaN(salaryMin)) {
    where.salaryMaxGbp = { gte: salaryMin }
  }
  if (salaryMax !== undefined && !isNaN(salaryMax)) {
    where.salaryMinGbp = { lte: salaryMax }
  }

  // Seniority filter (multi-value)
  if (seniorityValues && seniorityValues.length > 0) {
    where.seniority = { in: seniorityValues }
  }

  // Sub-domain filter (multi-value)
  if (subDomainValues && subDomainValues.length > 0) {
    where.subDomain = { in: subDomainValues }
  }

  // Sponsor confidence filter — applied via sponsorMatches relation
  if (sponsorConfidenceValues && sponsorConfidenceValues.length > 0) {
    where.sponsorMatches = {
      some: {
        confidenceTier: { in: sponsorConfidenceValues },
      },
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      skip,
      take: limit,
      include: {
        sponsorMatches: {
          include: { sponsor: true },
        },
      },
    }),
    prisma.job.count({ where }),
  ])

  return NextResponse.json({
    jobs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
