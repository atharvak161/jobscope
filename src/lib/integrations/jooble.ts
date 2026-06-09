/**
 * Jooble API adapter.
 *
 * API documentation: https://jooble.org/api/about
 * Rate limit: undocumented free tier — use conservatively (~200 calls/day).
 * Auth: API key in the URL path (POST https://jooble.org/api/{API_KEY}).
 * Method: POST with JSON body containing keywords and location.
 *
 * Failure modes handled:
 *   - 429 Too Many Requests    → RateLimitError
 *   - 403 Forbidden            → AdapterError (key invalid or IP banned)
 *   - Other non-200 responses  → AdapterError
 *   - Missing/null fields      → defensive defaults
 *   - Unexpected JSON shape    → graceful skip per listing, logged to stderr
 *   - Empty or null jobs array → return empty array (not an error)
 *
 * Timeout: 20 seconds (Jooble can be slower than Adzuna/Reed due to aggregation latency).
 * Retries: NOT handled here — the pg-boss worker layer owns retry + backoff.
 *
 * Note on externalId: Jooble does not always provide a stable unique ID.
 * We use the 'id' field if present, otherwise fall back to hashing title+link
 * which is consistent across re-fetches of the same listing.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';
import { createHash } from 'crypto';

const BASE_URL = 'https://jooble.org/api';
const TIMEOUT_MS = 20_000;

// ─── Jooble response shape (partial) ──────────────────────────────────────

interface JoobleJob {
  id?: string | number;
  title?: string;
  company?: string;
  snippet?: string;
  salary?: string;
  location?: string;
  link?: string;
  updated?: string;
}

interface JoobleResponse {
  jobs?: JoobleJob[];
  totalCount?: number;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Jooble job listings for the given query and location.
 *
 * @param query    Keywords, e.g. "cybersecurity" or "penetration testing"
 * @param location UK location string, e.g. "United Kingdom" or "London"
 * @returns        Array of normalised RawJobListing objects
 * @throws         RateLimitError on HTTP 429
 * @throws         AdapterError   on other non-200 HTTP responses
 * @throws         Error          on network failure, timeout, or missing credentials
 */
export async function fetchJoobleJobs(
  query: string,
  location: string,
): Promise<RawJobListing[]> {
  const apiKey = process.env.JOOBLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Jooble credentials missing: set JOOBLE_API_KEY environment variable.',
    );
  }

  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}`;

  const requestBody = JSON.stringify({ keywords: query, location });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: requestBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('jooble', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('jooble', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as JoobleResponse;
  const jobs = data.jobs ?? [];

  const listings: RawJobListing[] = [];
  for (const job of jobs) {
    try {
      listings.push(mapJoobleJob(job));
    } catch (err) {
      console.error('[jooble] Failed to map job: %s', (err as Error).message);
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapJoobleJob(job: JoobleJob): RawJobListing {
  if (!job.title) throw new Error('Missing job.title');
  if (!job.link) throw new Error('Missing job.link — cannot produce a usable listing URL');

  // Jooble's salary field is a free-text string like "£40,000 – £60,000 per year"
  // We attempt a best-effort parse; leave undefined if it doesn't match expectations.
  const { salaryMin, salaryMax } = parseSalaryString(job.salary);

  // Stable externalId: prefer Jooble's own id, fall back to deterministic hash.
  const externalId =
    job.id != null && String(job.id).trim() !== ''
      ? String(job.id)
      : createHash('sha256')
          .update(`jooble:${job.title}:${job.link}`)
          .digest('hex')
          .slice(0, 16);

  return {
    source: 'jooble',
    externalId,
    title: job.title.trim(),
    company: job.company?.trim() ?? '',
    description: job.snippet?.trim() ?? '',
    salaryMin,
    salaryMax,
    location: job.location?.trim() ?? '',
    url: job.link,
    postedAt: job.updated ? new Date(job.updated) : new Date(),
  };
}

/**
 * Best-effort extraction of numeric min/max from Jooble's free-text salary string.
 * Returns undefined for both if no recognisable number is found.
 *
 * Examples handled:
 *   "£40,000 – £60,000 per year"   → { salaryMin: 40000, salaryMax: 60000 }
 *   "£50,000"                       → { salaryMin: 50000, salaryMax: undefined }
 *   "Competitive"                   → { salaryMin: undefined, salaryMax: undefined }
 */
function parseSalaryString(
  salary: string | undefined,
): { salaryMin?: number; salaryMax?: number } {
  if (!salary) return {};

  // Strip currency symbols, commas, and common suffixes
  const cleaned = salary.replace(/[£$€,]/g, '').replace(/per\s+\w+/gi, '');

  // Match one or two numbers (e.g. "40000 – 60000" or "40000 to 60000")
  const numbers = [...cleaned.matchAll(/\d+(?:\.\d+)?/g)].map((m) =>
    Math.round(parseFloat(m[0])),
  );

  // Filter out implausible values (< 1000 are likely hourly or day rates misread as annual)
  // We keep them raw and let the normalisation layer handle the conversion.
  if (numbers.length === 0) return {};
  if (numbers.length === 1) return { salaryMin: numbers[0] };
  return { salaryMin: Math.min(...numbers), salaryMax: Math.max(...numbers) };
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
