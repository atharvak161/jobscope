/**
 * Sponsor Matcher
 *
 * Matches a job listing's company name against the UK gov.uk Register of
 * Licensed Sponsors to determine whether the employer is likely to offer
 * Skilled Worker visa sponsorship.
 *
 * NOTE: DB calls are marked TODO — Prisma schema is being built in parallel
 * by the DB Engineer. When prisma/schema.prisma lands, replace the TODO
 * stubs with the real Prisma client calls shown in the comments.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SponsorConfidence = 'CONFIRMED' | 'LIKELY' | 'UNKNOWN'

export interface SponsorMatchResult {
  confidence: SponsorConfidence
  matchedSponsorId?: string
  matchReason: string
}

// ---------------------------------------------------------------------------
// Stub types — remove once Prisma schema is available
// ---------------------------------------------------------------------------

/** Minimal shape of a SponsorRegister row. Replace with Prisma-generated type. */
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
  // Step 1: Exact match
  // -------------------------------------------------------------------------
  // TODO: replace with Prisma call once schema.prisma is available:
  //
  //   const exact = await prisma.sponsorRegister.findFirst({
  //     where: { nameNormalised: normalised, active: true },
  //     select: { id: true, nameNormalised: true },
  //   })
  //
  const exact: SponsorRegisterRow | null = await _exactMatch(normalised)

  if (exact) {
    return {
      confidence: 'CONFIRMED',
      matchedSponsorId: exact.id,
      matchReason: `Exact normalised name match: "${normalised}" = "${exact.nameNormalised}" (sponsor id: ${exact.id}).`,
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 + 3 + 4: Fuzzy match via pg_trgm
  // -------------------------------------------------------------------------
  // TODO: replace with raw Prisma query once schema.prisma is available:
  //
  //   const fuzzy = await prisma.$queryRaw<SponsorRegisterRow[]>`
  //     SELECT id, name, name_normalised AS "nameNormalised",
  //            similarity(name_normalised, ${normalised}) AS similarity
  //     FROM "SponsorRegister"
  //     WHERE active = true
  //       AND similarity(name_normalised, ${normalised}) > 0.60
  //     ORDER BY similarity DESC
  //     LIMIT 1
  //   `
  //   const best = fuzzy[0] ?? null
  //
  const best: (SponsorRegisterRow & { similarity: number }) | null =
    await _fuzzyMatch(normalised)

  const mentionsSponsorship = descriptionMentionsSponsorship(jobDescription)

  if (best) {
    const sim = best.similarity

    if (sim >= 0.85) {
      if (mentionsSponsorship) {
        return {
          confidence: 'CONFIRMED',
          matchedSponsorId: best.id,
          matchReason: `Fuzzy match similarity ${sim.toFixed(3)} ≥ 0.85 AND description explicitly mentions sponsorship/Skilled Worker/Tier 2 (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
        }
      }
      return {
        confidence: 'LIKELY',
        matchedSponsorId: best.id,
        matchReason: `Fuzzy match similarity ${sim.toFixed(3)} ≥ 0.85, no explicit sponsorship mention in description (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
      }
    }

    if (sim >= 0.6) {
      // Low confidence — flag for manual review but don't surface as LIKELY
      return {
        confidence: 'UNKNOWN',
        matchedSponsorId: best.id,
        matchReason: `Low-confidence fuzzy match similarity ${sim.toFixed(3)} (0.60–0.84) — flagged for manual review (sponsor id: ${best.id}, matched name: "${best.nameNormalised}").`,
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
// DB stub implementations — replace with Prisma calls post-schema delivery
// ---------------------------------------------------------------------------

/**
 * TODO: Replace with Prisma ORM call.
 * Stub returns null (no match) until DB layer is wired.
 */
async function _exactMatch(normalised: string): Promise<SponsorRegisterRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void normalised
  // TODO: prisma.sponsorRegister.findFirst({ where: { nameNormalised: normalised, active: true } })
  return null
}

/**
 * TODO: Replace with Prisma $queryRaw pg_trgm call.
 * Stub returns null (no match) until DB layer is wired.
 */
async function _fuzzyMatch(
  normalised: string,
): Promise<(SponsorRegisterRow & { similarity: number }) | null> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void normalised
  // TODO: prisma.$queryRaw`SELECT ... similarity(name_normalised, ${normalised}) ... FROM "SponsorRegister" WHERE similarity(...) > 0.60 ORDER BY similarity DESC LIMIT 1`
  return null
}
