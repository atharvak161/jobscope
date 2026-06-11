/**
 * Indeed Scraper adapter via RapidAPI.
 *
 * API: POST https://indeed-scraper-api.p.rapidapi.com/api/job
 * Auth: X-RapidAPI-Key (shared RAPIDAPI_KEY env var).
 * Rate limit: depends on subscription tier.
 *
 * Failure modes handled:
 *   - RAPIDAPI_KEY not set → skip silently (returns empty array)
 *   - 429 Too Many Requests → RateLimitError
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 20 seconds per request (POST scraper takes longer than GET APIs).
 * Retries: NOT handled here — the worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://indeed-scraper-api.p.rapidapi.com/api/job';
const RAPIDAPI_HOST = 'indeed-scraper-api.p.rapidapi.com';
const TIMEOUT_MS = 20_000;
const MAX_ROWS = 15;

// ─── Indeed Scraper response shape (partial — only fields we use) ──────────

interface IndeedJobResult {
  jobId?: string;
  id?: string;
  jobTitle?: string;
  title?: string;
  companyName?: string;
  company?: string;
  description?: string;
  salary?: string;
  location?: string;
  jobType?: string;
  applyUrl?: string;
  url?: string;
  link?: string;
  datePosted?: string;
  date?: string;
  postedAt?: string;
}

interface IndeedResponse {
  jobs?: IndeedJobResult[];
  results?: IndeedJobResult[];
  data?: IndeedJobResult[];
  // Some endpoints return array directly
  [key: string]: unknown;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Indeed job listings for the given query.
 *
 * Returns an empty array (no error) if RAPIDAPI_KEY is not set.
 *
 * @param query  e.g. "cybersecurity uk" or "penetration testing uk"
 * @returns      Array of normalised RawJobListing objects (may be empty)
 * @throws       RateLimitError on HTTP 429
 * @throws       AdapterError   on other non-200 HTTP responses
 * @throws       Error          on network failure or timeout
 */
export async function fetchIndeedJobs(query: string): Promise<RawJobListing[]> {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      body: JSON.stringify({
        scraper: {
          maxRows: MAX_ROWS,
          query,
          location: 'United Kingdom',
          jobType: 'fulltime',
          sort: 'relevance',
          fromDays: '7',
          country: 'gb',
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('indeed', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('indeed', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as IndeedResponse | IndeedJobResult[];

  // API may return array directly or wrapped under various keys
  let results: IndeedJobResult[] = [];
  if (Array.isArray(data)) {
    results = data as IndeedJobResult[];
  } else {
    const wrapped = data as IndeedResponse;
    results = wrapped.jobs ?? wrapped.results ?? wrapped.data ?? [];
  }

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapIndeedResult(result));
    } catch (err) {
      console.error(
        '[indeed] Failed to map result id=%s: %s',
        result.jobId ?? result.id,
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapIndeedResult(result: IndeedJobResult): RawJobListing {
  const externalId = result.jobId ?? result.id;
  if (!externalId) throw new Error('Missing job id');

  const title = result.jobTitle ?? result.title;
  if (!title) throw new Error('Missing job title');

  const url = result.applyUrl ?? result.url ?? result.link ?? '';
  const dateStr = result.datePosted ?? result.date ?? result.postedAt;

  return {
    source: 'indeed',
    externalId: String(externalId),
    title: title.trim(),
    company: (result.companyName ?? result.company ?? '').trim(),
    description: (result.description ?? '').trim(),
    location: (result.location ?? '').trim(),
    url,
    postedAt: dateStr ? new Date(dateStr) : new Date(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds * 1_000;
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return undefined;
}
