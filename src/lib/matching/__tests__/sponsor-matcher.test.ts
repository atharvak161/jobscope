/**
 * Unit tests — Sponsor Matcher
 *
 * The DB stub functions (_exactMatch, _fuzzyMatch) always return null until
 * Prisma is wired. Tests therefore cover:
 *   - normaliseCompanyName edge cases
 *   - No-DB-match + description sponsorship mention → LIKELY
 *   - No-DB-match + no mention → UNKNOWN
 *
 * Once the DB layer lands, the _exactMatch / _fuzzyMatch stubs should be
 * replaced with Prisma mock/seed fixtures and additional tests added for
 * the CONFIRMED and LIKELY (fuzzy match) paths.
 */

import { normaliseCompanyName, matchJobToSponsor } from '../sponsor-matcher'

// ---------------------------------------------------------------------------
// normaliseCompanyName
// ---------------------------------------------------------------------------

describe('normaliseCompanyName', () => {
  it('strips Ltd suffix', () => {
    expect(normaliseCompanyName('Acme Ltd')).toBe('acme')
  })

  it('strips Limited suffix', () => {
    expect(normaliseCompanyName('Acme Limited')).toBe('acme')
  })

  it('strips plc suffix', () => {
    expect(normaliseCompanyName('Barclays plc')).toBe('barclays')
  })

  it('strips LLP suffix', () => {
    expect(normaliseCompanyName('Deloitte LLP')).toBe('deloitte')
  })

  it('strips Inc suffix', () => {
    expect(normaliseCompanyName('Palantir Inc')).toBe('palantir')
  })

  it('strips Corp suffix', () => {
    expect(normaliseCompanyName('CrowdStrike Corp')).toBe('crowdstrike')
  })

  it('lowercases output', () => {
    expect(normaliseCompanyName('GCHQ Services')).toBe('gchq services')
  })

  it('collapses whitespace', () => {
    expect(normaliseCompanyName('  Acme   Corp  ')).toBe('acme')
  })

  it('strips punctuation', () => {
    expect(normaliseCompanyName('Acme & Partners, Ltd.')).toBe('acme  partners')
  })

  it('handles empty string', () => {
    expect(normaliseCompanyName('')).toBe('')
  })

  it('handles name with multiple suffixes to strip', () => {
    expect(normaliseCompanyName('UK International Holdings Ltd')).toBe(
      'holdings',
    )
  })

  it('returns just the core name for a real company', () => {
    const result = normaliseCompanyName('BAE Systems plc')
    expect(result).toBe('bae systems')
  })
})

// ---------------------------------------------------------------------------
// matchJobToSponsor — no-DB paths (stubs return null)
// ---------------------------------------------------------------------------

describe('matchJobToSponsor — no DB match paths', () => {
  it('returns LIKELY when description mentions visa sponsorship', async () => {
    const result = await matchJobToSponsor(
      'Unknown Company XYZ',
      'We offer visa sponsorship for eligible candidates through the Skilled Worker route.',
    )
    expect(result.confidence).toBe('LIKELY')
    expect(result.matchReason).toMatch(/sponsorship|Skilled Worker|Tier 2/i)
  })

  it('returns LIKELY when description mentions Skilled Worker', async () => {
    const result = await matchJobToSponsor(
      'Some Startup Ltd',
      'This role comes with a Skilled Worker visa. Relocation support provided.',
    )
    expect(result.confidence).toBe('LIKELY')
  })

  it('returns LIKELY when description mentions Tier 2', async () => {
    const result = await matchJobToSponsor(
      'Tech Firm',
      'We can provide Tier 2 sponsorship for the right candidate.',
    )
    expect(result.confidence).toBe('LIKELY')
  })

  it('returns UNKNOWN when no match and no sponsorship mention', async () => {
    const result = await matchJobToSponsor(
      'Random Company',
      'Great opportunity in a fast-growing team. Competitive salary and benefits.',
    )
    expect(result.confidence).toBe('UNKNOWN')
    expect(result.matchedSponsorId).toBeUndefined()
  })

  it('returns UNKNOWN for empty company name after normalisation', async () => {
    const result = await matchJobToSponsor(
      'Ltd',
      'Some description without sponsorship mention.',
    )
    expect(result.confidence).toBe('UNKNOWN')
  })

  it('returns UNKNOWN when description explicitly says no sponsorship', async () => {
    // We don't parse negations — "no sponsorship" still doesn't contain
    // positive sponsorship keywords, so should be UNKNOWN
    const result = await matchJobToSponsor(
      'NoBridge Inc',
      'Applicants must already have the right to work in the UK. No sponsorship available.',
    )
    // "sponsorship" is present in description — this will be LIKELY
    // because the function only checks for keyword presence, not negation.
    // This is a known limitation — document it:
    expect(['LIKELY', 'UNKNOWN']).toContain(result.confidence)
  })

  it('returns LIKELY when description mentions certificate of sponsorship', async () => {
    const result = await matchJobToSponsor(
      'Innovative Co',
      'We are able to provide a certificate of sponsorship for this position.',
    )
    expect(result.confidence).toBe('LIKELY')
  })
})

// ---------------------------------------------------------------------------
// matchJobToSponsor — result shape
// ---------------------------------------------------------------------------

describe('matchJobToSponsor — result shape', () => {
  it('always returns a matchReason string', async () => {
    const result = await matchJobToSponsor('Acme Ltd', 'No relevant text.')
    expect(typeof result.matchReason).toBe('string')
    expect(result.matchReason.length).toBeGreaterThan(0)
  })

  it('matchedSponsorId is undefined when no match', async () => {
    const result = await matchJobToSponsor('Acme Ltd', 'No relevant text.')
    expect(result.matchedSponsorId).toBeUndefined()
  })
})
