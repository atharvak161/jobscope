"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface JobActionsProps {
  jobId: string;
  jobTitle: string;
  sourceUrl?: string;
}

export function JobActions({ jobId, jobTitle, sourceUrl }: JobActionsProps) {
  const [applyState, setApplyState] = React.useState<"idle" | "loading" | "done">("idle");
  const [saveState, setSaveState] = React.useState<"idle" | "loading" | "done">("idle");

  async function handleApply() {
    setApplyState("loading");
    try {
      await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status: "APPLIED" }),
      });
      setApplyState("done");
    } catch {
      setApplyState("idle");
    }
  }

  async function handleSave() {
    setSaveState("loading");
    try {
      await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status: "SAVED" }),
      });
      setSaveState("done");
    } catch {
      setSaveState("idle");
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 text-white"
        onClick={handleApply}
        disabled={applyState === "loading" || applyState === "done"}
        aria-label={`Apply to ${jobTitle}`}
      >
        {applyState === "done"
          ? "Applied ✓"
          : applyState === "loading"
            ? "Applying…"
            : "Apply Now"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSave}
        disabled={saveState === "loading" || saveState === "done"}
        aria-label={`Save ${jobTitle} for later`}
      >
        {saveState === "done"
          ? "Saved ✓"
          : saveState === "loading"
            ? "Saving…"
            : "Save for later"}
      </Button>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          View original →
        </a>
      )}
    </div>
  );
}
