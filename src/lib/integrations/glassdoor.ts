/**
 * Glassdoor API adapter (via RapidAPI scraper).
 *
 * Endpoint: POST https://glassdoor-jobs-scraper-api.p.rapidapi.com/api/job/wait
 * Auth: RAPIDAPI_KEY environment variable (X-RapidAPI-Key header).
 *
 * Failure modes handled:
 *   - Missing RAPIDAPI_KEY  → silently returns [] (source is optional)
 *   - 429 Too Many Requests → RateLimitError (worker must back off)
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults (empty string / undefined)
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 30 seconds (wait-style endpoint; longer than typical scrape APIs).
 * Retries: NOT handled here — the pg-boss worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const API_URL = 'https://glassdoor-jobs-scraper-api.p.rapidapi.com/api/job/wait';
const TIMEOUT_MS = 30_000;

// ─── Glassdoor response shape (partial — only fields we use) ──────────────

interface GlassdoorJob {
  id?: string;
  jobId?: string;
  jobTitle?: string;
  title?: string;
  employer?: string;
  company?: string;
  description?: string;
  location?: string;
  applyUrl?: string;
  url?: string;
  datePosted?: string;
}

interface GlassdoorApiResponse {
  jobs?: GlassdoorJob[];
  data?: { jobs?: GlassdoorJob[] };
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Glassdoor job listings for the given search query (UK-scoped).
 *
 * @param query  Keywords, e.g. "cybersecurity uk" or "penetration testing uk"
 * @returns      Array of normalised RawJobListing objects (may be empty)
 * @throws       RateLimitError on HTTP 429
 * @throws       AdapterError   on other non-200 HTTP responses
 * @throws       Error          on network failure or timeout
 */
export async function fetchGlassdoorJobs(query: string): Promise<RawJobListing[]> {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    console.log('[glassdoor] RAPIDAPI_KEY not set — skipping');
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'glassdoor-jobs-scraper-api.p.rapidapi.com',
      },
      body: JSON.stringify({
        scraper: {
          filters: {
            country: 'gb',
            keyword: query,
            location: 'United Kingdom',
          },
          maxRows: 20,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new RateLimitError('glassdoor', undefined);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('glassdoor', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as GlassdoorApiResponse;

  // Support both top-level `jobs` and nested `data.jobs`
  const jobs: GlassdoorJob[] = data.jobs ?? data.data?.jobs ?? [];

  const listings: RawJobListing[] = [];
  for (const job of jobs) {
    try {
      listings.push(mapGlassdoorJob(job));
    } catch (err) {
      console.error(
        '[glassdoor] Failed to map job id=%s: %s',
        job.id ?? job.jobId ?? 'unknown',
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapGlassdoorJob(job: GlassdoorJob): RawJobListing {
  const externalId = job.id ?? job.jobId;
  if (!externalId) throw new Error('Missing job id / jobId');

  const title = job.jobTitle ?? job.title;
  if (!title) throw new Error('Missing jobTitle / title');

  return {
    source: 'glassdoor',
    externalId: String(externalId),
    title: title.trim(),
    company: (job.employer ?? job.company ?? '').trim(),
    description: (job.description ?? '').trim(),
    location: (job.location ?? '').trim(),
    url: job.applyUrl ?? job.url ?? '',
    postedAt: job.datePosted ? new Date(job.datePosted) : new Date(),
  };
}
