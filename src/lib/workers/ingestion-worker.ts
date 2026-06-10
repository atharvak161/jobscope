/**
 * Ingestion Worker
 *
 * Connects the job-source adapters to the database:
 *
 *   1. Calls the job-source adapters (Adzuna, Reed, Jooble)
 *   2. Computes a stable content hash via dedup.ts
 *   3. Writes to RawJobIngestion (upsert on contentHash — skip duplicates)
 *   4. Calls process-job.ts to run the matching + eligibility pipeline
 *   5. Writes processed results to the Job table (upsert on source + sourceId)
 *   6. Updates JobSponsorMatch when a sponsor was matched
 *
 * DB errors are caught and counted — a failed DB write increments the error
 * counter but does not abort the rest of the batch. Network errors from
 * individual adapters are logged and counted; the other adapters still run.
 *
 * Usage:
 *   const result = await runIngestionCycle('cybersecurity', 'london')
 *   // → { ingested: 47, skipped: 12, errors: 1 }
 */

import { prisma } from '../db/client'
import {
  fetchAdzunaJobs,
  fetchReedJobs,
  fetchJoobleJobs,
  fetchRemoteOKJobs,
  fetchJSearchJobs,
  fetchActiveJobs,
  fetchIndeedJobs,
  fetchMonsterJobs,
  fetchRemootejobs,
  fetchGlassdoorJobs,
  computeJobHash,
  type RawJobListing as IntegrationRawJobListing,
} from '../integrations/index'
import {
  processRawJob,
  type RawJobListing as PipelineRawJobListing,
  type ProcessedJob,
} from '../pipeline/process-job'

// ---------------------------------------------------------------------------
// Source-to-enum mapping
// The Prisma schema JobSource enum is uppercase; adapter source strings are lowercase.
// ---------------------------------------------------------------------------

const SOURCE_MAP: Record<string, 'ADZUNA' | 'REED' | 'JOOBLE' | 'REMOTEOK' | 'JSEARCH' | 'ACTIVEJOBS' | 'INDEED' | 'MONSTER' | 'REMOOTE' | 'GLASSDOOR'> = {
  adzuna: 'ADZUNA',
  reed: 'REED',
  jooble: 'JOOBLE',
  remoteok: 'REMOTEOK',
  jsearch: 'JSEARCH',
  activejobs: 'ACTIVEJOBS',
  indeed: 'INDEED',
  monster: 'MONSTER',
  remoote: 'REMOOTE',
  glassdoor: 'GLASSDOOR',
}

// ---------------------------------------------------------------------------
// Adapter bridging
// Converts the integration layer's RawJobListing to the pipeline's RawJobListing.
// The two types diverge on: company/companyName, url/listingUrl, postedAt type,
// optional vs nullable salaries, and the contentHash field (added here).
// ---------------------------------------------------------------------------

function bridgeToPipelineInput(
  job: IntegrationRawJobListing,
  hash: string,
): PipelineRawJobListing {
  return {
    externalId: job.externalId,
    source: job.source,
    title: job.title,
    companyName: job.company,
    description: job.description,
    location: job.location,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    postedAt: job.postedAt instanceof Date ? job.postedAt.toISOString() : String(job.postedAt),
    listingUrl: job.url,
    contentHash: hash,
  }
}

// ---------------------------------------------------------------------------
// writeRawJob
// Upsert a raw job listing into RawJobIngestion.
// ON CONFLICT on contentHash → update rawJson and leave processedJobId intact.
// Returns true if the row was newly inserted (not a duplicate), false otherwise.
// ---------------------------------------------------------------------------

export async function writeRawJob(
  raw: IntegrationRawJobListing,
  hash: string,
): Promise<{ wasNew: boolean }> {
  const db = prisma
  const sourceEnum = SOURCE_MAP[raw.source.toLowerCase()]

  if (!sourceEnum) {
    throw new Error(`Unknown source "${raw.source}" — cannot map to JobSource enum.`)
  }

  // Check for existing row first (Prisma 7 upsert requires a unique field in `where`)
  const existing = await db.rawJobIngestion.findUnique({
    where: { contentHash: hash },
    select: { id: true },
  })

  if (existing) {
    return { wasNew: false }
  }

  await db.rawJobIngestion.create({
    data: {
      source: sourceEnum,
      contentHash: hash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawJson: raw as any,
    },
  })

  return { wasNew: true }
}

// ---------------------------------------------------------------------------
// writeProcessedJob
// Upsert the enriched job record into Job and create/update JobSponsorMatch.
// ---------------------------------------------------------------------------

