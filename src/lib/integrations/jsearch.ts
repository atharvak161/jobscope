/**
 * JSearch API adapter (Google Jobs aggregator via RapidAPI).
 *
 * API documentation: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 * Rate limit: 200 requests/month on free tier.
 * Auth: X-RapidAPI-Key + X-RapidAPI-Host headers.
 *
 * Failure modes handled:
 *   - 429 Too Many Requests → RateLimitError (worker must back off)
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults (empty string / undefined)
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 15 seconds per request.
 * Retries: NOT handled here — the ingestion worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://jsearch.p.rapidapi.com/search';
const RESULTS_PER_PAGE = 10;
const TIMEOUT_MS = 15_000;
const RAPIDAPI_HOST = 'jsearch.p.rapidapi.com';

// ─── JSearch response shape (partial — only fields we use) ─────────────────

interface JSearchResult {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_description?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_city?: string | null;
  job_country?: string | null;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string | null;
}

interface JSearchResponse {
  data?: JSearchResult[];
  status?: string;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch a single page of JSearch results for the given query.
 *
 * @param query  Keywords, e.g. "cybersecurity uk" or "penetration testing uk"
 * @param page   1-based page number (max 10 per JSearch API limits)
 * @returns      Array of normalised RawJobListing objects (may be empty if no results)
 * @throws       RateLimitError on HTTP 429
 * @throws       AdapterError   on other non-200 HTTP responses
 * @throws       Error          on network failure or timeout
 */
export async function fetchJSearchJobs(
  query: string,
  page: number,
): Promise<RawJobListing[]> {
  const apiKey = process.env.JSEARCH_API_KEY;

  if (!apiKey) {
    throw new Error(
      'JSearch credentials missing: set JSEARCH_API_KEY environment variable.',
    );
  }

  const params = new URLSearchParams({
    query,
    page: String(page),
    num_pages: '1',
    country: 'gb',
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
    throw new RateLimitError('jsearch', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('jsearch', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as JSearchResponse;
  const results = data.data ?? [];

  const listings: RawJobListing[] = [];
  for (const result of results.slice(0, RESULTS_PER_PAGE)) {
    try {
      listings.push(mapJSearchResult(result));
    } catch (err) {
      // Malformed individual result — skip and log; do not abort the batch.
      console.error(
        '[jsearch] Failed to map result id=%s: %s',
        result.job_id,
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapJSearchResult(result: JSearchResult): RawJobListing {
  if (!result.job_id) throw new Error('Missing result.job_id');
  if (!result.job_title) throw new Error('Missing result.job_title');

  const location =
    result.job_city?.trim() ||
    result.job_country?.trim() ||
    '';

  return {
    source: 'jsearch',
    externalId: String(result.job_id),
    title: result.job_title.trim(),
    company: result.employer_name?.trim() ?? '',
    description: result.job_description?.trim() ?? '',
    salaryMin:
      result.job_min_salary != null
        ? Math.round(result.job_min_salary)
        : undefined,
    salaryMax:
      result.job_max_salary != null
        ? Math.round(result.job_max_salary)
        : undefined,
    location,
    url: result.job_apply_link ?? '',
    postedAt: result.job_posted_at_datetime_utc
      ? new Date(result.job_posted_at_datetime_utc)
      : new Date(),
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
