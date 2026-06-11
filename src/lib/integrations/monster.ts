/**
 * Monster Jobs adapter via RapidAPI.
 *
 * API: POST https://monster-jobs-api.p.rapidapi.com/api/job/wait
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
 * Timeout: 30 seconds per request (/wait endpoint waits for scraper to complete).
 * Retries: NOT handled here — the worker layer owns retry + backoff.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://monster-jobs-api.p.rapidapi.com/api/job/wait';
const RAPIDAPI_HOST = 'monster-jobs-api.p.rapidapi.com';
const TIMEOUT_MS = 30_000;
const MAX_ROWS = 20;

// ─── Monster Jobs response shape (partial — only fields we use) ────────────

interface MonsterJobResult {
  jobId?: string;
  id?: string;
  title?: string;
  jobTitle?: string;
  company?: string;
  companyName?: string;
  description?: string;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  city?: string;
  country?: string;
  applyUrl?: string;
  url?: string;
  link?: string;
  datePosted?: string;
  date?: string;
  postingDate?: string;
}

interface MonsterResponse {
  jobs?: MonsterJobResult[];
  results?: MonsterJobResult[];
  data?: MonsterJobResult[];
  [key: string]: unknown;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Monster job listings for the given query.
 *
 * Returns an empty array (no error) if RAPIDAPI_KEY is not set.
 *
 * @param query  e.g. "cybersecurity" or "penetration testing"
 * @returns      Array of normalised RawJobListing objects (may be empty)
 * @throws       RateLimitError on HTTP 429
 * @throws       AdapterError   on other non-200 HTTP responses
 * @throws       Error          on network failure or timeout
 */
export async function fetchMonsterJobs(query: string): Promise<RawJobListing[]> {
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
          filters: {
            keyword: query,
            location: 'United Kingdom',
            countryCode: 'gb_gb',
          },
          maxRows: MAX_ROWS,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('monster', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('monster', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as MonsterResponse | MonsterJobResult[];

  let results: MonsterJobResult[] = [];
  if (Array.isArray(data)) {
    results = data as MonsterJobResult[];
  } else {
    const wrapped = data as MonsterResponse;
    results = wrapped.jobs ?? wrapped.results ?? wrapped.data ?? [];
  }

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapMonsterResult(result));
    } catch (err) {
      console.error(
        '[monster] Failed to map result id=%s: %s',
        result.jobId ?? result.id,
        (err as Error).message,
      );
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapMonsterResult(result: MonsterJobResult): RawJobListing {
  const externalId = result.jobId ?? result.id;
  if (!externalId) throw new Error('Missing job id');

  const title = result.title ?? result.jobTitle;
  if (!title) throw new Error('Missing job title');

  const url = result.applyUrl ?? result.url ?? result.link ?? '';
  const dateStr = result.datePosted ?? result.date ?? result.postingDate;

  // Build location from available fields
  const location = result.location ?? result.city ?? result.country ?? '';

  return {
    source: 'monster',
    externalId: String(externalId),
    title: title.trim(),
    company: (result.company ?? result.companyName ?? '').trim(),
    description: (result.description ?? '').trim(),
    salaryMin: result.salaryMin ?? undefined,
    salaryMax: result.salaryMax ?? undefined,
    location: location.trim(),
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
