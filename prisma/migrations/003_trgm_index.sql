-- JobScope — pg_trgm GIN Index Migration (CRITICAL)
-- DB Engineer: 2026-06-08
-- Run after: 002_indexes.sql
-- Run before: 004_seed_sponsor_register.sql (Integration Engineer deliverable)
--
-- Reversible: YES — DROP INDEX statement at bottom
--
-- WHY THIS FILE EXISTS (cannot be expressed in Prisma schema):
-- Prisma's @@index directive does not support GIN indexes with operator classes
-- such as gin_trgm_ops. Attempting to do so results in a schema validation error.
-- This index MUST be added as raw SQL outside the Prisma migration system.
--
-- WHY THIS INDEX IS CRITICAL:
-- The sponsor-matching engine uses a pg_trgm similarity query to fuzzy-match
-- normalised employer names against the gov.uk sponsor register:
--   SELECT * FROM "SponsorRegister"
--   WHERE similarity("nameNormalised", $1) >= 0.60
--     AND active = true;
-- The SponsorRegister table contains ~60,000 rows from the full gov.uk CSV.
-- Without this GIN index, every ingestion batch runs a full sequential scan of
-- all 60k rows for EACH job being processed. At 100 jobs per batch that is
-- 6,000,000 row comparisons per batch, spiking Postgres CPU
-- and causing the sponsor-matcher worker to time out.
--
-- With the GIN index, pg_trgm uses the inverted index to narrow candidates
-- before scoring, reducing the scan to O(matches) not O(table_size).
--
-- Source: docs/projects/job-tracker/SCHEMA_DRAFT.md §3 (SponsorRegister notes)
--         docs/architecture/JOBSCOPE_ARCHITECTURE.md §2 (sponsor-matching engine)

-- ─────────────────────────────────────────────────────────────────────────────
-- PREREQUISITE CHECK
-- pg_trgm must already be installed (done in 001_initial_schema.sql)
-- This is a safety assertion — will raise a notice if already present
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify pg_trgm is installed (will error if not, which is the right behaviour)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION 'pg_trgm extension is not installed. Run 001_initial_schema.sql first.';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GIN TRIGRAM INDEX
-- CONCURRENTLY: allows the index build to proceed without locking the table.
-- Existing data can still be read/written during index construction.
-- On a fresh DB this is instant; on a populated DB (post gov.uk CSV load) this
-- may take a few seconds — CONCURRENTLY avoids blocking the sponsor-matcher.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sponsor_name_normalised_trgm"
  ON "SponsorRegister"
  USING GIN ("nameNormalised" gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- After creation, confirm the index exists and uses the expected access method
-- ─────────────────────────────────────────────────────────────────────────────

-- Run this query manually after migration to verify:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'SponsorRegister'
--   AND indexname = 'idx_sponsor_name_normalised_trgm';
-- Expected result: indexdef contains "USING gin" and "gin_trgm_ops"

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commented out — run manually if rollback needed)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP INDEX CONCURRENTLY IF EXISTS "idx_sponsor_name_normalised_trgm";
