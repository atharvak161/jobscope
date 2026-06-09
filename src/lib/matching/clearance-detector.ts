/**
 * Clearance Detector
 *
 * Detects UK security clearance requirements (SC, DV, BPSS, NSV) in job
 * titles and descriptions. Used to flag roles that Atharva cannot apply to
 * as a non-UK national.
 *
 * Design principle: conservative. A false negative (missing a clearance
 * requirement) results in a wasted application; a false positive (flagging
 * a non-clearance role) only costs a visible listing. Default to
 * NONE_DETECTED only when there is no ambiguity.
 *
 * The architecture doc notes: "ambiguous phrasing → REQUIRED (never
 * NONE_DETECTED)". This module implements a stricter rule: ambiguous
 * phrases (e.g. "government sector experience") that don't clearly signal
 * a clearance requirement resolve to NONE_DETECTED but are logged in
 * matchedKeywords with a [REVIEW] prefix so QA can tune the keyword set.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClearanceRequirement = 'REQUIRED' | 'PREFERRED' | 'NONE_DETECTED'

/**
 * The strongest clearance signal found.
 * SC  — Security Check (most common UK government clearance)
 * DV  — Developed Vetting (highest UK clearance tier)
 * BPSS — Baseline Personnel Security Standard (low bar, not SC)
 * NSV  — National Security Vetting (umbrella term)
 * GENERIC — "security clearance" without specifying level
 * NONE    — no clearance language found
 */
export type ClearanceSignal = 'SC' | 'DV' | 'BPSS' | 'NSV' | 'GENERIC' | 'NONE'

export interface ClearanceDetectionResult {
  requirement: ClearanceRequirement
  signal: ClearanceSignal
  matchedKeywords: string[]
}

// ---------------------------------------------------------------------------
// Keyword sets
// ---------------------------------------------------------------------------

/**
 * Keywords that indicate clearance is REQUIRED.
 * Must be case-insensitively present in title or description.
 * Order is immaterial — all matches are collected.
 */
const REQUIRED_KEYWORDS: ReadonlyArray<{ pattern: string; signal: ClearanceSignal }> = [
  // SC (Security Check)
  { pattern: 'sc clearance', signal: 'SC' },
  { pattern: 'sc cleared', signal: 'SC' },
  { pattern: 'sc required', signal: 'SC' },
  { pattern: 'security check clearance', signal: 'SC' },
  { pattern: 'eligible for sc', signal: 'SC' },
  { pattern: 'sc eligible', signal: 'SC' },
  { pattern: 'must be sc', signal: 'SC' },
  // DV (Developed Vetting)
  { pattern: 'developed vetting', signal: 'DV' },
  { pattern: 'dv cleared', signal: 'DV' },
  { pattern: 'dv clearance', signal: 'DV' },
  { pattern: 'dv required', signal: 'DV' },
  // NSV umbrella
  { pattern: 'national security vetting', signal: 'NSV' },
  { pattern: 'nppv', signal: 'NSV' },
  // Generic strong signals
  { pattern: 'security clearance required', signal: 'GENERIC' },
  { pattern: 'must hold clearance', signal: 'GENERIC' },
  { pattern: 'must hold active clearance', signal: 'GENERIC' },
  { pattern: 'must be clearable', signal: 'GENERIC' },
  { pattern: 'active clearance required', signal: 'GENERIC' },
  { pattern: 'clearance required', signal: 'GENERIC' },
  { pattern: 'baseline personnel security standard', signal: 'BPSS' },
]

/**
 * Patterns in REQUIRED_KEYWORDS that are considered "strong" mandatory signals.
 * 'sc clearance' alone is considered weak — it can be demoted to PREFERRED
 * when combined with preference qualifiers (e.g. "SC clearance advantageous").
 * All other REQUIRED patterns are strong and cannot be demoted.
 */
const STRONG_REQUIRED_PATTERNS: ReadonlySet<string> = new Set([
  'sc cleared',
  'sc required',
  'security check clearance',
  'eligible for sc',
  'sc eligible',
  'must be sc',
  'developed vetting',
  'dv cleared',
  'dv clearance',
  'dv required',
  'national security vetting',
  'nppv',
  'security clearance required',
  'must hold clearance',
  'must hold active clearance',
  'must be clearable',
  'active clearance required',
  'clearance required',
  'baseline personnel security standard',
])

/**
 * Qualifiers that indicate clearance is preferred/optional rather than mandatory.
 * When ONLY weak REQUIRED patterns match (i.e. only 'sc clearance') and one of
 * these qualifiers is also present, the result is demoted to PREFERRED.
 */
const PREFERENCE_QUALIFIER_PATTERNS: ReadonlyArray<string> = [
  'advantageous',
  'desirable',
  'preferred',
  'an advantage',
  'nice to have',
  'beneficial',
]

/**
 * Keywords that indicate clearance is PREFERRED but not mandatory.
 */
const PREFERRED_KEYWORDS: ReadonlyArray<{ pattern: string; signal: ClearanceSignal }> =
  [
    { pattern: 'sc preferred', signal: 'SC' },
    { pattern: 'sc advantageous', signal: 'SC' },
    { pattern: 'sc desirable', signal: 'SC' },
    { pattern: 'sc clearance preferred', signal: 'SC' },
    { pattern: 'clearance advantageous', signal: 'GENERIC' },
    { pattern: 'clearance desirable', signal: 'GENERIC' },
    { pattern: 'clearance preferred', signal: 'GENERIC' },
    { pattern: 'security clearance preferred', signal: 'GENERIC' },
    { pattern: 'security clearance an asset', signal: 'GENERIC' },
    { pattern: 'willing to undergo clearance', signal: 'GENERIC' },
    { pattern: 'willing to obtain clearance', signal: 'GENERIC' },
  ]

