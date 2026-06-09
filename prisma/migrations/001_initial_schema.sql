-- JobScope — Initial Schema Migration
-- DB Engineer: 2026-06-08
-- Run after: (first migration)
-- Run before: 002_indexes.sql
--
-- Reversible: YES — see DROP statements at bottom of this file (commented out)
-- Extensions required: pgcrypto (gen_random_uuid), pg_trgm (fuzzy sponsor matching)
-- All IDs are UUID v4 — no sequential integers (IDOR prevention per architecture doc §6.2)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram fuzzy matching for sponsor names

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "ParseStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PENDING_REVIEW',
  'ACTIVE',
  'FAILED'
);

CREATE TYPE "Seniority" AS ENUM (
  'JUNIOR',
  'MID',
  'SENIOR'
);

CREATE TYPE "JobSource" AS ENUM (
  'ADZUNA',
  'REED',
  'JOOBLE',
  'RSS_JSONLD',
  'GOV_UK',
  'REMOTEOK'
);

CREATE TYPE "ClearanceStatus" AS ENUM (
  'REQUIRED',
  'PREFERRED',
  'NONE_DETECTED'
);

CREATE TYPE "LocationType" AS ENUM (
  'LONDON',
  'REMOTE',
  'HYBRID',
  'UK_OTHER',
  'UNKNOWN'
);

CREATE TYPE "ApplicationStatus" AS ENUM (
  'SAVED',
  'APPLIED',
  'APPLICATION_ACKNOWLEDGED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'GHOSTED',
  'WITHDRAWN'
);