export async function writeProcessedJob(
  processed: ProcessedJob,
  hash: string,
): Promise<void> {
  const db = prisma
  const sourceEnum = SOURCE_MAP[processed.source.toLowerCase()]

  if (!sourceEnum) {
    throw new Error(`Unknown source "${processed.source}" — cannot map to JobSource enum.`)
  }

  // Map seniority from pipeline output to Prisma enum
  // Pipeline returns JUNIOR | MID | SENIOR | UNKNOWN; schema has JUNIOR | MID | SENIOR
  const seniorityEnum: 'JUNIOR' | 'MID' | 'SENIOR' | null =
    processed.seniority === 'UNKNOWN' ? null : processed.seniority

  // Map clearance from pipeline output to Prisma enum
  const clearanceEnum: 'REQUIRED' | 'PREFERRED' | 'NONE_DETECTED' =
    processed.clearanceRequirement === 'REQUIRED'
      ? 'REQUIRED'
      : processed.clearanceRequirement === 'PREFERRED'
        ? 'PREFERRED'
        : 'NONE_DETECTED'

  // Find existing job by source + sourceId to determine upsert key
  const existingJob = await db.job.findFirst({
    where: { source: sourceEnum, sourceId: processed.externalId },
    select: { id: true },
  })

  let jobId: string

  if (existingJob) {
    // Update the existing record
    await db.job.update({
      where: { id: existingJob.id },
      data: {
        title: processed.title,
        employer: processed.companyName,
        employerNormalised: processed.companyNameNormalised,
        description: processed.description,
        location: processed.location,
        salaryMinGbp: processed.salaryMin,
        salaryMaxGbp: processed.salaryMax,
        postedAt: new Date(processed.postedAt),
        clearanceStatus: clearanceEnum,
        seniority: seniorityEnum ?? undefined,
        subDomain: processed.subDomains.length > 0 ? processed.subDomains[0] : null,
        feedVisible: processed.feedVisible,
        isActive: true,
      },
    })
    jobId = existingJob.id
  } else {
    // Create new job record
    const newJob = await db.job.create({
      data: {
        source: sourceEnum,
        sourceId: processed.externalId,
        sourceUrl: processed.listingUrl,
        title: processed.title,
        employer: processed.companyName,
        employerNormalised: processed.companyNameNormalised,
        description: processed.description,
        location: processed.location,
        salaryMinGbp: processed.salaryMin,
        salaryMaxGbp: processed.salaryMax,
        postedAt: new Date(processed.postedAt),
        clearanceStatus: clearanceEnum,
        seniority: seniorityEnum ?? undefined,
        subDomain: processed.subDomains.length > 0 ? processed.subDomains[0] : null,
        feedVisible: processed.feedVisible,
        isActive: true,
      },
    })
    jobId = newJob.id

    // Link processedJobId back to RawJobIngestion
    try {
      await db.rawJobIngestion.updateMany({
        where: { contentHash: hash },
        data: { processedJobId: jobId },
      })
    } catch {
      // Non-fatal: raw record may already be gone or processedJobId already set
    }
  }

  // Write sponsor match if the pipeline found one (any confidence tier with a matched sponsor)
  if (processed.matchedSponsorId) {
    const confidenceEnum: 'CONFIRMED' | 'LIKELY' | 'LOW_CONFIDENCE' | 'UNKNOWN' =
      processed.sponsorConfidence === 'CONFIRMED'
        ? 'CONFIRMED'
        : processed.sponsorConfidence === 'LIKELY'
          ? 'LIKELY'
          : processed.sponsorConfidence === 'LOW_CONFIDENCE'
            ? 'LOW_CONFIDENCE'
            : 'UNKNOWN'

    // Upsert by unique composite key (jobId, sponsorId)
    const existingMatch = await db.jobSponsorMatch.findUnique({
      where: {
        jobId_sponsorId: { jobId, sponsorId: processed.matchedSponsorId },
      },
      select: { id: true },
    })

    if (existingMatch) {
      await db.jobSponsorMatch.update({
        where: { id: existingMatch.id },
        data: {
          confidenceTier: confidenceEnum,
          matchReason: processed.sponsorMatchReason,
        },
      })
    } else {
      await db.jobSponsorMatch.create({
        data: {
          jobId,
          sponsorId: processed.matchedSponsorId,
          confidenceTier: confidenceEnum,
          matchReason: processed.sponsorMatchReason,
          similarityScore: null,
        },
      })
    }
  }
}

// ---------------------------------------------------------------------------
// runIngestionCycle
// Top-level entry point: calls all three adapters and processes every listing.
// ---------------------------------------------------------------------------

