/**
 * Sponsor Matcher
 *
 * Matches a job listing's company name against the UK gov.uk Register of
 * Licensed Sponsors to determine whether the employer is likely to offer
 * Skilled Worker visa sponsorship.
 *
 * Resolution order:
 *   1. Exact match on normalised name + sponsorship mention in description → CONFIRMED
 *   2. Exact match on normalised name, no mention → LIKELY
 *   3. pg_trgm similarity ≥ 0.85 + sponsorship mention → CONFIRMED
 *   4. pg_trgm similarity ≥ 0.85, no mention → LIKELY
 *   5. pg_trgm similarity 0.60–0.84 → LOW_CONFIDENCE
 *   6. No DB match + description mentions sponsorship → LIKELY
 *   7. No match, no mention → UNKNOWN
 */

import { prisma } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SponsorConfidence = 'CONFIRMED' | 'LIKELY' | 'LOW_CONFIDENCE' | 'UNKNOWN'

export interface SponsorMatchResult {
  confidence: SponsorConfidence
  matchedSponsorId?: string
  matchReason: string
}

// ---------------------------------------------------------------------------
// Internal row shape returned from DB queries
// ---------------------------------------------------------------------------

interface SponsorRegisterRow {
  id: string
  name: string
  nameNormalised: string
  similarity?: number
}

// ---------------------------------------------------------------------------
// Normalisation utility
// ---------------------------------------------------------------------------

/**
 * Normalise a company name for sponsor-register matching.
 *
 * Strip common legal suffixes, lowercase, collapse whitespace, strip
 * punctuation. Must match the normalisation applied when the sponsor
 * register is imported (Integration Engineer: normalise on import using
 * this same function or a copy committed to src/lib/utils/normalise.ts).
 *
 * @param name Raw company name from a job listing
 * @returns Normalised string suitable for equality/similarity comparison
 */
export function normaliseCompanyName(name: string): string {
  return name
    // Strip common legal suffixes (word-boundary aware).
    // Only strip genuine legal entity suffixes and generic geographic/scope
    // qualifiers (uk, gb, international). Do NOT strip trading-name words
    // like "holdings" or "group" — they may be the company's actual name.
    .replace(
      /\b(limited|ltd\.?|public limited company|plc\.?|llp\.?|inc\.?|corp\.?|corporation|llc\.?|international|uk|gb)\b/gi,
      '',
    )
    // Strip punctuation (keep alphanumeric and spaces)
    .replace(/[^a-z0-9\s]/gi, '')
    // Lowercase
    .toLowerCase()
    // Trim leading/trailing whitespace only — internal spacing is preserved
    // so that punctuation removal produces predictable gaps (e.g. "Acme &
    // Partners" → "acme  partners" with the double-space where "&" was).
    .trim()
}

// ---------------------------------------------------------------------------
// Sponsorship mention detection
// ---------------------------------------------------------------------------

const SPONSORSHIP_KEYWORDS = [
  'sponsorship',
  'skilled worker',
  'tier 2',
  'sponsorship available',
  'visa sponsorship',
  'certificate of sponsorship',
  'cos',
]

/**
 * Returns true if the job description explicitly mentions sponsorship or the
 * Skilled Worker / Tier 2 visa route.
 */
function descriptionMentionsSponsorship(description: string): boolean {
  const lower = description.toLowerCase()
  return SPONSORSHIP_KEYWORDS.some((kw) => lower.includes(kw))
}

// ---------------------------------------------------------------------------
// Main matcher
// ---------------------------------------------------------------------------

/**
 * Match a job listing's employer to the gov.uk sponsor register.
 *
 * Resolution order:
 *   1. Exact match on normalised name → CONFIRMED
 *   2. pg_trgm similarity ≥ 0.85 + sponsorship mention → CONFIRMED
 *   3. pg_trgm similarity ≥ 0.85, no mention → LIKELY
 *   4. pg_trgm similarity 0.60–0.84 → UNKNOWN (low confidence, flagged)
 *   5. No DB match + description mentions sponsorship → LIKELY
 *   6. No match, no mention → UNKNOWN
 *
 * @param companyName  Raw employer name from the job listing
 * @param jobDescription  Full job description text
 */
