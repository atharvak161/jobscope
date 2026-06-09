/**
 * Barrel export for the job-source integration layer.
 *
 * Consumers import from '@/lib/integrations' — they do not import individual
 * adapter modules directly. This keeps the import surface stable even if
 * internal file structure changes.
 *
 * Usage examples:
 *   import { fetchAdzunaJobs, fetchReedJobs, fetchJoobleJobs } from '@/lib/integrations';
 *   import { computeJobHash } from '@/lib/integrations';
 *   import { downloadSponsorRegisterCSV, parseSponsorCSV, normaliseSponsorName } from '@/lib/integrations';
 *   import { RawJobListing, RateLimitError, AdapterError } from '@/lib/integrations';
 */

// Types and error classes
export type { RawJobListing, ParsedSponsor, JobSource } from './types';
export { RateLimitError, AdapterError } from './types';

// Job-source adapters
export { fetchAdzunaJobs } from './adzuna';
export { fetchReedJobs } from './reed';
export { fetchJoobleJobs } from './jooble';

// gov.uk sponsor register worker
export {
  downloadSponsorRegisterCSV,
  parseSponsorCSV,
  normaliseSponsorName,
} from './sponsor-register';

// Deduplication
export { computeJobHash } from './dedup';
