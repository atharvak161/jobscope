/**
 * Eligibility Scorer
 *
 * Three independent scoring functions used by the job-processing pipeline:
 *
 *   scoreSeniority    — JUNIOR / MID / SENIOR / UNKNOWN from title + description
 *   detectSubDomain   — one or more cybersecurity sub-domains from title + description
 *   scoreSalaryMatch  — MATCH / BELOW / ABOVE / UNKNOWN vs. user salary range
 *
 * All functions are pure (no DB I/O, no async) for easy unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeniorityLevel = 'JUNIOR' | 'MID' | 'SENIOR' | 'UNKNOWN'

export type SubDomain =
  | 'SOC_ANALYST'
  | 'PENETRATION_TESTER'
  | 'GRC_COMPLIANCE'
  | 'APP_SEC'
  | 'CLOUD_SECURITY'
  | 'VULN_MANAGEMENT'
  | 'THREAT_INTEL'
  | 'INFRASTRUCTURE_SECURITY'

export type SalaryMatchResult = 'MATCH' | 'BELOW' | 'ABOVE' | 'UNKNOWN'

// ---------------------------------------------------------------------------
// Seniority scoring
// ---------------------------------------------------------------------------

const JUNIOR_PATTERNS: ReadonlyArray<string> = [
  'junior',
  'graduate',
  'grad',
  'entry level',
  'entry-level',
  '0-2 years',
  '0-1 year',
  '1-2 years',
  '1 year experience',
  'associate',
  'trainee',
  'apprentice',
  'intern',
  'internship',
]

const SENIOR_PATTERNS: ReadonlyArray<string> = [
  'senior',
  'sr.',
  'sr ',
  'lead ',
  ' lead',
  'tech lead',
  'principal',
  'staff ',
  ' staff',
  'head of',
  'director of',
  'vp ',
  'vice president',
  'chief',
  'architect',
  '5+ years',
  '6+ years',
  '7+ years',
  '8+ years',
  '10+ years',
  'extensive experience',
]

/**
 * Infer job seniority from title and description text.
 *
 * Resolution order: SENIOR > JUNIOR > MID (default when patterns found but
 * ambiguous) > UNKNOWN (when no signals present at all).
 *
 * Title is weighted higher than description: title patterns are checked
 * first, and a title match short-circuits the description scan.
 */
