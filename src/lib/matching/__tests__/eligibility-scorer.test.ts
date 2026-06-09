/**
 * Unit tests — Eligibility Scorer
 *
 * Covers all three exported pure functions:
 *   scoreSeniority    — title + description → JUNIOR | MID | SENIOR | UNKNOWN
 *   detectSubDomain   — title + description → SubDomain[]
 *   scoreSalaryMatch  — job salary range vs. user salary range → verdict
 *
 * No DB I/O, no mocking required — all three functions are synchronous and pure.
 */

import {
  scoreSeniority,
  detectSubDomain,
  scoreSalaryMatch,
  type SeniorityLevel,
  type SubDomain,
  type SalaryMatchResult,
} from '../eligibility-scorer'

// ---------------------------------------------------------------------------
// scoreSeniority
// ---------------------------------------------------------------------------

describe('scoreSeniority', () => {
  it('classifies a title containing "junior" as JUNIOR', () => {
    expect(scoreSeniority('Junior Security Analyst', '')).toBe<SeniorityLevel>('JUNIOR')
  })

  it('classifies a title containing "senior" as SENIOR', () => {
    expect(scoreSeniority('Senior Penetration Tester', '')).toBe<SeniorityLevel>('SENIOR')
  })

  it('classifies a title containing "principal" as SENIOR', () => {
    expect(scoreSeniority('Principal Security Engineer', '')).toBe<SeniorityLevel>('SENIOR')
  })

  it('classifies a title containing "graduate" as JUNIOR', () => {
    expect(scoreSeniority('Graduate Cyber Security Analyst', '')).toBe<SeniorityLevel>('JUNIOR')
  })

  it('returns UNKNOWN for a title with no seniority signals and empty description', () => {
    expect(scoreSeniority('Cyber Security Analyst', '')).toBe<SeniorityLevel>('UNKNOWN')
  })

  it('classifies "lead" in title as SENIOR', () => {
    expect(scoreSeniority('Security Lead', '')).toBe<SeniorityLevel>('SENIOR')
  })

  it('classifies "trainee" in title as JUNIOR', () => {
    expect(scoreSeniority('Trainee Security Consultant', '')).toBe<SeniorityLevel>('JUNIOR')
  })

  it('falls through to description when title has no signal — senior description', () => {
    expect(
      scoreSeniority('Security Analyst', '5+ years of experience required, extensive experience in SIEM tooling'),
    ).toBe<SeniorityLevel>('SENIOR')
  })

  it('falls through to description when title has no signal — junior description', () => {
    expect(
      scoreSeniority('Security Analyst', 'This is an entry-level role suitable for recent graduates.'),
    ).toBe<SeniorityLevel>('JUNIOR')
  })

  it('returns MID when senior and junior signals conflict in the same listing', () => {
    // Title says senior, description adds graduate — conflict resolves to MID
    expect(
      scoreSeniority('Senior Analyst', 'Also open to graduate applicants and entry-level candidates.'),
    ).toBe<SeniorityLevel>('MID')
  })

  it('returns MID when description contains explicit mid-level language', () => {
    expect(
      scoreSeniority('Security Analyst', 'We are looking for a mid-level analyst with 2-4 years of experience.'),
    ).toBe<SeniorityLevel>('MID')
  })

  it('is case-insensitive on title and description', () => {
    expect(scoreSeniority('SENIOR SECURITY ENGINEER', '')).toBe<SeniorityLevel>('SENIOR')
    expect(scoreSeniority('JUNIOR SOC ANALYST', '')).toBe<SeniorityLevel>('JUNIOR')
  })
})

// ---------------------------------------------------------------------------
// detectSubDomain
// ---------------------------------------------------------------------------