CREATE TYPE "SponsorConfidence" AS ENUM (
  'CONFIRMED',
  'LIKELY',
  'LOW_CONFIDENCE',
  'UNKNOWN'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- NEXTAUTH TABLES
-- Standard NextAuth v5 Prisma adapter models
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "User" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "email"         TEXT        NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "name"          TEXT,
  "image"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Account" (
  "id"                UUID    NOT NULL DEFAULT gen_random_uuid(),
  "userId"            UUID    NOT NULL,
  "type"              TEXT    NOT NULL,
  "provider"          TEXT    NOT NULL,
  "providerAccountId" TEXT    NOT NULL,
  "refresh_token"     TEXT,
  "access_token"      TEXT,
  "expires_at"        INTEGER,
  "token_type"        TEXT,
  "scope"             TEXT,
  "id_token"          TEXT,
  "session_state"     TEXT,

  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key"
  ON "Account"("provider", "providerAccountId");

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Session" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "sessionToken" TEXT        NOT NULL,
  "userId"       UUID        NOT NULL,
  "expires"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VerificationToken" (
  "identifier" TEXT        NOT NULL,
  "token"      TEXT        NOT NULL,
  "expires"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key"
  ON "VerificationToken"("identifier", "token");

-- ─────────────────────────────────────────────────────────────────────────────
-- USER PROFILE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "UserProfile" (
  "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
  "userId"            UUID          NOT NULL,
  "resumeStorageKey"  TEXT,
  "resumeUploadedAt"  TIMESTAMP(3),
  "parseStatus"       "ParseStatus" NOT NULL DEFAULT 'PENDING',
  "skills"            TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "certifications"    TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subDomains"        TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "experienceYears"   INTEGER,
  "seniorityInferred" "Seniority",
  "rolesJson"         JSONB,
  "educationJson"     JSONB,
  "salaryMin"         INTEGER,
  "salaryMax"         INTEGER,
  "locationPrefs"     TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "seniorityPrefs"    "Seniority"[] NOT NULL DEFAULT ARRAY[]::"Seniority"[],
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "Job" (
  "id"                 UUID              NOT NULL DEFAULT gen_random_uuid(),
  "source"             "JobSource"       NOT NULL,
  "sourceId"           TEXT,
  "sourceUrl"          TEXT,
  "title"              TEXT              NOT NULL,
  "employer"           TEXT              NOT NULL,
  "employerNormalised" TEXT              NOT NULL,
  "description"        TEXT              NOT NULL,
  "salary"             TEXT,
  "salaryMinGbp"       INTEGER,
  "salaryMaxGbp"       INTEGER,
  "location"           TEXT,
  "locationNormalised" "LocationType"    NOT NULL DEFAULT 'UNKNOWN',
  "postedAt"           TIMESTAMP(3),
  "closedAt"           TIMESTAMP(3),
  "clearanceStatus"    "ClearanceStatus" NOT NULL DEFAULT 'NONE_DETECTED',
  "seniority"          "Seniority",
  "subDomain"          TEXT,
  "feedVisible"        BOOLEAN           NOT NULL DEFAULT true,
  "isActive"           BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)      NOT NULL,

  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- APPLICATION
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "Application" (
  "id"                       UUID                NOT NULL DEFAULT gen_random_uuid(),
  "userId"                   UUID                NOT NULL,
  "jobId"                    UUID                NOT NULL,
  "status"                   "ApplicationStatus" NOT NULL DEFAULT 'SAVED',
  "sponsorConfidenceAtApply" "SponsorConfidence",
  "clearanceStatusAtApply"   "ClearanceStatus",
  "salaryOffered"            INTEGER,
  "appliedAt"                TIMESTAMP(3),
  "recruiterName"            TEXT,
  "recruiterEmail"           TEXT,
  "recruiterAgency"          TEXT,
  "notes"                    TEXT,
  "ghostingFlaggedAt"        TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- SPONSOR REGISTER
-- pg_trgm GIN index on "nameNormalised" is in 003_trgm_index.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "SponsorRegister" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT         NOT NULL,
  "townCity"       TEXT,
  "county"         TEXT,
  "typeRating"     TEXT,
  "route"          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nameNormalised" TEXT         NOT NULL,
  "active"         BOOLEAN      NOT NULL DEFAULT true,
  "lastSeenAt"     TIMESTAMP(3) NOT NULL,
  "suspendedAt"    TIMESTAMP(3),
  "lastUpdated"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SponsorRegister_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB SPONSOR MATCH
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "JobSponsorMatch" (
  "id"              UUID               NOT NULL DEFAULT gen_random_uuid(),
  "jobId"           UUID               NOT NULL,
  "sponsorId"       UUID               NOT NULL,
  "confidenceTier"  "SponsorConfidence" NOT NULL,
  "matchReason"     TEXT               NOT NULL,
  "similarityScore" DOUBLE PRECISION,
  "createdAt"       TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobSponsorMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobSponsorMatch_jobId_sponsorId_key"
  ON "JobSponsorMatch"("jobId", "sponsorId");

ALTER TABLE "JobSponsorMatch"
  ADD CONSTRAINT "JobSponsorMatch_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobSponsorMatch"
  ADD CONSTRAINT "JobSponsorMatch_sponsorId_fkey"
  FOREIGN KEY ("sponsorId") REFERENCES "SponsorRegister"("id") ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RAW JOB INGESTION
-- contentHash UNIQUE constraint is the deduplication mechanism
-- INSERT ... ON CONFLICT (contentHash) DO NOTHING — no app-layer dedup needed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "RawJobIngestion" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "source"         "JobSource"  NOT NULL,
  "contentHash"    TEXT         NOT NULL,
  "rawJson"        JSONB        NOT NULL,
  "processedJobId" UUID,
  "ingestedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RawJobIngestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RawJobIngestion_contentHash_key" ON "RawJobIngestion"("contentHash");

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commented out — run manually if rollback needed)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "RawJobIngestion";
-- DROP TABLE IF EXISTS "JobSponsorMatch";
-- DROP TABLE IF EXISTS "SponsorRegister";
-- DROP TABLE IF EXISTS "Application";
-- DROP TABLE IF EXISTS "Job";
-- DROP TABLE IF EXISTS "UserProfile";
-- DROP TABLE IF EXISTS "VerificationToken";
-- DROP TABLE IF EXISTS "Session";
-- DROP TABLE IF EXISTS "Account";
-- DROP TABLE IF EXISTS "User";
-- DROP TYPE IF EXISTS "SponsorConfidence";
-- DROP TYPE IF EXISTS "ApplicationStatus";
-- DROP TYPE IF EXISTS "LocationType";
-- DROP TYPE IF EXISTS "ClearanceStatus";
-- DROP TYPE IF EXISTS "JobSource";
-- DROP TYPE IF EXISTS "Seniority";
-- DROP TYPE IF EXISTS "ParseStatus";
