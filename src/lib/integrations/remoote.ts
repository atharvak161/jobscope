/**
 * Remoote Job Search adapter via RapidAPI.
 *
 * API: GET https://remoote-job-search1.p.rapidapi.com/remoote/jobs
 * Auth: X-RapidAPI-Key (shared RAPIDAPI_KEY env var).
 * Params: title (job title filter), limit (max results).
 * Rate limit: depends on subscription tier.
 *
 * Note: named 'remoote' (double-o) to distinguish from 'remoteok'.
 *
 * Failure modes handled:
 *   - RAPIDAPI_KEY not set → skip silently (returns empty array)
 *   - 429 Too Many Requests → RateLimitError
 *   - Non-200 responses     → AdapterError
 *   - Missing/null fields   → defensive defaults
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 15 seconds per request.
 * Retries: NOT handled here — the worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://remoote-job-search1.p.rapidapi.com/remoote/jobs';
const RAPIDAPI_HOST = 'remoote-job-search1.p.rapidapi.com';
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 20;

// ─── Remoote response shape (partial — only fields we use) ────────────────

interface RemooteJobResult {
  id?: string | number;
  title?: string;
  position?: string;
  company?: string;
  companyName?: string;
  organization?: string;
  description?: string;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  url?: string;
  applyUrl?: string;
  link?: string;
  datePosted?: string;
  date?: string;
  createdAt?: string;
}

interface RemooteResponse {
  jobs?: RemooteJobResult[];
  results?: RemooteJobResult[];
  data?: RemooteJobResult[];
  [key: string]: unknown;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Remoote job listings for the given title query.
 *
 * Returns an empty array (no error) if RAPIDAPI_KEY is not set.
 *
 * @param titleQuery  e.g. "cybersecurity" or "penetration testing"
 * @returns           Array of normalised RawJobListing objects (may be empty)
 * @throws            RateLimitError on HTTP 429
 * @throws            AdapterError   on other non-200 HTTP responses
 * @throws            Error          on network failure or timeout
 */
export async function fetchRemootejobs(titleQuery: string): Promise<RawJobListing[]> {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    title: titleQuery,
    limit: String(MAX_RESULTS),
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
    throw new RateLimitError('remoote', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('remoote', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as RemooteResponse | RemooteJobResult[];

  let results: RemooteJobResult[] = [];
  if (Array.isArray(data)) {
    results = data as RemooteJobResult[];
  } else {
    const wrapped = data as RemooteResponse;
    results = wrapped.jobs ?? wrapped.results ?? wrapped.data ?? [];
  }

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapRemooteResult(result));
    } catch (err) {
      console.error(
        '[remoote] Failed to map result id=%s: %s',
        result.id,
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapRemooteResult(result: RemooteJobResult): RawJobListing {
  if (!result.id) throw new Error('Missing result.id');

  const title = result.title ?? result.position;
  if (!title) throw new Error('Missing job title');

  const url = result.url ?? result.applyUrl ?? result.link ?? '';
  const dateStr = result.datePosted ?? result.date ?? result.createdAt;
  const company = result.company ?? result.companyName ?? result.organization ?? '';

  return {
    source: 'remoote',
    externalId: String(result.id),
    title: title.trim(),
    company: company.trim(),
    description: (result.description ?? '').trim(),
    salaryMin: result.salaryMin ?? undefined,
    salaryMax: result.salaryMax ?? undefined,
    location: (result.location ?? 'Remote').trim(),
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
