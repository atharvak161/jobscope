"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SponsorBadge } from "@/components/SponsorBadge";
import type { Application, ApplicationStatus } from "@/lib/types";
import { MOCK_APPLICATIONS } from "@/lib/mock/applications";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: ApplicationStatus[] = [
  "SAVED",
  "APPLIED",
  "APPLICATION_ACKNOWLEDGED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEWING",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "GHOSTED",
  "WITHDRAWN",
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
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

/** Map each status to Tailwind classes for the badge span */
function statusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case "SAVED":
      return "bg-slate-100 text-slate-600 border border-slate-200";
    case "APPLIED":
      return "bg-blue-50 text-blue-600 border border-blue-200";
    case "APPLICATION_ACKNOWLEDGED":
      return "bg-purple-50 text-purple-600 border border-purple-200";
    case "INTERVIEW_SCHEDULED":
      return "bg-amber-50 text-amber-600 border border-amber-200";
    case "INTERVIEWING":
      return "bg-amber-100 text-amber-700 border border-amber-300";
    case "OFFER":
      return "bg-emerald-50 text-emerald-600 border border-emerald-200";
    case "ACCEPTED":
      return "bg-emerald-100 text-emerald-800 border border-emerald-300";
    case "REJECTED":
      return "bg-red-50 text-red-500 border border-red-200";
    case "GHOSTED":
      return "bg-slate-100 text-slate-400 border border-slate-200";
    case "WITHDRAWN":
      return "bg-slate-50 text-slate-300 border border-slate-100";
  }
}

// ─── Kanban column definitions ────────────────────────────────────────────────

