"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SponsorBadge } from "@/components/SponsorBadge";
import { ClearanceBadge } from "@/components/ClearanceBadge";
import type { Job, JobsApiResponse, SponsorConfidence, LocationType, Seniority } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationFilter = "ALL" | LocationType;
type SeniorityFilter = "ALL" | Seniority;
type DomainFilter = "ALL" | string;
type SponsorFilter = "ALL" | SponsorConfidence;
type AgeFilter = "ALL" | "7" | "14" | "30";

interface Filters {
  location: LocationFilter;
  seniority: SeniorityFilter;
  domain: DomainFilter;
  sponsorship: SponsorFilter;
  excludeSC: boolean;
  searchQuery: string;
  postedWithin: AgeFilter;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const LOCATION_OPTIONS: { label: string; value: LocationFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "London", value: "LONDON" },
  { label: "Remote", value: "REMOTE" },
  { label: "Hybrid", value: "HYBRID" },
];

const SENIORITY_OPTIONS: { label: string; value: SeniorityFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Junior", value: "JUNIOR" },
  { label: "Mid", value: "MID" },
  { label: "Senior", value: "SENIOR" },
];

const DOMAIN_OPTIONS: { label: string; value: DomainFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "SOC / Analyst", value: "SOC_ANALYST" },
  { label: "Pentest", value: "PENETRATION_TESTER" },
  { label: "GRC / Compliance", value: "GRC_COMPLIANCE" },
  { label: "AppSec", value: "APP_SEC" },
  { label: "Cloud Security", value: "CLOUD_SECURITY" },
  { label: "Infrastructure", value: "INFRASTRUCTURE_SECURITY" },
  { label: "Vuln Management", value: "VULN_MANAGEMENT" },
];

const SPONSOR_OPTIONS: { label: string; value: SponsorFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Likely", value: "LIKELY" },
];

const AGE_OPTIONS: { label: string; value: AgeFilter }[] = [
  { label: "Any time", value: "ALL" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDaysAgo(dateStr?: string): string {
  if (!dateStr) return "recently";
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function formatSalary(job: Job): string {
  if (job.salary) return job.salary;
  if (job.salaryMinGbp && job.salaryMaxGbp) {
    return `£${(job.salaryMinGbp / 1000).toFixed(0)}k–£${(job.salaryMaxGbp / 1000).toFixed(0)}k`;
  }
  return "Salary not specified";
}

async function fetchJobs(filters: Filters, page: number): Promise<JobsApiResponse> {
  const params = new URLSearchParams();
  if (filters.location !== "ALL") params.set("location", filters.location);
  if (filters.seniority !== "ALL") params.set("seniority", filters.seniority);
  if (filters.domain !== "ALL") params.set("subDomain", filters.domain);
  if (filters.sponsorship !== "ALL") params.set("sponsorConfidence", filters.sponsorship);
  if (filters.excludeSC) params.set("excludeSC", "true");
  if (filters.searchQuery) params.set("q", filters.searchQuery);
  if (filters.postedWithin !== "ALL") params.set("postedWithin", filters.postedWithin);
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));

  const res = await fetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error("API unavailable");
  return res.json() as Promise<JobsApiResponse>;
}

function postApplication(jobId: string, status: "SAVED" | "APPLIED") {
  return fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, status }),
  });
}

// ─── Filter chip group ────────────────────────────────────────────────────────

