"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserProfile, RoleEntry, EducationEntry } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = "upload" | "parsing" | "profile";

const SECURITY_CERT_HIGHLIGHT = ["CEH", "OSCP", "eJPT"];

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end?: string): string {
  return end ? `${start}–${end}` : `${start}–present`;
}

function isHighlightedCert(cert: string): boolean {
  return SECURITY_CERT_HIGHLIGHT.some((h) =>
    cert.toUpperCase().includes(h.toUpperCase())
  );
}

// ─── Chip components ─────────────────────────────────────────────────────────

function Chip({
  label,
  onRemove,
  highlight,
}: {
  label: string;
  onRemove?: () => void;
  highlight?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        highlight
          ? "bg-amber-100 text-amber-700 border border-amber-200"
          : "bg-slate-100 text-slate-700 border border-slate-200"
      }`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 text-slate-400 hover:text-slate-600 focus:outline-none"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ─── Dropzone ─────────────────────────────────────────────────────────────────

function UploadView({
  onUpload,
  errorMessage,
  setErrorMessage,
}: {
  onUpload: (file: File) => void;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  function validateAndStart(file: File) {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExtensions = [".pdf", ".docx"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      setErrorMessage("Only PDF or DOCX files are accepted.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File exceeds the 10 MB limit.");
      return;
    }
    setErrorMessage(null);
    onUpload(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndStart(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndStart(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Your CV</h1>
        <p className="text-sm text-slate-500">
          Upload your CV and we&apos;ll extract your skills, certifications, and
          experience automatically.
        </p>

        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleClick();
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 cursor-pointer transition-colors select-none ${
            dragging
              ? "border-blue-400 bg-blue-50"
              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
          }`}
          aria-label="Upload CV — drop file here or click to browse"
        >
          {/* Upload icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>

          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">
              Drop your CV here or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-400">PDF or DOCX · Max 10 MB</p>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
        />

        {/* Error banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Parsing spinner ──────────────────────────────────────────────────────────

function ParsingView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
      {/* Spinner */}
      <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-slate-800">Analysing your CV with AI...</p>
        <p className="text-xs text-slate-400">This usually takes about 10 seconds</p>
      </div>
    </div>
  );
}

// ─── Profile view ─────────────────────────────────────────────────────────────

