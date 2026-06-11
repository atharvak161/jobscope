/**
 * Shared types for all job-source integration adapters.
 * Every adapter normalises its source data into RawJobListing before returning.
 */

export type JobSource = 'adzuna' | 'reed' | 'remoteok' | 'jsearch' | 'activejobs' | 'indeed' | 'remoote';

export interface RawJobListing {
  source: JobSource;
  externalId: string;
  title: string;
  company: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  location: string;
  url: string;
  postedAt: Date;
}

/**
 * Thrown when an API responds with HTTP 429 Too Many Requests.
 * Callers (workers) must catch this and back off before retrying.
 */
export class RateLimitError extends Error {
  public readonly source: JobSource;
  /** Unix epoch ms when the caller may retry, if available from Retry-After header */
  public readonly retryAfterMs?: number;

  constructor(source: JobSource, retryAfterMs?: number) {
    super(`Rate limit hit for source: ${source}`);
    this.name = 'RateLimitError';
    this.source = source;
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when an external API returns an unexpected HTTP error (not 429).
 */
export class AdapterError extends Error {
  public readonly source: JobSource;
  public readonly statusCode: number;

  constructor(source: JobSource, statusCode: number, message: string) {
    super(`[${source}] HTTP ${statusCode}: ${message}`);
    this.name = 'AdapterError';
    this.source = source;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AdapterError.prototype);
  }
}

/**
 * Parsed row from the gov.uk Register of Licensed Sponsors CSV.
 */
export interface ParsedSponsor {
  name: string;
  city: string;
  county: string;
  routeType: string;
  rating: string;
}
