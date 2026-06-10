/**
 * Reed.co.uk Jobseeker API adapter.
 *
 * API documentation: https://www.reed.co.uk/developers/jobseeker
 * Rate limit: ~1,000 requests/day on free tier.
 * Auth: HTTP Basic auth — API key as username, empty password.
 *       Reed's auth scheme encodes as Base64("apiKey:") with the colon retained.
 *
 * Failure modes handled:
 *   - 429 Too Many Requests → RateLimitError (worker must back off)
 *   - 401 Unauthorised      → AdapterError (bad/expired key; do not retry without new key)
 *   - Other non-200         → AdapterError
 *   - Missing/null fields   → defensive defaults
 *   - Unexpected JSON shape → graceful skip per listing, logged to stderr
 *
 * Timeout: 15 seconds per request.
 * Retries: NOT handled here — the pg-boss worker layer owns retry + backoff.
 *
 * Note on distance parameter: 'distancefromcounterpart=15' (miles from location centroid).
 * Reed's API docs use 'distancefromcounterpart'; some older docs show 'distancefromlocation'.
 * We use the documented name as of Reed API v1.
 */

import { type RawJobListing, RateLimitError, AdapterError } from './types';

const BASE_URL = 'https://www.reed.co.uk/api/1.0/search';
const TIMEOUT_MS = 15_000;

// ─── Reed response shape (partial — only fields we use) ────────────────────

interface ReedJobResult {
  jobId: number;
  jobTitle?: string;
  employerName?: string;
  jobDescription?: string;
  minimumSalary?: number;
  maximumSalary?: number;
  locationName?: string;
  jobUrl?: string;
  date?: string;
  expirationDate?: string;
}

interface ReedSearchResponse {
  results?: ReedJobResult[];
  totalResults?: number;
  ambiguous?: boolean;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Fetch Reed job listings for the given query and location.
 *
 * Reed's free API does not support pagination in a simple page-number scheme;
 * it supports 'resultsToTake' and 'resultsToSkip' for offset-based pagination.
 * This function fetches up to 100 results per call (Reed's documented maximum).
 *
 * @param query    Keywords, e.g. "cybersecurity" or "penetration testing"
 * @param location UK location string, e.g. "London" or "United Kingdom"
 * @returns        Array of normalised RawJobListing objects
 * @throws         RateLimitError on HTTP 429
 * @throws         AdapterError   on other non-200 HTTP responses
 * @throws         Error          on network failure, timeout, or missing credentials
 */
export async function fetchReedJobs(
  query: string,
  location: string,
): Promise<RawJobListing[]> {
  const apiKey = process.env.REED_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Reed credentials missing: set REED_API_KEY environment variable.',
    );
  }

  // Reed uses HTTP Basic auth: apiKey as username, empty string as password.
  // Base64("apiKey:") — note the trailing colon is part of the standard.
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');

  const params = new URLSearchParams({
    keywords: query,
    location: location,
    distancefromcounterpart: '15',
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
        Authorization: `Basic ${credentials}`,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get('Retry-After'));
    throw new RateLimitError('reed', retryAfter);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AdapterError('reed', response.status, body.slice(0, 200));
  }

  const data = (await response.json()) as ReedSearchResponse;
  const results = data.results ?? [];

  const listings: RawJobListing[] = [];
  for (const result of results) {
    try {
      listings.push(mapReedResult(result));
    } catch (err) {
      console.error('[reed] Failed to map result id=%s: %s', result.jobId, (err as Error).message);
    }
  }

  return listings;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

function mapReedResult(result: ReedJobResult): RawJobListing {
  if (!result.jobId) throw new Error('Missing jobId');
  if (!result.jobTitle) throw new Error('Missing jobTitle');

  return {
    source: 'reed',
    externalId: String(result.jobId),
    title: result.jobTitle.trim(),
    company: result.employerName?.trim() ?? '',
    description: result.jobDescription?.trim() ?? '',
    salaryMin: result.minimumSalary != null ? Math.round(result.minimumSalary) : undefined,
    salaryMax: result.maximumSalary != null ? Math.round(result.maximumSalary) : undefined,
    location: result.locationName?.trim() ?? '',
    url: result.jobUrl ?? '',
    postedAt: result.date ? parseReedDate(result.date) : new Date(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse a Reed API date string in `dd/MM/yyyy HH:mm:ss` format.
 * JavaScript's Date constructor cannot parse this UK locale format directly.
 * Falls back to `new Date()` (now) if the string is missing or unparseable.
 */
function parseReedDate(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart ?? '00:00:00'}`;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

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
