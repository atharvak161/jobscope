/**
 * Content-hash deduplication for raw job ingestion.
 *
 * The hash is stored in raw_job_ingestion.content_hash which has a UNIQUE constraint.
 * Any attempt to INSERT a row whose hash already exists is a no-op (ON CONFLICT DO NOTHING).
 *
 * Hash input is deliberately narrow — we only include fields that uniquely identify
 * a job listing across sources. Including description or salary would cause
 * "new" hashes for the same job if the employer updates the listing text, which
 * would incorrectly treat the update as a new listing.
 *
 * Hash composition: SHA-256 of the pipe-delimited string:
 *   {source}|{externalId}|{company}|{title}
 *
 * All components are lowercased and trimmed before hashing to prevent
 * hash mismatches caused purely by whitespace or capitalisation differences.
 *
 * Note: The architecture doc describes the hash as including description[:200].
 * We intentionally omit description here because:
 *   1. Description frequently changes (salary updates, typo fixes).
 *   2. The (source, externalId) pair is already globally unique per source.
 *   3. Including description would cause duplicate jobs on minor edits.
 * If future requirements change (e.g. detect updated descriptions as new ingestion events),
 * add a separate content_version_hash column rather than changing this one.
 */

import { createHash } from 'crypto';
import { type RawJobListing } from './types';

/**
 * Computes a stable SHA-256 deduplication hash for a job listing.
 *
 * The hash is deterministic: the same job fetched from the same source
 * twice will always produce the same hash, regardless of when it was fetched.
 *
 * @param job A RawJobListing from any adapter
 * @returns   Hex-encoded SHA-256 string (64 characters)
 *
 * @example
 *   computeJobHash({
 *     source: 'adzuna',
 *     externalId: '123',
 *     company: 'HSBC Bank Plc',
 *     title: 'Senior Security Engineer',
 *     ...
 *   })
 *   // → "a3f1..." (64-char hex string)
 */
export function computeJobHash(job: RawJobListing): string {
  const input = [
    job.source.toLowerCase().trim(),
    job.externalId.toLowerCase().trim(),
    job.company.toLowerCase().trim(),
    job.title.toLowerCase().trim(),
  ].join('|');

  return createHash('sha256').update(input, 'utf8').digest('hex');
}