function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === opt.value
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: Job }) {
  const [saving, setSaving] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  const [noUrlNotice, setNoUrlNotice] = React.useState(false);

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await postApplication(job.id, "SAVED");
      setSaved(true);
    } catch {
      // silently fail — offline/mock mode
    } finally {
      setSaving(false);
    }
  }

  async function handleApply(e: React.MouseEvent) {
    e.preventDefault();
    setApplying(true);
    try {
      await postApplication(job.id, "APPLIED");
      setApplied(true);
      if (job.sourceUrl) {
        window.open(job.sourceUrl, "_blank", "noopener,noreferrer");
      } else {
        setNoUrlNotice(true);
        setTimeout(() => setNoUrlNotice(false), 4000);
      }
    } catch {
      // silently fail — offline/mock mode
    } finally {
      setApplying(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors">
      {/* Header */}
      <div>
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors leading-snug block"
        >
          {job.title}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">{job.employer}</p>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <SponsorBadge
          confidence={job.sponsorConfidence}
          matchReason={job.sponsorMatchReason}
        />
        {job.clearanceStatus !== "NONE_DETECTED" && (
          <ClearanceBadge status={job.clearanceStatus} />
        )}
      </div>

      {/* Salary */}
      <p className="text-xs font-medium text-slate-700">{formatSalary(job)}</p>

      {/* Meta */}
      <p className="text-xs text-slate-400">
        {job.location}
        {job.seniority && ` · ${job.seniority.charAt(0) + job.seniority.slice(1).toLowerCase()}`}
        {` · ${formatDaysAgo(job.postedAt)}`}
      </p>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={handleSave}
          disabled={saving || saved}
          aria-label={`Save ${job.title} at ${job.employer}`}
        >
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleApply}
          disabled={applying || applied}
          aria-label={`Apply to ${job.title} at ${job.employer}`}
        >
          {applied ? "Applied ✓" : applying ? "Applying…" : "Apply"}
        </Button>
      </div>
      {noUrlNotice && (
        <p className="text-xs text-slate-500 text-center">No direct link available</p>
      )}
    </article>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-1 h-3 w-1/2" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>({
    location: "ALL",
    seniority: "ALL",
    domain: "ALL",
    sponsorship: "ALL",
    excludeSC: true,
    searchQuery: "",
    postedWithin: "ALL",
  });
  const [page, setPage] = React.useState(1);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [searchMsg, setSearchMsg] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (f: Filters, p: number) => {
      setLoading(true);
      try {
        const data = await fetchJobs(f, p);
        setJobs(data.jobs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch {
        // No mock fallback — show empty state on API failure
        setJobs([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    load(filters, page);
  }, [filters, page, load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function triggerSearch(q: string) {
    setFilters((prev) => ({ ...prev, searchQuery: q }));
    setPage(1);
  }

  function handleSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => triggerSearch(q), 500);
  }

  function clearSearch() {
    setSearchQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    triggerSearch("");
  }

  async function handleSearch() {
    setSearching(true);
    setSearchMsg(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "cybersecurity", location: "uk" }),
      });
      const data = await res.json() as { ok: boolean; result?: { ingested: number; skipped: number; errors: number } };
      if (data.ok && data.result) {
        setSearchMsg(`Found ${data.result.ingested} new jobs (${data.result.skipped} already seen)`);
      } else {
        setSearchMsg("Search complete");
      }
      // Reload feed with fresh results
      await load(filters, 1);
      setPage(1);
    } catch {
      setSearchMsg("Search failed — check console");
    } finally {
      setSearching(false);
      setTimeout(() => setSearchMsg(null), 5000);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-6 space-y-5">
      {/* Page heading + Search Jobs button */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Job Feed</h1>
        <div className="flex items-center gap-3">
          {searchMsg && (
            <span className="text-xs text-slate-500">{searchMsg}</span>
          )}
          <Button
            onClick={handleSearch}
            disabled={searching}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 h-auto"
          >
            {searching ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Searching…
              </span>
            ) : (
              "Search Jobs"
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        {/* Keyword search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                triggerSearch(searchQuery);
              }
            }}
            placeholder="Search jobs… e.g. pentest london"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search jobs by keyword"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ×
            </button>
          )}
        </div>

        {/* Location */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Location</span>
          <FilterChipGroup
            options={LOCATION_OPTIONS}
            value={filters.location}
            onChange={(v) => updateFilter("location", v)}
          />
        </div>

        {/* Seniority */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Seniority</span>
          <FilterChipGroup
            options={SENIORITY_OPTIONS}
            value={filters.seniority}
            onChange={(v) => updateFilter("seniority", v)}
          />
        </div>

        {/* Domain */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Domain</span>
          <FilterChipGroup
            options={DOMAIN_OPTIONS}
            value={filters.domain}
            onChange={(v) => updateFilter("domain", v)}
          />
        </div>

        {/* Sponsorship */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Sponsor</span>
          <FilterChipGroup
            options={SPONSOR_OPTIONS}
            value={filters.sponsorship}
            onChange={(v) => updateFilter("sponsorship", v)}
          />
        </div>

        {/* SC exclusion toggle */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <Switch
            id="exclude-sc"
            checked={filters.excludeSC}
            onCheckedChange={(checked) => updateFilter("excludeSC", checked)}
            aria-label="Hide SC-required roles"
          />
          <label
            htmlFor="exclude-sc"
            className="text-xs font-medium text-slate-600 cursor-pointer select-none"
          >
            Hide SC-required roles
          </label>
        </div>

        {/* Posted age filter */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 w-20 shrink-0">Posted</span>
          <FilterChipGroup
            options={AGE_OPTIONS}
            value={filters.postedWithin}
            onChange={(v) => updateFilter("postedWithin", v)}
          />
        </div>
      </div>

      {/* Results header */}
      {!loading && (
        <p className="text-xs text-slate-500">
          {total === 0
            ? "No eligible jobs found"
            : `Showing ${from}–${to} of ${total} jobs`}
        </p>
      )}

      {/* Job grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-600">
            No eligible jobs found — try adjusting your filters
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              setFilters({
                location: "ALL",
                seniority: "ALL",
                domain: "ALL",
                sponsorship: "ALL",
                excludeSC: true,
                searchQuery: "",
                postedWithin: "ALL",
              });
              setPage(1);
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Previous
          </Button>
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