describe('detectSubDomain', () => {
  it('detects PENETRATION_TESTER from penetration testing keywords in title', () => {
    const result = detectSubDomain('Penetration Tester', '')
    expect(result).toContain<SubDomain>('PENETRATION_TESTER')
  })

  it('detects PENETRATION_TESTER from description keywords like "oscp" and "red team"', () => {
    const result = detectSubDomain(
      'Offensive Security Consultant',
      'Must hold OSCP or equivalent. Red team experience required. Cobalt Strike and Metasploit skills advantageous.',
    )
    expect(result).toContain<SubDomain>('PENETRATION_TESTER')
  })

  it('detects SOC_ANALYST from SOC keywords in description', () => {
    const result = detectSubDomain(
      'Cyber Security Analyst',
      'You will work in our SOC monitoring SIEM alerts using Splunk and performing incident response.',
    )
    expect(result).toContain<SubDomain>('SOC_ANALYST')
  })

  it('detects CLOUD_SECURITY from cloud security keywords', () => {
    const result = detectSubDomain(
      'Cloud Security Engineer',
      'Responsible for cloud posture management, CSPM tooling, and AWS security reviews.',
    )
    expect(result).toContain<SubDomain>('CLOUD_SECURITY')
  })

  it('returns an empty array when no sub-domain keywords are present', () => {
    const result = detectSubDomain('Office Manager', 'General office administration duties.')
    expect(result).toEqual([])
  })

  it('returns multiple sub-domains for a multi-discipline role', () => {
    const result = detectSubDomain(
      'Security Engineer',
      'Role involves penetration testing, cloud security architecture, and application security reviews including SAST/DAST.',
    )
    expect(result).toContain<SubDomain>('PENETRATION_TESTER')
    expect(result).toContain<SubDomain>('CLOUD_SECURITY')
    expect(result).toContain<SubDomain>('APP_SEC')
  })

  it('detects GRC_COMPLIANCE from compliance-specific keywords', () => {
    const result = detectSubDomain(
      'GRC Analyst',
      'Assess client compliance against ISO 27001, NIST, and GDPR frameworks. Conduct audits and policy reviews.',
    )
    expect(result).toContain<SubDomain>('GRC_COMPLIANCE')
  })

  it('is case-insensitive for keyword matching', () => {
    const result = detectSubDomain('PENETRATION TESTER', 'OSCP CERTIFIED PROFESSIONAL')
    expect(result).toContain<SubDomain>('PENETRATION_TESTER')
  })
})

// ---------------------------------------------------------------------------
// scoreSalaryMatch
// ---------------------------------------------------------------------------

describe('scoreSalaryMatch', () => {
  // User range: 60,000 – 90,000 for all tests below unless noted

  it('returns MATCH when job salary range overlaps with user range', () => {
    // Job: 70k-80k fully inside user range 60k-90k
    expect(scoreSalaryMatch(70_000, 80_000, 60_000, 90_000)).toBe<SalaryMatchResult>('MATCH')
  })

  it('returns MATCH when ranges partially overlap (job straddles upper bound)', () => {
    // Job: 80k-100k, user: 60k-90k → overlap at 80k-90k
    expect(scoreSalaryMatch(80_000, 100_000, 60_000, 90_000)).toBe<SalaryMatchResult>('MATCH')
  })

  it('returns BELOW when job max is below user min', () => {
    // Job: 25k-35k, user: 60k-90k — no overlap, job entirely below
    expect(scoreSalaryMatch(25_000, 35_000, 60_000, 90_000)).toBe<SalaryMatchResult>('BELOW')
  })

  it('returns ABOVE when job min is above user max', () => {
    // Job: 100k-130k, user: 60k-90k — no overlap, job entirely above
    expect(scoreSalaryMatch(100_000, 130_000, 60_000, 90_000)).toBe<SalaryMatchResult>('ABOVE')
  })

  it('returns UNKNOWN when both salary bounds are null', () => {
    expect(scoreSalaryMatch(null, null, 60_000, 90_000)).toBe<SalaryMatchResult>('UNKNOWN')
  })

  it('uses only the disclosed bound when jobSalaryMin is null', () => {
    // Job discloses only max (80k), treated as exact salary 80k-80k → inside user range
    expect(scoreSalaryMatch(null, 80_000, 60_000, 90_000)).toBe<SalaryMatchResult>('MATCH')
  })

  it('uses only the disclosed bound when jobSalaryMax is null', () => {
    // Job discloses only min (70k), treated as exact salary 70k-70k → inside user range
    expect(scoreSalaryMatch(70_000, null, 60_000, 90_000)).toBe<SalaryMatchResult>('MATCH')
  })

  it('returns BELOW when only disclosed bound is below user min', () => {
    // Job discloses only max (30k) → below user 60k min
    expect(scoreSalaryMatch(null, 30_000, 60_000, 90_000)).toBe<SalaryMatchResult>('BELOW')
  })

  it('returns MATCH when exact salary equals user min boundary', () => {
    // Boundary condition: job discloses only min (60k) = user min (60k) → overlap at one point
    expect(scoreSalaryMatch(60_000, null, 60_000, 90_000)).toBe<SalaryMatchResult>('MATCH')
  })

  it('handles an inverted user salary range gracefully', () => {
    // User accidentally provides min > max — function should normalise and still score
    // Job 70k-80k, user "min"=90k "max"=60k (inverted) — after normalise: user 60k-90k → MATCH
    expect(scoreSalaryMatch(70_000, 80_000, 90_000, 60_000)).toBe<SalaryMatchResult>('MATCH')
  })
})
