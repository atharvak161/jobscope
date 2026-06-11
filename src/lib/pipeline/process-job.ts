/**
 * Job Processing Pipeline
 *
 * Orchestrates the three core enrichment modules for every raw job listing:
 *   1. Sponsor matcher  — can this employer sponsor a Skilled Worker visa?
 *   2. Clearance detector — does this role require UK security clearance?
 *   3. Eligibility scorer — seniority level, sub-domain, salary match
 *
 * This is the single function that job-fetching workers call per ingested job.
 *
 * NOTE: ProcessedJob is designed for DB insert via the Integration Engineer's
 * data layer. When Prisma schema lands, the ProcessedJob fields map 1:1 to
 * the `jobs` table columns. The function signature is intentionally stable —
 * the Integration Engineer may wrap this in their own service layer, or call
 * it directly from a pg-boss worker.
 *
 * USER SALARY DEFAULTS: until Atharva sets preferences in the DB, the
 * pipeline uses the constants defined in USER_SALARY_DEFAULTS. These are
 * overridden at call time when the caller provides a userProfile argument.
 */

import {
  matchJobToSponsor,
  type SponsorMatchResult,
} from '@/lib/matching/sponsor-matcher'
import {
  detectClearanceRequirement,
  type ClearanceDetectionResult,
} from '@/lib/matching/clearance-detector'
import {
  scoreSeniority,
  detectSubDomain,
  scoreSalaryMatch,
  type SeniorityLevel,
  type SubDomain,
  type SalaryMatchResult,
} from '@/lib/matching/eligibility-scorer'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Raw job listing as ingested from a job-board API adapter.
 * Mirrors the raw_job_ingestion table row shape; all string fields may be
 * empty strings (never undefined) after the adapter's normalisation pass.
 */
export interface RawJobListing {
  /** Unique identifier assigned by the adapter (source-specific ID) */
  externalId: string
  /** Source adapter identifier, e.g. "adzuna" | "reed" | "jooble" | "rss" */
  source: string
  /** Job title as returned by the source */
  title: string
  /** Employer / company name as returned by the source */
  companyName: string
  /** Full description text; may be HTML-stripped or raw HTML */
  description: string
  /** Location string as returned by the source */
  location: string
  /** Minimum salary in annual GBP, null if not disclosed */
  salaryMin: number | null
  /** Maximum salary in annual GBP, null if not disclosed */
  salaryMax: number | null
  /** ISO-8601 date string when the job was posted */
  postedAt: string
  /** Direct URL to the job listing */
  listingUrl: string
  /** SHA-256 content hash (title + employer + location + description[:200]) */
  contentHash: string
}

// ---------------------------------------------------------------------------
// User profile subset used for eligibility scoring
// ---------------------------------------------------------------------------

/**
 * Minimal slice of the user profile required by the pipeline.
 * When a full profile exists (status = ACTIVE), callers should pass these
 * values extracted from the profile. Defaults are used when profile is absent.
 */
export interface UserProfileForScoring {
  salaryMin: number
  salaryMax: number
}