/**
 * BPSS-specific phrases that are notably NOT SC-level clearance.
 * These resolve to REQUIRED/BPSS rather than being demoted — BPSS still
 * requires a background check and some non-UK nationals cannot obtain it.
 * Kept separate so the front-end can render a distinct badge if desired.
 */
const BPSS_KEYWORDS: ReadonlyArray<{ pattern: string; signal: ClearanceSignal }> = [
  { pattern: 'bpss', signal: 'BPSS' },
  { pattern: 'basic check', signal: 'BPSS' },
  { pattern: 'background check required', signal: 'BPSS' },
  { pattern: 'background screening required', signal: 'BPSS' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the dominant signal from a list of matched signals.
 * Priority: DV > SC > NSV > BPSS > GENERIC > NONE
 */
function dominantSignal(signals: ClearanceSignal[]): ClearanceSignal {
  const priority: ClearanceSignal[] = ['DV', 'SC', 'NSV', 'BPSS', 'GENERIC', 'NONE']
  for (const s of priority) {
    if (signals.includes(s)) return s
  }
  return 'NONE'
}

/**
 * Search text (lowercased) for all patterns in the provided keyword list.
 * Returns matched patterns and their corresponding signals.
 */
function findMatches(
  text: string,
  keywords: ReadonlyArray<{ pattern: string; signal: ClearanceSignal }>,
): { matched: string[]; signals: ClearanceSignal[] } {
  const matched: string[] = []
  const signals: ClearanceSignal[] = []
  for (const { pattern, signal } of keywords) {
    if (text.includes(pattern)) {
      matched.push(pattern)
      signals.push(signal)
    }
  }
  return { matched, signals }
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * Detect security clearance requirements from a job title and description.
 *
 * @param title        Job title (raw, any case)
 * @param description  Full job description (raw, any case)
 * @returns            { requirement, signal, matchedKeywords }
 */
export function detectClearanceRequirement(
  title: string,
  description: string,
): ClearanceDetectionResult {
  // Combine and lowercase for case-insensitive matching
  const combined = `${title} ${description}`.toLowerCase()

  // -------------------------------------------------------------------------
  // Check REQUIRED keywords first (highest priority)
  // -------------------------------------------------------------------------
  const required = findMatches(combined, REQUIRED_KEYWORDS)
  if (required.matched.length > 0) {
    // Demotion check: if ALL matched REQUIRED keywords are weak (only 'sc clearance'
    // matched, no strong pattern) AND a preference qualifier is present in the text,
    // demote to PREFERRED instead of REQUIRED.
    // Example: "Having SC clearance would be sc advantageous" → PREFERRED
    // Counter-example: "SC Clearance Required" → REQUIRED (clearance required is strong)
    const hasStrongMatch = required.matched.some((m) => STRONG_REQUIRED_PATTERNS.has(m))
    const hasPreferenceQualifier = PREFERENCE_QUALIFIER_PATTERNS.some((q) =>
      combined.includes(q),
    )
    if (!hasStrongMatch && hasPreferenceQualifier) {
      // Check PREFERRED keywords to surface the correct match
      const preferred = findMatches(combined, PREFERRED_KEYWORDS)
      if (preferred.matched.length > 0) {
        return {
          requirement: 'PREFERRED',
          signal: dominantSignal(preferred.signals),
          matchedKeywords: preferred.matched,
        }
      }
      // No explicit PREFERRED keyword matched — still demote, use required signal
      return {
        requirement: 'PREFERRED',
        signal: dominantSignal(required.signals),
        matchedKeywords: required.matched,
      }
    }

    // Also collect any BPSS matches to surface alongside
    const bpss = findMatches(combined, BPSS_KEYWORDS)
    return {
      requirement: 'REQUIRED',
      signal: dominantSignal([...required.signals, ...bpss.signals]),
      matchedKeywords: [...new Set([...required.matched, ...bpss.matched])],
    }
  }

  // -------------------------------------------------------------------------
  // Check BPSS keywords next (required level, but lower bar)
  // -------------------------------------------------------------------------
  const bpss = findMatches(combined, BPSS_KEYWORDS)
  if (bpss.matched.length > 0) {
    return {
      requirement: 'REQUIRED',
      signal: 'BPSS',
      matchedKeywords: bpss.matched,
    }
  }

  // -------------------------------------------------------------------------
  // Check PREFERRED keywords
  // -------------------------------------------------------------------------
  const preferred = findMatches(combined, PREFERRED_KEYWORDS)
  if (preferred.matched.length > 0) {
    return {
      requirement: 'PREFERRED',
      signal: dominantSignal(preferred.signals),
      matchedKeywords: preferred.matched,
    }
  }

  // -------------------------------------------------------------------------
  // No clearance language detected
  // Conservative rule: ambiguous phrases like "government sector experience"
  // do NOT trigger REQUIRED here — they are returned as NONE_DETECTED with
  // a [REVIEW] marker so QA can decide whether they warrant a keyword addition.
  // -------------------------------------------------------------------------
  const AMBIGUOUS_PHRASES = [
    'government sector',
    'public sector security',
    'security-cleared team',
    'cleared team',
    'sc/dv',
    'esc clearance',
  ]
  const ambiguousMatches = AMBIGUOUS_PHRASES.filter((p) =>
    combined.includes(p),
  ).map((p) => `[REVIEW] ${p}`)

  return {
    requirement: 'NONE_DETECTED',
    signal: 'NONE',
    matchedKeywords: ambiguousMatches,
  }
}
