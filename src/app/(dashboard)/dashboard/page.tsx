"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SponsorBadge } from "@/components/SponsorBadge";
import type { Job, Application, JobStatsApiResponse } from "@/lib/types";

interface DashboardData {
  stats: JobStatsApiResponse;
  recentJobs: Job[];
  recentApplications: Application[];
}

function StatCard({
  label,
  value,
  icon: Icon,
  description,
  colour,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  colour: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            {description && (
              <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            )}
          </div>
          <div className={`rounded-lg p-2 ${colour}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDaysAgo(dateStr?: string): string {
  if (!dateStr) return "recently";
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const STATUS_LABELS: Record<string, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  APPLICATION_ACKNOWLEDGED: "Acknowledged",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  GHOSTED: "Ghosted",
  WITHDRAWN: "Withdrawn",
};

async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const [statsRes, jobsRes, appsRes] = await Promise.all([
      fetch("/api/jobs/stats"),
      fetch("/api/jobs?limit=5&sort=score"),
      fetch("/api/applications?limit=5"),
    ]);

    if (!statsRes.ok || !jobsRes.ok || !appsRes.ok) throw new Error("API unavailable");

    const [stats, jobsData, appsData] = await Promise.all([
      statsRes.json() as Promise<JobStatsApiResponse>,
      jobsRes.json(),
      appsRes.json(),
    ]);

    return {
      stats,
      recentJobs: jobsData.jobs ?? [],
      recentApplications: appsData.applications ?? [],
    };
  } catch {
    // No mock fallback — show empty/zero state on API failure
    return {
      stats: {
        newToday: 0,
        totalEligible: 0,
        confirmedSponsors: 0,
        likelySponsors: 0,
        unknownSponsors: 0,
      },
      recentJobs: [],
      recentApplications: [],
    };
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await fetchDashboardData();
    setData(result);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const activePipeline = data?.recentApplications.filter(
    (a) => !["GHOSTED", "REJECTED", "ACCEPTED", "WITHDRAWN"].includes(a.status)
  ).length ?? 0;

  const interviewRate =
    data && data.recentApplications.length > 0
      ? Math.round(
          (data.recentApplications.filter((a) =>
            ["INTERVIEWING", "INTERVIEW_SCHEDULED", "OFFER", "ACCEPTED"].includes(
              a.status
            )
          ).length /
            data.recentApplications.length) *
            100
        )
      : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Your UK cybersecurity job search at a glance
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={load}
          aria-label="Refresh dashboard"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="New Eligible Today"
            value={data?.stats.newToday ?? 0}
            icon={Briefcase}
            description={`${data?.stats.confirmedSponsors ?? 0} confirmed sponsors`}
            colour="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Total Eligible Jobs"
            value={data?.stats.totalEligible ?? 0}
            icon={TrendingUp}
            description="Matching your profile"
            colour="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Active Pipeline"
            value={activePipeline}
            icon={Clock}
            description="Not ghosted or rejected"
            colour="bg-amber-50 text-amber-600"
          />
          <StatCard
            label="Interview Rate"
            value={`${interviewRate}%`}
            icon={CheckCircle2}
            description="Applications → interview"
            colour="bg-purple-50 text-purple-600"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Jobs */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Matching Jobs</CardTitle>
              <Link
                href="/jobs"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="py-3">
                    <Skeleton className="h-4 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              : data?.recentJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-start justify-between py-3 hover:bg-slate-50 -mx-5 px-5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {job.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {job.employer} · {job.location}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-1.5">
                      <SponsorBadge
                        confidence={job.sponsorConfidence}
                        showTooltip={false}
                      />
                    </div>
                  </Link>
                ))}
          </CardContent>
        </Card>

        {/* Recent Applications */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Applications</CardTitle>
              <Link
                href="/applications"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="py-3">
                    <Skeleton className="h-4 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              : data?.recentApplications.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-start justify-between py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {app.job.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {app.job.employer} · {formatDaysAgo(app.appliedAt)}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        app.status === "GHOSTED"
                          ? "bg-slate-100 text-slate-500"
                          : app.status === "INTERVIEWING" ||
                              app.status === "INTERVIEW_SCHEDULED"
                            ? "bg-blue-100 text-blue-700"
                            : app.status === "OFFER"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABELS[app.status] ?? app.status}
                    </span>
                  </div>
                ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick action */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-900">
            Find jobs matching your profile
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            Use your parsed CV to pre-load smart filters
          </p>
        </div>
        <Button
          onClick={() => router.push("/jobs?profile=1")}
          size="sm"
          className="shrink-0"
        >
          Find matching jobs
        </Button>
      </div>
    </div>
  );
}
