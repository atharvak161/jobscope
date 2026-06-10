/**
 * Active Jobs DB (ATS aggregator) adapter.
 *
 * API: https://rapidapi.com/active-jobs-db/api/active-jobs-db
 * Host: active-jobs-db.p.rapidapi.com
 * Endpoint: GET /active-ats-24h — jobs posted in the last 24 hours from ATS platforms
 *   (Greenhouse, Lever, Workday, SmartRecruiters, Ashby, etc.)
 *
 * Rate limit: ~100 requests/month on free tier.
 * Auth: X-RapidAPI-Key header (shared RAPIDAPI_KEY env var).
 *
 * Failure modes handled:
 *   - RAPIDAPI_KEY not set → skip silently (returns empty array, no error thrown)
 *   - 429 Too Many Requests → RateLimitError
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults (empty string / undefined)
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 15 seconds per request.
 * Retries: NOT handled here — the worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://active-jobs-db.p.rapidapi.com/active-ats-24h';
const RAPIDAPI_HOST = 'active-jobs-db.p.rapidapi.com';
const TIMEOUT_MS = 15_000;

// ─── Active Jobs DB response shape (partial — only fields we use) ──────────

interface ActiveJobsResult {
  id?: string | number;
  title?: string;
  organization?: string;
  description?: string;
  salary_raw?: string;
  locations_raw?: string;
  location?: string;
  url?: string;
  date_posted?: string;
}

interface ActiveJobsResponse {
  jobs?: ActiveJobsResult[];
  // The API may return the array directly or wrapped in a 'jobs' key
  [key: string]: unknown;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Active Jobs DB listings for the given title query.
 *
 * Always uses location_filter="United Kingdom" and description_type="text".
 * Offset is fixed at 0 — one call per query term (free tier: ~100 req/month).
 *
 * Returns an empty array (no error) if RAPIDAPI_KEY is not set, so the app
 * works out of the box with zero API keys configured.
 *
 * @param titleQuery  e.g. '"cybersecurity" OR "cyber security"'
 * @returns           Array of normalised RawJobListing objects (may be empty)
 * @throws            RateLimitError on HTTP 429
 * @throws            AdapterError   on other non-200 HTTP responses
 * @throws            Error          on network failure or timeout
 */
export async function fetchActiveJobs(titleQuery: string): Promise<RawJobListing[]> {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    // Skip silently — no key configured
    return [];
  }

  const params = new URLSearchParams({
    title_filter: titleQuery,
    location_filter: 'United Kingdom',
    description_type: 'text',
    offset: '0',
  });

  const url = `${BASE_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('activejobs', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('activejobs', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as ActiveJobsResponse | ActiveJobsResult[];

  // The API may return the array directly or wrapped under a 'jobs' key
  const results: ActiveJobsResult[] = Array.isArray(data)
    ? (data as ActiveJobsResult[])
    : (data as ActiveJobsResponse).jobs ?? [];

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapActiveJobsResult(result));
    } catch (err) {
      // Malformed individual result — skip and log; do not abort the batch.
      console.error(
        '[activejobs] Failed to map result id=%s: %s',
        result.id,
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapActiveJobsResult(result: ActiveJobsResult): RawJobListing {
  if (!result.id) throw new Error('Missing result.id');
  if (!result.title) throw new Error('Missing result.title');

  // Prefer locations_raw (more specific), fall back to location field
  const rawLocation = result.locations_raw?.trim() ?? result.location?.trim() ?? '';

  return {
    source: 'activejobs',
    externalId: String(result.id),
    title: result.title.trim(),
    company: result.organization?.trim() ?? '',
    description: result.description?.trim() ?? '',
    location: rawLocation,
    url: result.url ?? '',
    postedAt: result.date_posted ? new Date(result.date_posted) : new Date(),
    // salary_raw is a free-text string — no min/max split; store in description context
    // salaryMin / salaryMax left undefined; salary_raw surfaced via description if present
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
