import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, Calendar, Briefcase, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SponsorBadge } from "@/components/SponsorBadge";
import { ClearanceBadge } from "@/components/ClearanceBadge";
import type { Job } from "@/lib/types";
import { MOCK_JOBS } from "@/lib/mock/jobs";
import { JobActions } from "./JobActions";

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getJob(id: string): Promise<Job> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/jobs/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Not found");
    return res.json() as Promise<Job>;
  } catch {
    // Fall back to first mock job that matches, or just the first mock
    return MOCK_JOBS.find((j) => j.id === id) ?? MOCK_JOBS[0];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatSalary(job: Job): string {
  if (job.salary) return job.salary;
  if (job.salaryMinGbp && job.salaryMaxGbp) {
    return `£${(job.salaryMinGbp / 1000).toFixed(0)}k–£${(job.salaryMaxGbp / 1000).toFixed(0)}k`;
  }
  return "Salary not specified";
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Unknown date";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSeniority(s?: string): string {
  if (!s) return "Not specified";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ─── Sponsorship explanation card ─────────────────────────────────────────────

function SponsorExplainer({ job }: { job: Job }) {
  const confidence = job.sponsorConfidence;

  const title =
    confidence === "CONFIRMED"
      ? "Why Confirmed?"
      : confidence === "LIKELY"
        ? "Why Likely?"
        : "Sponsorship Unknown";

  const explanation =
    confidence === "CONFIRMED"
      ? "This employer is on the gov.uk skilled worker sponsor register and the job advert explicitly states that visa sponsorship is available."
      : confidence === "LIKELY"
        ? "This employer is on the gov.uk skilled worker sponsor register. The job ad does not explicitly mention sponsorship, but the register listing confirms they are eligible to sponsor."
        : confidence === "LOW_CONFIDENCE"
          ? "A partial name match was found on the gov.uk register, but confidence is low. Verify directly with the employer before applying."
          : "No match was found on the gov.uk skilled worker sponsor register. The employer may still sponsor — verify directly before applying.";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-slate-600 space-y-2">
        <p>{explanation}</p>
        <a
          href="https://www.gov.uk/check-uk-visa/y/andorra/work"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          gov.uk sponsor register <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </CardContent>
    </Card>
  );
}

// ─── Apply buttons (client component required for fetch) ──────────────────────

// Keeping these as a simple server-rendered form to avoid needing a client boundary
// for the entire page. POST is handled via Link to applications page for now.

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);

  return (
    <div className="p-6">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All Jobs
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Job header */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            {/* Title + company */}
            <div>
              <h1 className="text-xl font-semibold text-slate-900 leading-snug">
                {job.title}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{job.employer}</p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <SponsorBadge
                confidence={job.sponsorConfidence}
                matchReason={job.sponsorMatchReason}
              />
              {job.clearanceStatus !== "NONE_DETECTED" && (
                <ClearanceBadge status={job.clearanceStatus} />
              )}
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-start gap-2">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="text-xs text-slate-500">Salary</p>
                  <p className="text-xs font-medium text-slate-800">{formatSalary(job)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="text-xs text-slate-500">Location</p>
                  <p className="text-xs font-medium text-slate-800">{job.location ?? "Not specified"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="text-xs text-slate-500">Posted</p>
                  <p className="text-xs font-medium text-slate-800">{formatDate(job.postedAt)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="text-xs text-slate-500">Seniority</p>
                  <p className="text-xs font-medium text-slate-800">{formatSeniority(job.seniority)}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* CTAs */}
            <JobActions jobId={job.id} jobTitle={job.title} sourceUrl={job.sourceUrl} />
          </div>

          {/* Job description */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Job Description</h2>
            <div className="prose prose-sm prose-slate max-w-none">
              {job.description.split("\n").map((line, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed mb-2 last:mb-0">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-72 lg:shrink-0 space-y-4 lg:sticky lg:top-6">
          <SponsorExplainer job={job} />

          {/* Company details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Company</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 space-y-2">
              <p className="font-medium text-slate-800">{job.employer}</p>
              {job.subDomain && (
                <p>
                  Domain: <span className="font-medium">{job.subDomain}</span>
                </p>
              )}
              {job.source && (
                <p>
                  Listed via: <span className="font-medium">{job.source}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
