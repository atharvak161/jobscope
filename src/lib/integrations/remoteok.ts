import type { RawJobListing, JobSource } from './types';

/**
 * RemoteOK adapter — zero API key required.
 *
 * RemoteOK exposes a completely free, no-auth JSON API at
 * https://remoteok.com/api which returns an array of job objects.
 * The first element is a metadata object and is skipped.
 */
export async function fetchRemoteOKJobs(limit = 50): Promise<RawJobListing[]> {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'JobScope/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RemoteOK ${res.status}`);
  const data = await res.json();
  // First element is metadata, skip it
  const jobs = (Array.isArray(data) ? data.slice(1) : []).slice(0, limit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jobs.map((j: any): RawJobListing => ({
    externalId: String(j.id ?? j.slug ?? ''),
    source: 'remoteok' as JobSource,
    title: j.position ?? '',
    company: j.company ?? '',
    description: (j.description ?? '').replace(/<[^>]+>/g, ' ').trim(),
    location: 'Remote',
    url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
    salaryMin: j.salary_min ? Number(j.salary_min) : undefined,
    salaryMax: j.salary_max ? Number(j.salary_max) : undefined,
    postedAt: j.date ? new Date(j.date) : new Date(),
  }));
}