interface KanbanColumn {
  label: string;
  statuses: ApplicationStatus[];
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { label: "Saved", statuses: ["SAVED"] },
  { label: "Applied", statuses: ["APPLIED", "APPLICATION_ACKNOWLEDGED", "INTERVIEW_SCHEDULED"] },
  { label: "Interviewing", statuses: ["INTERVIEWING"] },
  { label: "Offer", statuses: ["OFFER", "ACCEPTED"] },
  { label: "Outcome", statuses: ["REJECTED", "GHOSTED", "WITHDRAWN"] },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDaysSince(dateStr?: string): string {
  const d = daysSince(dateStr);
  if (d === 0) return "today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

// ─── Status badge component ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const isGhosted = status === "GHOSTED";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)} ${isGhosted ? "line-through" : ""}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Status select ────────────────────────────────────────────────────────────

function StatusSelect({
  current,
  onSelect,
}: {
  current: ApplicationStatus;
  onSelect: (s: ApplicationStatus) => void;
}) {
  return (
    <Select value={current} onValueChange={(v) => onSelect(v as ApplicationStatus)}>
      <SelectTrigger className="h-7 w-44 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ applications }: { applications: Application[] }) {
  const inactive: ApplicationStatus[] = ["REJECTED", "GHOSTED", "WITHDRAWN"];
  const active = applications.filter((a) => !inactive.includes(a.status));

  const appliedStatuses: ApplicationStatus[] = [
    "APPLIED",
    "APPLICATION_ACKNOWLEDGED",
    "INTERVIEW_SCHEDULED",
    "INTERVIEWING",
    "OFFER",
    "ACCEPTED",
    "REJECTED",
    "GHOSTED",
  ];
  const appliedCount = applications.filter((a) =>
    appliedStatuses.includes(a.status)
  ).length;

  const interviewStatuses: ApplicationStatus[] = [
    "INTERVIEW_SCHEDULED",
    "INTERVIEWING",
    "OFFER",
    "ACCEPTED",
  ];
  const interviewCount = applications.filter((a) =>
    interviewStatuses.includes(a.status)
  ).length;

  const interviewRate =
    appliedCount === 0
      ? "–"
      : `${((interviewCount / appliedCount) * 100).toFixed(0)}%`;

  // Most recent appliedAt across all apps
  const latestApplied = applications
    .filter((a) => a.appliedAt)
    .sort(
      (a, b) =>
        new Date(b.appliedAt!).getTime() - new Date(a.appliedAt!).getTime()
    )[0];
  const daysSinceLast = latestApplied ? daysSince(latestApplied.appliedAt) : null;

  const stats = [
    { label: "Active applications", value: String(active.length) },
    { label: "Interview rate", value: interviewRate },
    {
      label: "Days since last application",
      value: daysSinceLast === null ? "–" : String(daysSinceLast),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
          <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function TableView({
  applications,
  onStatusChange,
  onDelete,
}: {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-16 text-center">
        <p className="text-sm text-slate-500">No applications yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3 text-xs font-medium text-slate-500 w-40">Company</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500">Role</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 w-40">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 w-32">Sponsor</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 w-32">Days applied</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 w-56">Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const isGhosted = app.status === "GHOSTED";
            const rowClass = isGhosted
              ? "border-b border-slate-100 italic text-slate-400"
              : "border-b border-slate-100 text-slate-700";
            return (
              <tr key={app.id} className={rowClass}>
                <td className="px-4 py-3 font-medium truncate max-w-[160px]">
                  {app.job.employer}
                </td>
                <td className="px-4 py-3 truncate max-w-[200px]">{app.job.title}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={app.status} />
                </td>
                <td className="px-4 py-3">
                  <SponsorBadge
                    confidence={app.job.sponsorConfidence}
                    showTooltip={false}
                  />
                </td>
                <td className="px-4 py-3 text-xs">
                  {formatDaysSince(app.appliedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusSelect
                      current={app.status}
                      onSelect={(s) => onStatusChange(app.id, s)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:border-red-200"
                      onClick={() => onDelete(app.id)}
                      aria-label={`Delete application for ${app.job.title}`}
                    >
                      ✕
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

function KanbanCard({
  app,
  onStatusChange,
}: {
  app: Application;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
      <div>
        <p className="text-xs font-semibold text-slate-900 leading-snug">{app.job.employer}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{app.job.title}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        <SponsorBadge confidence={app.job.sponsorConfidence} showTooltip={false} />
      </div>
      <p className="text-xs text-slate-400">{formatDaysSince(app.appliedAt)} ago</p>
      {open ? (
        <div className="flex items-center gap-1.5">
          <StatusSelect
            current={app.status}
            onSelect={(s) => {
              onStatusChange(app.id, s);
              setOpen(false);
            }}
          />
          <button
            className="text-xs text-slate-400 hover:text-slate-600"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => setOpen(true)}
        >
          Move →
        </Button>
      )}
    </div>
  );
}

function KanbanView({
  applications,
  onStatusChange,
}: {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-3 overflow-x-auto">
      {KANBAN_COLUMNS.map((col) => {
        const cards = applications.filter((a) => col.statuses.includes(a.status));
        return (
          <div key={col.label} className="min-w-[180px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">{col.label}</span>
              <Badge variant="default" className="text-xs px-1.5 py-0">
                {cards.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 py-6 text-center">
                  <p className="text-xs text-slate-400">No applications here</p>
                </div>
              ) : (
                cards.map((app) => (
                  <KanbanCard key={app.id} app={app} onStatusChange={onStatusChange} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const [applications, setApplications] = React.useState<Application[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/applications");
        if (!res.ok) throw new Error("API unavailable");
        const data = (await res.json()) as { applications: Application[] };
        if (!cancelled) setApplications(data.applications);
      } catch {
        if (!cancelled) setApplications(MOCK_APPLICATIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    try {
      await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // silently accept — mock mode
    }
  }

  async function handleDelete(id: string) {
    // Optimistic remove
    setApplications((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/applications/${id}`, { method: "DELETE" });
    } catch {
      // silently accept — mock mode
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-5">
        <h1 className="text-xl font-semibold text-slate-900">Applications</h1>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 animate-pulse"
            >
              <div className="h-7 w-12 bg-slate-100 rounded mb-1" />
              <div className="h-3 w-28 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Applications</h1>

      {/* Stats */}
      <StatsRow applications={applications} />

      {/* Tabs */}
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <TableView
            applications={applications}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <KanbanView
            applications={applications}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
