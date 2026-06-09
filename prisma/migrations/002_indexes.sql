-- JobScope — Indexes Migration
-- DB Engineer: 2026-06-08
-- Run after: 001_initial_schema.sql
-- Run before: 003_trgm_index.sql
--
-- Reversible: YES — DROP INDEX statements at bottom
-- These are standard B-tree indexes for the query patterns documented in
-- docs/architecture/JOBSCOPE_ARCHITECTURE.md §3 (data flow) and
-- docs/projects/job-tracker/SCHEMA_DRAFT.md §5 (migration sequence)

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Employer name lookups (raw and normalised) — used by sponsor-matcher
CREATE INDEX IF NOT EXISTS "Job_employer_idx"
  ON "Job"("employer");

CREATE INDEX IF NOT EXISTS "Job_employerNormalised_idx"
  ON "Job"("employerNormalised");

-- Temporal ordering — used by stale-job-closer and feed pagination
CREATE INDEX IF NOT EXISTS "Job_postedAt_idx"
  ON "Job"("postedAt" DESC NULLS LAST);

-- Clearance filter — primary eligibility filter; most queries include this
CREATE INDEX IF NOT EXISTS "Job_clearanceStatus_idx"
  ON "Job"("clearanceStatus");

-- Primary feed query: WHERE feedVisible = true AND isActive = true ORDER BY postedAt DESC
-- This composite index covers the exact WHERE + ORDER BY pattern
CREATE INDEX IF NOT EXISTS "Job_feedVisible_isActive_postedAt_idx"
  ON "Job"("feedVisible", "isActive", "postedAt" DESC NULLS LAST);

-- Salary range filter
CREATE INDEX IF NOT EXISTS "Job_salaryMinGbp_salaryMaxGbp_idx"
  ON "Job"("salaryMinGbp", "salaryMaxGbp");

-- Source + sourceId: dedup reference lookup during ingestion
CREATE INDEX IF NOT EXISTS "Job_source_sourceId_idx"
  ON "Job"("source", "sourceId");

-- ─────────────────────────────────────────────────────────────────────────────
-- APPLICATION TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-user application list (all applications for a user, filtered by status)
CREATE INDEX IF NOT EXISTS "Application_userId_status_idx"
  ON "Application"("userId", "status");

-- Per-user timeline view
CREATE INDEX IF NOT EXISTS "Application_userId_appliedAt_idx"
  ON "Application"("userId", "appliedAt" DESC NULLS LAST);

-- Ghosting detector: find all APPLIED records older than 21 days
CREATE INDEX IF NOT EXISTS "Application_status_appliedAt_idx"
  ON "Application"("status", "appliedAt" DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- USER PROFILE TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- userId lookup (1:1 relation, but explicit index for ownership checks)
CREATE INDEX IF NOT EXISTS "UserProfile_userId_idx"
  ON "UserProfile"("userId");

-- ─────────────────────────────────────────────────────────────────────────────
-- SPONSOR REGISTER TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Exact match on normalised name (B-tree — fast for equality)
CREATE INDEX IF NOT EXISTS "SponsorRegister_nameNormalised_idx"
  ON "SponsorRegister"("nameNormalised");

-- Active sponsor filter — used in every sponsor-matcher query
CREATE INDEX IF NOT EXISTS "SponsorRegister_active_idx"
  ON "SponsorRegister"("active");

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB SPONSOR MATCH TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Job-level confidence lookup — primary feed enrichment query
CREATE INDEX IF NOT EXISTS "JobSponsorMatch_jobId_confidenceTier_idx"
  ON "JobSponsorMatch"("jobId", "confidenceTier");

-- Sponsor-level match lookup — used when re-processing after register update
CREATE INDEX IF NOT EXISTS "JobSponsorMatch_sponsorId_idx"
  ON "JobSponsorMatch"("sponsorId");

-- ─────────────────────────────────────────────────────────────────────────────
-- RAW JOB INGESTION TABLE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Source + time: used by per-source ingestion monitoring and status queries
CREATE INDEX IF NOT EXISTS "RawJobIngestion_source_ingestedAt_idx"
  ON "RawJobIngestion"("source", "ingestedAt" DESC);

-- contentHash: unique constraint already creates an index, this is explicit
-- documentation and ensures IF NOT EXISTS guard if constraint was added first
CREATE INDEX IF NOT EXISTS "RawJobIngestion_contentHash_idx"
  ON "RawJobIngestion"("contentHash");

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commented out — run manually if rollback needed)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "RawJobIngestion_contentHash_idx";
-- DROP INDEX IF EXISTS "RawJobIngestion_source_ingestedAt_idx";
-- DROP INDEX IF EXISTS "JobSponsorMatch_sponsorId_idx";
-- DROP INDEX IF EXISTS "JobSponsorMatch_jobId_confidenceTier_idx";
-- DROP INDEX IF EXISTS "SponsorRegister_active_idx";
-- DROP INDEX IF EXISTS "SponsorRegister_nameNormalised_idx";
-- DROP INDEX IF EXISTS "UserProfile_userId_idx";
-- DROP INDEX IF EXISTS "Application_status_appliedAt_idx";
-- DROP INDEX IF EXISTS "Application_userId_appliedAt_idx";
-- DROP INDEX IF EXISTS "Application_userId_status_idx";
-- DROP INDEX IF EXISTS "Job_source_sourceId_idx";
-- DROP INDEX IF EXISTS "Job_salaryMinGbp_salaryMaxGbp_idx";
-- DROP INDEX IF EXISTS "Job_feedVisible_isActive_postedAt_idx";
-- DROP INDEX IF EXISTS "Job_clearanceStatus_idx";
-- DROP INDEX IF EXISTS "Job_postedAt_idx";
-- DROP INDEX IF EXISTS "Job_employerNormalised_idx";
-- DROP INDEX IF EXISTS "Job_employer_idx";