export async function runIngestionCycle(
  query: string,
  location: string,
): Promise<{ ingested: number; skipped: number; errors: number }> {
  let ingested = 0
  let skipped = 0
  let errors = 0

  // ── 1. Collect listings from all three adapters ───────────────────────────
  // Adapter failures are isolated: one failing source doesn't block the others.

  const allListings: IntegrationRawJobListing[] = []

  // Keyed adapters only run when their required env vars are configured.
  // A missing key is not an error — the source is simply skipped so the app
  // works out of the box with zero API keys.
  const adapterRuns: Array<{
    name: string
    enabled: boolean
    fn: () => Promise<IntegrationRawJobListing[]>
  }> = [
    {
      name: 'adzuna',
      enabled: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_API_KEY),
      fn: () => fetchAdzunaJobs(query, location, 1),
    },
    {
      name: 'reed',
      enabled: Boolean(process.env.REED_API_KEY),
      fn: () => fetchReedJobs(query, location),
    },
    {
      name: 'jooble',
      enabled: Boolean(process.env.JOOBLE_API_KEY),
      fn: () => fetchJoobleJobs(query, location),
    },
    // RemoteOK requires no key — always enabled.
    {
      name: 'remoteok',
      enabled: true,
      fn: () => fetchRemoteOKJobs(50),
    },
  ]

  for (const adapter of adapterRuns) {
    if (!adapter.enabled) {
      console.log(`[ingestion-worker] ${adapter.name}: no API keys configured, skipping`)
      continue
    }
    try {
      const listings = await adapter.fn()
      allListings.push(...listings)
    } catch (err) {
      console.warn(`[ingestion-worker] ${adapter.name} adapter failed:`, err)
      errors++
    }
  }

  // ── JSearch: multi-query pass (Google Jobs aggregator via RapidAPI) ────────
  // Each query fetches page 1 only (conserve free tier quota: 200 req/month).
  // Skipped gracefully when JSEARCH_API_KEY is not set.
  const jsearchEnabled = Boolean(process.env.JSEARCH_API_KEY)
  if (!jsearchEnabled) {
    console.log('[ingestion-worker] jsearch: no API key configured, skipping')
  } else {
    const jsearchQueries = [
      'cybersecurity uk',
      'penetration testing uk',
      'information security uk',
      'SOC analyst uk',
      'cloud security uk',
    ]
    for (const jsearchQuery of jsearchQueries) {
      try {
        const listings = await fetchJSearchJobs(jsearchQuery, 1)
        allListings.push(...listings)
      } catch (err) {
        console.warn(`[ingestion-worker] jsearch query "${jsearchQuery}" failed:`, err)
        errors++
      }
    }
  }

  // ── Active Jobs DB: multi-query pass (ATS aggregator via RapidAPI) ─────────
  // Real ATS postings from Greenhouse, Lever, Workday, etc. — last 24 hours.
  // 1 call per query term; offset fixed at 0 (free tier: ~100 req/month).
  // fetchActiveJobs returns [] silently when RAPIDAPI_KEY is not set.
  const activeJobsQueries = [
    '"cybersecurity" OR "cyber security"',
    '"penetration testing" OR "pentester"',
    '"information security" OR "infosec"',
    '"SOC analyst" OR "security analyst"',
    '"cloud security" OR "security engineer"',
  ]
  for (const activeQuery of activeJobsQueries) {
    try {
      const listings = await fetchActiveJobs(activeQuery)
      if (listings.length === 0 && !process.env.RAPIDAPI_KEY) {
        // Key not set — log once on first iteration and break
        console.log('[ingestion-worker] activejobs: no RAPIDAPI_KEY configured, skipping')
        break
      }
      allListings.push(...listings)
    } catch (err) {
      console.warn(`[ingestion-worker] activejobs query "${activeQuery}" failed:`, err)
      errors++
    }
  }

  // ── Glassdoor: multi-query pass (Glassdoor Scraper via RapidAPI) ─────────
  // fetchGlassdoorJobs returns [] silently when RAPIDAPI_KEY is not set.
  const glassdoorQueries = [
    'cybersecurity uk',
    'penetration testing uk',
    'information security uk',
    'SOC analyst uk',
    'security engineer uk',
  ]
  if (!process.env.RAPIDAPI_KEY) {
    console.log('[ingestion-worker] glassdoor: no RAPIDAPI_KEY configured, skipping')
  } else {
    for (const glassdoorQuery of glassdoorQueries) {
      try {
        const listings = await fetchGlassdoorJobs(glassdoorQuery)
        allListings.push(...listings)
      } catch (err) {
        console.warn(`[ingestion-worker] glassdoor query "${glassdoorQuery}" failed:`, err)
        errors++
      }
    }
  }

  // ── 2. Process each listing ────────────────────────────────────────────────

  for (const rawListing of allListings) {
    try {
      // Compute dedup hash
      const hash = computeJobHash(rawListing)

      // Write to RawJobIngestion (skip if duplicate)
      let wasNew = false
      try {
        const result = await writeRawJob(rawListing, hash)
        wasNew = result.wasNew
      } catch (err) {
        console.error('[ingestion-worker] writeRawJob failed:', err)
        errors++
        continue
      }

      if (!wasNew) {
        skipped++
        continue
      }

      // Run the enrichment pipeline
      const pipelineInput = bridgeToPipelineInput(rawListing, hash)
      let processed: ProcessedJob
      try {
        processed = await processRawJob(pipelineInput)
      } catch (err) {
        console.error('[ingestion-worker] processRawJob failed:', err)
        errors++
        continue
      }

      // Write to Job + JobSponsorMatch
      try {
        await writeProcessedJob(processed, hash)
      } catch (err) {
        console.error('[ingestion-worker] writeProcessedJob failed:', err)
        errors++
        continue
      }

      ingested++
    } catch (err) {
      // Catch-all for unexpected errors on a single listing
      console.error('[ingestion-worker] unexpected error processing listing:', err)
      errors++
    }
  }

  return { ingested, skipped, errors }
}