export async function matchJobToSponsor(
  companyName: string,
  jobDescription: string,
): Promise<SponsorMatchResult> {
  const normalised = normaliseCompanyName(companyName)

  if (!normalised) {
    return {
      confidence: 'UNKNOWN',
      matchReason: 'Company name could not be normalised to a matchable string.',
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Exact match on normalised name
  // -------------------------------------------------------------------------
  const exact: SponsorRegisterRow | null = await _exactMatch(normalised)
  const mentionsSponsorship = descriptionMentionsSponsorship(jobDescription)

  if (exact) {
    if (mentionsSponsorship) {
      return {
        confidence: 'CONFIRMED',
        matchedSponsorId: exact.id,
        matchReason: `Exact normalised name match: "${normalised}" = "${exact.nameNormalised}" AND description mentions sponsorship (sponsor id: ${exact.id}).`,
      }
    }
    return {
      confidence: 'LIKELY',
      matchedSponsorId: exact.id,
      matchReason: `Exact normalised name match: "${normalised}" = "${exact.nameNormalised}", no explicit sponsorship mention in description (sponsor id: ${exact.id}).`,
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 + 3 + 4: Fuzzy match via pg_trgm
  // -------------------------------------------------------------------------
  const best: (SponsorRegisterRow & { similarity: number }) | null =
    await _fuzzyMatch(normalised)

  if (best) {
    const sim = best.similarity

    if (sim >= 0.85) {
      if (mentionsSponsorship) {
        return {
          confidence: 'CONFIRMED',
          matchedSponsorId: best.id,
          matchReason: `Fuzzy match similarity ${sim.toFixed(3)} ≥ 0.85 AND description mentions sponsorship (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
        }
      }
      return {
        confidence: 'LIKELY',
        matchedSponsorId: best.id,
        matchReason: `Fuzzy match similarity ${sim.toFixed(3)} ≥ 0.85, no explicit sponsorship mention (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
      }
    }

    if (sim >= 0.6) {
      return {
        confidence: 'LOW_CONFIDENCE',
        matchedSponsorId: best.id,
        matchReason: `Low-confidence fuzzy match similarity ${sim.toFixed(3)} (0.60–0.84) — partial register match (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5 + 6: No DB match
  // -------------------------------------------------------------------------
  if (mentionsSponsorship) {
    return {
      confidence: 'LIKELY',
      matchReason:
        'No register match found, but description explicitly mentions sponsorship/Skilled Worker/Tier 2 — self-declared, unverified against register.',
    }
  }

  return {
    confidence: 'UNKNOWN',
    matchReason:
      'No register match found and no sponsorship language in description.',
  }
}

// ---------------------------------------------------------------------------
// DB implementations — real Prisma lookups
// ---------------------------------------------------------------------------

/**
 * Exact match: case-insensitive lookup on normalised company name.
 * Returns the first active SponsorRegister row whose nameNormalised equals
 * the supplied normalised string, or null if no match.
 */
async function _exactMatch(normalised: string): Promise<SponsorRegisterRow | null> {
  const row = await prisma.sponsorRegister.findFirst({
    where: { nameNormalised: normalised, active: true },
    select: { id: true, name: true, nameNormalised: true },
  })
  return row ?? null
}

/**
 * Fuzzy match via pg_trgm similarity on the normalised name column.
 * Returns the best-scoring active row with similarity > 0.60, or null.
 *
 * Requires: pg_trgm extension + GIN index on "nameNormalised" (003_trgm_index.sql).
 */
async function _fuzzyMatch(
  normalised: string,
): Promise<(SponsorRegisterRow & { similarity: number }) | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; nameNormalised: string; similarity: number }>>`
    SELECT
      id,
      name,
      "nameNormalised",
      similarity("nameNormalised", ${normalised}) AS similarity
    FROM "SponsorRegister"
    WHERE active = true
      AND similarity("nameNormalised", ${normalised}) > 0.60
    ORDER BY similarity DESC
    LIMIT 1
  `
  return rows[0] ?? null
}