/** Fallback salary range until Atharva sets preferences */
const USER_SALARY_DEFAULTS: UserProfileForScoring = {
  salaryMin: 60_000,
  salaryMax: 120_000,
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Enriched, normalised job ready for DB insert into the `jobs` table.
 * All processing decisions are recorded here so every match/flag is traceable.
 */
export interface ProcessedJob {
  // --- Identity ---
  externalId: string
  source: string
  contentHash: string

  // --- Content (normalised) ---
  title: string
  companyName: string
  /** Normalised company name (legal suffixes stripped, lowercased) */
  companyNameNormalised: string
  description: string
  location: string
  postedAt: string
  listingUrl: string

  // --- Salary ---
  salaryMin: number | null
  salaryMax: number | null

  // --- Sponsor matching ---
  sponsorConfidence: SponsorMatchResult['confidence']
  matchedSponsorId: string | undefined
  sponsorMatchReason: string

  // --- Clearance detection ---
  clearanceRequirement: ClearanceDetectionResult['requirement']
  clearanceSignal: ClearanceDetectionResult['signal']
  clearanceMatchedKeywords: string[]

  // --- Eligibility scoring ---
  seniority: SeniorityLevel
  subDomains: SubDomain[]
  salaryMatch: SalaryMatchResult

  /** Normalised location enum, derived from the raw location string */
  locationNormalised: 'LONDON' | 'REMOTE' | 'HYBRID' | 'UK_OTHER' | 'UNKNOWN'

  /**
   * Composite eligibility score (0–100).
   * Calculated from the individual scorer outputs; higher = better match.
   * This score drives feed ordering.
   */
  eligibilityScore: number

  /**
   * Whether this job should appear in Atharva's feed.
   * false if: clearanceRequirement = REQUIRED (can be overridden by user
   * preference settings). UNKNOWN sponsor confidence does NOT hide a job —
   * it means "unverified", not "rejected"; the user filters on the badge.
   */
  feedVisible: boolean

  /** ISO-8601 timestamp when this processing run completed */
  processedAt: string
}

// ---------------------------------------------------------------------------
// Eligibility score calculation
// ---------------------------------------------------------------------------

/**
 * Compute a 0–100 composite eligibility score from the individual signals.
 *
 * Weights are intentionally simple for v1 and can be tuned once Atharva
 * has real data. The score is used only for feed ordering, not filtering.
 *
 * Components:
 *   - Sponsor confidence (40 pts): CONFIRMED=40, LIKELY=25, UNKNOWN=0
 *   - Clearance status  (30 pts): NONE_DETECTED=30, PREFERRED=15, REQUIRED=0
 *   - Salary match      (20 pts): MATCH=20, UNKNOWN=10, ABOVE=5, BELOW=0
 *   - Sub-domain match  (10 pts): any match = 10, no match = 0
 */
function calculateEligibilityScore(
  sponsor: SponsorMatchResult['confidence'],
  clearance: ClearanceDetectionResult['requirement'],
  salary: SalaryMatchResult,
  subDomains: SubDomain[],
): number {
  let score = 0

  // Sponsor (40 pts)
  if (sponsor === 'CONFIRMED') score += 40
  else if (sponsor === 'LIKELY') score += 25
  // UNKNOWN = 0

  // Clearance (30 pts)
  if (clearance === 'NONE_DETECTED') score += 30
  else if (clearance === 'PREFERRED') score += 15
  // REQUIRED = 0

  // Salary (20 pts)
  if (salary === 'MATCH') score += 20
  else if (salary === 'UNKNOWN') score += 10
  else if (salary === 'ABOVE') score += 5
  // BELOW = 0

  // Sub-domain (10 pts)
  if (subDomains.length > 0) score += 10

  return score
}

/**
 * Determine feed visibility.
 * A job is hidden by default if:
 *   - clearance is REQUIRED (cannot apply as non-UK national)
 *
 * Sponsor confidence does NOT hide a job here. UNKNOWN means "unverified",
 * not "rejected" — the employer may simply not be matched yet (the sponsor
 * DB lookups currently return null, so every job resolves to UNKNOWN). The
 * UI still surfaces the sponsor badge so the user can filter on it. Only a
 * confirmed non-sponsor (handled at the filter layer, not here) should be
 * suppressed when the user opts into sponsor-only filtering.
 */
function calculateFeedVisible(
  sponsor: SponsorMatchResult['confidence'],
  clearance: ClearanceDetectionResult['requirement'],
): boolean {
  if (clearance === 'REQUIRED') return false
  return true
}

// ---------------------------------------------------------------------------
// Location normalisation
// ---------------------------------------------------------------------------

/**
 * Classify a raw location string into a canonical LocationType enum value.
 * Used to populate the DB `locationNormalised` column so filters work correctly.
 */
function normaliseLocation(raw: string): 'LONDON' | 'REMOTE' | 'HYBRID' | 'UK_OTHER' | 'UNKNOWN' {
  const l = raw.toLowerCase()
  if (l.includes('london')) return 'LONDON'
  if (l.includes('remote')) return 'REMOTE'
  if (l.includes('hybrid')) return 'HYBRID'
  if (
    l.includes('uk') ||
    l.includes('united kingdom') ||
    l.includes('england') ||
    l.includes('manchester') ||
    l.includes('birmingham') ||
    l.includes('edinburgh') ||
    l.includes('bristol') ||
    l.includes('leeds') ||
    l.includes('glasgow') ||
    l.includes('sheffield') ||
    l.includes('liverpool') ||
    l.includes('cambridge') ||
    l.includes('oxford') ||
    l.includes('reading') ||
    l.includes('guildford') ||
    l.includes('cheltenham') ||
    l.includes('cardiff') ||
    l.includes('belfast')
  ) return 'UK_OTHER'
  return 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Process a single raw job listing through all enrichment modules.
 *
 * This function is safe to call concurrently (no shared mutable state).
 * Each call is independent and produces a fully self-contained ProcessedJob.
 *
 * @param raw          Raw job listing from an adapter
 * @param userProfile  Optional user salary profile; defaults to USER_SALARY_DEFAULTS
 */
export async function processRawJob(
  raw: RawJobListing,
  userProfile: UserProfileForScoring = USER_SALARY_DEFAULTS,
): Promise<ProcessedJob> {
  // -------------------------------------------------------------------------
  // Run all three enrichment modules
  // Sponsor matching is async (DB I/O); others are synchronous.
  // Run them in sequence to keep error attribution clear.
  // -------------------------------------------------------------------------

  // 1. Sponsor matching
  const sponsorResult = await matchJobToSponsor(raw.companyName, raw.description)

  // 2. Clearance detection (sync)
  const clearanceResult = detectClearanceRequirement(raw.title, raw.description)

  // 3. Eligibility scoring (sync)
  const seniority = scoreSeniority(raw.title, raw.description)
  const subDomains = detectSubDomain(raw.title, raw.description)
  const salaryMatch = scoreSalaryMatch(
    raw.salaryMin,
    raw.salaryMax,
    userProfile.salaryMin,
    userProfile.salaryMax,
  )

  // 4. Composite scoring
  const eligibilityScore = calculateEligibilityScore(
    sponsorResult.confidence,
    clearanceResult.requirement,
    salaryMatch,
    subDomains,
  )
  const feedVisible = calculateFeedVisible(
    sponsorResult.confidence,
    clearanceResult.requirement,
  )

  // 5. Import normalise util for DB storage
  // Re-use the normalisation function from sponsor-matcher to avoid divergence
  const { normaliseCompanyName } = await import('@/lib/matching/sponsor-matcher')
  const companyNameNormalised = normaliseCompanyName(raw.companyName)

  // 6. Normalise location
  const locationNormalised = normaliseLocation(raw.location)

  return {
    // Identity
    externalId: raw.externalId,
    source: raw.source,
    contentHash: raw.contentHash,

    // Content
    title: raw.title,
    companyName: raw.companyName,
    companyNameNormalised,
    description: raw.description,
    location: raw.location,
    locationNormalised,
    postedAt: raw.postedAt,
    listingUrl: raw.listingUrl,

    // Salary
    salaryMin: raw.salaryMin,
    salaryMax: raw.salaryMax,

    // Sponsor
    sponsorConfidence: sponsorResult.confidence,
    matchedSponsorId: sponsorResult.matchedSponsorId,
    sponsorMatchReason: sponsorResult.matchReason,

    // Clearance
    clearanceRequirement: clearanceResult.requirement,
    clearanceSignal: clearanceResult.signal,
    clearanceMatchedKeywords: clearanceResult.matchedKeywords,

    // Eligibility
    seniority,
    subDomains,
    salaryMatch,
    eligibilityScore,
    feedVisible,

    // Metadata
    processedAt: new Date().toISOString(),
  }
}
