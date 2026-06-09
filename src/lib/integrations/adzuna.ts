/**
 * Adzuna API adapter.
 *
 * API documentation: https://developer.adzuna.com/overview
 * Rate limit: ~250 requests/day on free tier.
 * Auth: app_id + app_key query parameters.
 * Category used: it-jobs (covers cybersecurity roles).
 *
 * Failure modes handled:
 *   - 429 Too Many Requests → RateLimitError (worker must back off)
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults (empty string / undefined)
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 15 seconds per request (Adzuna SLA is typically < 2s; 15s is a generous ceiling).
 * Retries: NOT handled here — the pg-boss worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://api.adzuna.com/v1/api/jobs/gb/search';
const RESULTS_PER_PAGE = 50;
const TIMEOUT_MS = 15_000;

// ─── Adzuna response shape (partial — only fields we use) ──────────────────

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  description?: string;
  salary_min?: number;
  salary_max?: number;
  location?: { display_name?: string };
  redirect_url?: string;
  created?: string;
}

interface AdzunaSearchResponse {
  results?: AdzunaResult[];
  count?: number;
  __CLASS__?: string;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch a single page of Adzuna IT-jobs results for the given query + location.
 *
 * @param query    Keywords, e.g. "cybersecurity" or "penetration testing"
 * @param location UK location string, e.g. "london" or "united kingdom"
 * @param page     1-based page number
 * @returns        Array of normalised RawJobListing objects (may be empty if no results)
 * @throws         RateLimitError on HTTP 429
 * @throws         AdapterError   on other non-200 HTTP responses
 * @throws         Error          on network failure or timeout
 */
export async function fetchAdzunaJobs(
  query: string,
  location: string,
  page: number,
): Promise<RawJobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_API_KEY;

  if (!appId || !appKey) {
    throw new Error(
      'Adzuna credentials missing: set ADZUNA_APP_ID and ADZUNA_API_KEY environment variables.',
    );
  }

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(RESULTS_PER_PAGE),
    what: query,
    where: location,
    category: 'it-jobs',
  });

  const url = `${BASE_URL}/${page}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('adzuna', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('adzuna', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as AdzunaSearchResponse;
  const results = data.results ?? [];

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapAdzunaResult(result));
    } catch (err) {
      // Malformed individual result — skip and log; do not abort the batch.
      console.error('[adzuna] Failed to map result id=%s: %s', result.id, (err as Error).message);
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapAdzunaResult(result: AdzunaResult): RawJobListing {
  if (!result.id) throw new Error('Missing result.id');
  if (!result.title) throw new Error('Missing result.title');

  return {
    source: 'adzuna',
    externalId: String(result.id),
    title: result.title.trim(),
    company: result.company?.display_name?.trim() ?? '',
    description: result.description?.trim() ?? '',
    salaryMin: result.salary_min != null ? Math.round(result.salary_min) : undefined,
    salaryMax: result.salary_max != null ? Math.round(result.salary_max) : undefined,
    location: result.location?.display_name?.trim() ?? '',
    url: result.redirect_url ?? '',
    postedAt: result.created ? new Date(result.created) : new Date(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse the Retry-After header value (seconds as integer, or HTTP-date) into ms.
 * Returns undefined if the header is absent or unparseable.
 */
function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds * 1_000;
  // HTTP-date format fallback
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return undefined;
}