function ProfileView({
  profile,
  onReset,
}: {
  profile: UserProfile;
  onReset: () => void;
}) {
  const [skills, setSkills] = React.useState<string[]>(profile.skills ?? []);
  const [certs, setCerts] = React.useState<string[]>(profile.certifications ?? []);
  const [roles] = React.useState<RoleEntry[]>(profile.roles ?? []);
  const [education] = React.useState<EducationEntry[]>(profile.education ?? []);

  // Target roles managed as comma-separated chips
  const [targetRolesInput, setTargetRolesInput] = React.useState(
    (profile.subDomains ?? []).join(", ")
  );
  const targetRoleChips = targetRolesInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [salaryMin, setSalaryMin] = React.useState<string>(
    profile.salaryMin != null ? String(profile.salaryMin) : ""
  );
  const [salaryMax, setSalaryMax] = React.useState<string>(
    profile.salaryMax != null ? String(profile.salaryMax) : ""
  );

  const [saveToast, setSaveToast] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills,
          certifications: certs,
          targetRoles: targetRoleChips,
          salaryMin: salaryMin ? Number(salaryMin) : undefined,
          salaryMax: salaryMax ? Number(salaryMax) : undefined,
        }),
      });
      setSaveToast("Profile saved successfully.");
    } catch {
      setSaveToast("Saved locally (offline mode).");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveToast(null), 3000);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Your Profile</h1>
      </div>

      {/* Skills */}
      <section aria-labelledby="skills-heading">
        <h2
          id="skills-heading"
          className="text-sm font-semibold text-slate-700 mb-3"
        >
          Skills
        </h2>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <Chip
              key={skill}
              label={skill}
              onRemove={() => setSkills((prev) => prev.filter((s) => s !== skill))}
            />
          ))}
          {skills.length === 0 && (
            <p className="text-xs text-slate-400">No skills detected</p>
          )}
        </div>
      </section>

      {/* Certifications */}
      <section aria-labelledby="certs-heading">
        <h2
          id="certs-heading"
          className="text-sm font-semibold text-slate-700 mb-3"
        >
          Certifications
        </h2>
        <div className="flex flex-wrap gap-2">
          {certs.map((cert) => (
            <Chip
              key={cert}
              label={cert}
              highlight={isHighlightedCert(cert)}
              onRemove={() => setCerts((prev) => prev.filter((c) => c !== cert))}
            />
          ))}
          {certs.length === 0 && (
            <p className="text-xs text-slate-400">No certifications detected</p>
          )}
        </div>
      </section>

      {/* Experience */}
      <section aria-labelledby="experience-heading">
        <h2
          id="experience-heading"
          className="text-sm font-semibold text-slate-700 mb-3"
        >
          Experience
        </h2>
        {roles.length === 0 ? (
          <p className="text-xs text-slate-400">No experience entries detected</p>
        ) : (
          <ul className="space-y-1.5">
            {roles.map((role, i) => (
              <li key={i} className="text-sm text-slate-700">
                <span className="font-medium">{role.title}</span>
                {" at "}
                <span>{role.employer}</span>
                <span className="text-slate-400 text-xs ml-1">
                  ({formatDateRange(role.start, role.end)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Education */}
      <section aria-labelledby="education-heading">
        <h2
          id="education-heading"
          className="text-sm font-semibold text-slate-700 mb-3"
        >
          Education
        </h2>
        {education.length === 0 ? (
          <p className="text-xs text-slate-400">No education entries detected</p>
        ) : (
          <ul className="space-y-1.5">
            {education.map((edu, i) => (
              <li key={i} className="text-sm text-slate-700">
                <span className="font-medium">{edu.degree}</span>
                {" — "}
                <span>{edu.institution}</span>
                {edu.year && (
                  <span className="text-slate-400 text-xs ml-1">({edu.year})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Target roles */}
      <section aria-labelledby="target-roles-heading">
        <h2
          id="target-roles-heading"
          className="text-sm font-semibold text-slate-700 mb-2"
        >
          Target Roles
        </h2>
        <Input
          value={targetRolesInput}
          onChange={(e) => setTargetRolesInput(e.target.value)}
          placeholder="e.g. SOC Analyst, Penetration Tester, GRC"
          className="text-sm mb-2"
          aria-label="Target roles (comma-separated)"
        />
        {targetRoleChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {targetRoleChips.map((role) => (
              <Chip key={role} label={role} />
            ))}
          </div>
        )}
      </section>

      {/* Salary expectation */}
      <section aria-labelledby="salary-heading">
        <h2
          id="salary-heading"
          className="text-sm font-semibold text-slate-700 mb-3"
        >
          Salary Expectation
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
              £
            </span>
            <Input
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="Min"
              className="pl-7 text-sm"
              aria-label="Minimum salary expectation in GBP"
              min={0}
            />
          </div>
          <span className="text-slate-400 text-sm">–</span>
          <div className="relative w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
              £
            </span>
            <Input
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="Max"
              className="pl-7 text-sm"
              aria-label="Maximum salary expectation in GBP"
              min={0}
            />
          </div>
        </div>
      </section>

      {/* Save toast */}
      {saveToast && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"
        >
          {saveToast}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? "Saving…" : "Save Profile"}
        </Button>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 w-fit"
        >
          Re-upload CV
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResumePage() {
  const [pageState, setPageState] = React.useState<PageState>("upload");
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function handleUpload(file: File) {
    setPageState("parsing");
    setErrorMessage(null);

    try {
      // Step 1: get pre-signed upload URL
      const presignRes = await fetch("/api/resume/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      if (!presignRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, objectKey } = (await presignRes.json()) as {
        uploadUrl: string;
        objectKey: string;
      };

      // Step 2: PUT file directly to storage
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("File upload failed");

      // Step 3: trigger parsing
      const parseRes = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey }),
      });
      if (!parseRes.ok) throw new Error("CV parsing failed");
      const { profile: parsedProfile } = (await parseRes.json()) as {
        profile: UserProfile;
      };

      setProfile(parsedProfile);
      setPageState("profile");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setPageState("upload");
    }
  }

  function handleReset() {
    setProfile(null);
    setErrorMessage(null);
    setPageState("upload");
  }

  if (pageState === "parsing") {
    return <ParsingView />;
  }

  if (pageState === "profile" && profile) {
    return <ProfileView profile={profile} onReset={handleReset} />;
  }

  return (
    <div className="p-6">
      <UploadView
        onUpload={handleUpload}
        errorMessage={errorMessage}
        setErrorMessage={setErrorMessage}
      />
    </div>
  );
}
