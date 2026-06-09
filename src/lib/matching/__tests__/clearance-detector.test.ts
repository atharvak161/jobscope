/**
 * Unit tests — Clearance Detector
 *
 * Tests the full keyword surface across REQUIRED, PREFERRED, BPSS, and
 * NONE_DETECTED paths. Also validates the conservative ambiguous-phrase
 * logging behaviour and the signal priority ordering.
 */

import { detectClearanceRequirement } from '../clearance-detector'

// ---------------------------------------------------------------------------
// REQUIRED — SC signals
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — REQUIRED (SC)', () => {
  it('detects "sc clearance" in title', () => {
    const result = detectClearanceRequirement('SC Clearance Required SOC Analyst', '')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('SC')
    expect(result.matchedKeywords).toContain('sc clearance')
  })

  it('detects "sc cleared" in description', () => {
    const result = detectClearanceRequirement('SOC Analyst', 'Candidates must be sc cleared.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "sc required" case-insensitively', () => {
    const result = detectClearanceRequirement('', 'SC REQUIRED to apply.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "eligible for sc"', () => {
    const result = detectClearanceRequirement('', 'You must be eligible for SC clearance.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "sc eligible"', () => {
    const result = detectClearanceRequirement('', 'SC eligible candidates only.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('SC')
  })
})

// ---------------------------------------------------------------------------
// REQUIRED — DV signals
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — REQUIRED (DV)', () => {
  it('detects "developed vetting"', () => {
    const result = detectClearanceRequirement('', 'Developed vetting required for this role.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('DV')
  })

  it('detects "dv cleared"', () => {
    const result = detectClearanceRequirement('DV Cleared Developer', '')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('DV')
  })

  it('detects "dv clearance"', () => {
    const result = detectClearanceRequirement('', 'DV clearance mandatory.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('DV')
  })

  it('DV signal takes priority over SC when both present', () => {
    const result = detectClearanceRequirement(
      '',
      'Must hold dv clearance or at minimum sc clearance.',
    )
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('DV')
  })
})

// ---------------------------------------------------------------------------
// REQUIRED — Generic signals
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — REQUIRED (generic)', () => {
  it('detects "security clearance required"', () => {
    const result = detectClearanceRequirement(
      '',
      'Security clearance required. Please do not apply if you cannot obtain it.',
    )
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('GENERIC')
  })

  it('detects "must hold clearance"', () => {
    const result = detectClearanceRequirement('', 'Must hold clearance before starting.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('GENERIC')
  })

  it('detects "must be clearable"', () => {
    const result = detectClearanceRequirement('', 'Applicants must be clearable to SC level.')
    expect(result.requirement).toBe('REQUIRED')
    expect(['SC', 'GENERIC']).toContain(result.signal)
  })

  it('detects "clearance required"', () => {
    const result = detectClearanceRequirement('', 'Clearance required prior to employment.')
    expect(result.requirement).toBe('REQUIRED')
  })
})

// ---------------------------------------------------------------------------
// REQUIRED — BPSS signals
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — REQUIRED (BPSS)', () => {
  it('detects "bpss"', () => {
    const result = detectClearanceRequirement('', 'All staff must pass BPSS checks.')
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('BPSS')
  })

  it('detects "background check required"', () => {
    const result = detectClearanceRequirement(
      '',
      'A background check required for all new hires.',
    )
    expect(result.requirement).toBe('REQUIRED')
    expect(result.signal).toBe('BPSS')
  })

  it('does NOT elevate BPSS to SC — remains BPSS signal', () => {
    const result = detectClearanceRequirement(
      '',
      'BPSS clearance required. No SC needed.',
    )
    expect(result.signal).toBe('BPSS')
  })
})

// ---------------------------------------------------------------------------
// PREFERRED signals
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — PREFERRED', () => {
  it('detects "sc preferred"', () => {
    const result = detectClearanceRequirement('', 'SC preferred but not essential.')
    expect(result.requirement).toBe('PREFERRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "sc desirable"', () => {
    const result = detectClearanceRequirement('', 'SC desirable. Will consider non-cleared candidates.')
    expect(result.requirement).toBe('PREFERRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "sc advantageous"', () => {
    const result = detectClearanceRequirement('', 'Having SC clearance would be sc advantageous.')
    expect(result.requirement).toBe('PREFERRED')
    expect(result.signal).toBe('SC')
  })

  it('detects "willing to undergo clearance"', () => {
    const result = detectClearanceRequirement(
      '',
      'Willing to undergo clearance checks as part of onboarding.',
    )
    expect(result.requirement).toBe('PREFERRED')
    expect(result.signal).toBe('GENERIC')
  })

  it('detects "clearance advantageous"', () => {
    const result = detectClearanceRequirement('', 'clearance advantageous for this position.')
    expect(result.requirement).toBe('PREFERRED')
  })
})

// ---------------------------------------------------------------------------
// NONE_DETECTED
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — NONE_DETECTED', () => {
  it('returns NONE_DETECTED for a plain cybersecurity job', () => {
    const result = detectClearanceRequirement(
      'Senior SOC Analyst',
      'We are looking for an experienced SOC analyst to join our team. Monitor SIEM alerts and conduct threat hunting.',
    )
    expect(result.requirement).toBe('NONE_DETECTED')
    expect(result.signal).toBe('NONE')
  })

  it('returns NONE_DETECTED for a pentest role without clearance', () => {
    const result = detectClearanceRequirement(
      'Penetration Tester',
      'OSCP required. Red team engagements for commercial clients.',
    )
    expect(result.requirement).toBe('NONE_DETECTED')
    expect(result.signal).toBe('NONE')
  })

  it('returns NONE_DETECTED for empty inputs', () => {
    const result = detectClearanceRequirement('', '')
    expect(result.requirement).toBe('NONE_DETECTED')
    expect(result.signal).toBe('NONE')
    expect(result.matchedKeywords).toEqual([])
  })

  it('REQUIRED takes priority over PREFERRED when both keywords present', () => {
    const result = detectClearanceRequirement(
      '',
      'SC required for this role. SC preferred candidates may also apply for adjacent roles.',
    )
    expect(result.requirement).toBe('REQUIRED')
  })
})

// ---------------------------------------------------------------------------
// Ambiguous phrases — logged for review but not flagged as REQUIRED
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — ambiguous phrases', () => {
  it('does not flag "government sector" as clearance required', () => {
    const result = detectClearanceRequirement(
      'Government Sector Security Analyst',
      'Experience in the government sector preferred.',
    )
    expect(result.requirement).toBe('NONE_DETECTED')
  })

  it('logs ambiguous phrase with [REVIEW] prefix', () => {
    const result = detectClearanceRequirement(
      '',
      'Strong knowledge of government sector compliance frameworks.',
    )
    const reviewKeywords = result.matchedKeywords.filter((k) =>
      k.startsWith('[REVIEW]'),
    )
    expect(reviewKeywords.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// matchedKeywords array
// ---------------------------------------------------------------------------

describe('detectClearanceRequirement — matchedKeywords', () => {
  it('includes all matched REQUIRED keyword patterns', () => {
    const result = detectClearanceRequirement(
      '',
      'Must be sc cleared and dv cleared for this position.',
    )
    expect(result.matchedKeywords).toContain('sc cleared')
    expect(result.matchedKeywords).toContain('dv cleared')
  })

  it('returns empty array when no keywords matched and no ambiguous phrases', () => {
    const result = detectClearanceRequirement(
      'Backend Developer',
      'Build APIs using TypeScript and PostgreSQL.',
    )
    expect(result.matchedKeywords).toEqual([])
  })
})