export function scoreSeniority(title: string, description: string): SeniorityLevel {
  const titleLower = title.toLowerCase()
  const descLower = description.toLowerCase()

  // Collect all signals from both title and description before deciding
  const titleSenior = SENIOR_PATTERNS.some((p) => titleLower.includes(p))
  const titleJunior = JUNIOR_PATTERNS.some((p) => titleLower.includes(p))
  const descSenior = SENIOR_PATTERNS.some((p) => descLower.includes(p))
  const descJunior = JUNIOR_PATTERNS.some((p) => descLower.includes(p))

  const seniorSignal = titleSenior || descSenior
  const juniorSignal = titleJunior || descJunior

  // Conflicting signals cancel out → MID
  if (seniorSignal && juniorSignal) return 'MID'

  if (seniorSignal) return 'SENIOR'
  if (juniorSignal) return 'JUNIOR'

  // Any mid-level signals in description
  const MID_PATTERNS = ['mid-level', 'mid level', '2-4 years', '3-5 years', '2+ years', '3+ years']
  if (MID_PATTERNS.some((p) => descLower.includes(p))) return 'MID'

  // No signals
  return 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// Sub-domain detection
// ---------------------------------------------------------------------------

const SUBDOMAIN_KEYWORDS: Record<SubDomain, ReadonlyArray<string>> = {
  SOC_ANALYST: [
    'soc analyst',
    'security operations',
    'security operations centre',
    'security operations center',
    'soc ',
    'triage',
    'incident response',
    'siem',
    'splunk',
    'sentinel',
    'qradar',
    'alert triage',
    'log analysis',
    'threat detection',
    'detection engineering',
  ],
  PENETRATION_TESTER: [
    'penetration test',
    'pentest',
    'pen test',
    'pen tester',
    'ethical hack',
    'red team',
    'red-team',
    'offensive security',
    'oscp',
    'bug bounty',
    'vulnerability assessment',
    'network penetration',
    'web application test',
    'exploit',
    'payload',
    'burp suite',
    'metasploit',
    'cobalt strike',
    'kali',
  ],
  GRC_COMPLIANCE: [
    'governance',
    'risk and compliance',
    'risk management',
    'compliance',
    'iso 27001',
    'iso27001',
    'nist',
    'gdpr',
    'data protection',
    'audit',
    'policy framework',
    'regulatory',
    'sox',
    'pcidss',
    'pci dss',
    'security policy',
    'information security management',
    'isms',
    'grc',
    'third party risk',
    'vendor risk',
  ],
  APP_SEC: [
    'application security',
    'appsec',
    'secure code',
    'secure coding',
    'sast',
    'dast',
    'iast',
    'code review',
    'security review',
    'sdlc',
    'devsecops',
    'owasp',
    'threat modelling',
    'threat modeling',
    'api security',
    'mobile security',
    'secure software',
  ],
  CLOUD_SECURITY: [
    'cloud security',
    'aws security',
    'azure security',
    'gcp security',
    'google cloud security',
    'cloud posture',
    'cspm',
    'cwpp',
    'cnapp',
    'iam security',
    'cloud iam',
    'cloud infrastructure',
    'kubernetes security',
    'k8s security',
    'container security',
    'terraform security',
    'infrastructure as code security',
  ],
  VULN_MANAGEMENT: [
    'vulnerability management',
    'vulnerability scanning',
    'vulnerability remediation',
    'patch management',
    'cvss',
    'cve',
    'qualys',
    'tenable',
    'nessus',
    'rapid7',
    'insightvm',
    'asset management',
    'risk scoring',
    'remediation tracking',
  ],
  THREAT_INTEL: [
    'threat intelligence',
    'threat intel',
    'threat hunting',
    'cyber threat',
    'cti',
    'mitre att&ck',
    'mitre attck',
    'ioc',
    'indicator of compromise',
    'dark web monitoring',
    'adversary',
    'ttp',
    'threat actor',
    'intelligence analyst',
    'malware analysis',
    'reverse engineer',
  ],
  INFRASTRUCTURE_SECURITY: [
    'infrastructure security',
    'network security',
    'firewall',
    'ids',
    'ips',
    'intrusion detection',
    'intrusion prevention',
    'zero trust',
    'pam',
    'privileged access',
    'identity security',
    'active directory security',
    'vpn security',
    'endpoint security',
    'edr',
    'xdr',
    'endpoint detection',
  ],
}

/**
 * Detect which cybersecurity sub-domains a job listing falls into.
 *
 * A job can match multiple sub-domains (e.g. a cloud security role that also
 * involves AppSec). Returns all matching domains.
 *
 * Returns an empty array when no domain is detected.
 */
/**
 * Test whether a keyword pattern matches in the text.
 * Short purely-alphabetic patterns (≤5 chars, no spaces) use word-boundary
 * anchoring to avoid false positives — e.g. "nist" matching inside
 * "administration", or "ids" matching inside "candidates".
 * Longer patterns and patterns containing spaces are tested with simple
 * substring inclusion (the surrounding words provide enough context).
 */
function patternMatches(text: string, pattern: string): boolean {
  if (pattern.length <= 4 && /^[a-z0-9]+$/.test(pattern)) {
    const re = new RegExp(`\\b${pattern}\\b`)
    return re.test(text)
  }
  return text.includes(pattern)
}

export function detectSubDomain(title: string, description: string): SubDomain[] {
  const combined = `${title} ${description}`.toLowerCase()
  const matched: SubDomain[] = []

  for (const [domain, patterns] of Object.entries(SUBDOMAIN_KEYWORDS) as [
    SubDomain,
    ReadonlyArray<string>,
  ][]) {
    if (patterns.some((p) => patternMatches(combined, p))) {
      matched.push(domain)
    }
  }

  return matched
}

// ---------------------------------------------------------------------------
// Salary matching
// ---------------------------------------------------------------------------

/**
 * Compare a job's salary range against Atharva's target salary range.
 *
 * All values are annual GBP. Null values indicate the salary is not
 * disclosed in the listing.
 *
 * Rules:
 * - UNKNOWN if both job salary bounds are null
 * - MATCH if there is meaningful overlap between job range and user range
 * - BELOW if the job's max is below the user's min
 * - ABOVE if the job's min is above the user's max
 *
 * "Meaningful overlap" = the ranges intersect (max(jobMin, userMin) ≤ min(jobMax, userMax)).
 * When one job bound is null, the provided bound is used as both min and max
 * (i.e. treated as an exact salary rather than a range) so a single disclosed
 * figure still produces a verdict.
 *
 * @param jobSalaryMin   Lower bound of the job's disclosed salary range (or null)
 * @param jobSalaryMax   Upper bound of the job's disclosed salary range (or null)
 * @param userSalaryMin  Atharva's minimum acceptable salary
 * @param userSalaryMax  Atharva's maximum acceptable salary
 */
export function scoreSalaryMatch(
  jobSalaryMin: number | null,
  jobSalaryMax: number | null,
  userSalaryMin: number,
  userSalaryMax: number,
): SalaryMatchResult {
  // Both bounds unknown
  if (jobSalaryMin === null && jobSalaryMax === null) {
    return 'UNKNOWN'
  }

  // Normalise partial disclosure: treat missing bound as the other bound
  const effectiveMin = jobSalaryMin ?? jobSalaryMax!
  const effectiveMax = jobSalaryMax ?? jobSalaryMin!

  // Guard against inverted user range (defensive)
  const uMin = Math.min(userSalaryMin, userSalaryMax)
  const uMax = Math.max(userSalaryMin, userSalaryMax)

  // Ranges overlap if neither range is entirely below/above the other
  const overlapStart = Math.max(effectiveMin, uMin)
  const overlapEnd = Math.min(effectiveMax, uMax)

  if (overlapStart <= overlapEnd) {
    return 'MATCH'
  }

  // No overlap — determine direction
  if (effectiveMax < uMin) return 'BELOW'
  return 'ABOVE'
}
