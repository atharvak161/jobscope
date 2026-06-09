# Architecture Summary

A one-page technical overview of JobScope. The full system architecture document
and the Architecture Decision Records (ADR-001 through ADR-003) are maintained in
the organisation's design archive; this summary distills them and is kept in sync
with the codebase.

JobScope is a single-user, continuously-updating UK cybersecurity job tracker. It
filters the market against two hard eligibility constraints — Skilled Worker visa
sponsorship and SC/DV security-clearance exclusion — that no off-the-shelf tool
surfaces.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Database | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 (session stored in Postgres) |
| File storage | Cloudflare R2 (S3-compatible, via AWS SDK v3) |
| AI | Claude API (`@anthropic-ai/sdk`) for resume parsing |
| Styling | Tailwind CSS v4 + Radix UI primitives |

> Note: ADR-001/ADR-002 reference Prisma 6 and Next.js 15 as the baseline at design
> time; the codebase has since moved to Prisma 7 and Next.js 16. PostgreSQL 16 and
> the overall architecture are unchanged.

---

## How the job pipeline works

The ingestion worker (`src/lib/workers/ingestion-worker.ts`) calls each enabled
source adapter (`src/lib/integrations/`: Adzuna, Reed, Jooble, RemoteOK), each of
which returns normalised raw listings. Every listing is run through content-hash
deduplication (`dedup.ts`) and inserted into `raw_job_ingestion` with a UNIQUE
constraint so duplicates from multiple sources cannot double-insert. New records
then pass through the processing pipeline (`src/lib/pipeline/process-job.ts`):
sponsor matching against the gov.uk register (`sponsor-matcher.ts`, exact +
`pg_trgm` fuzzy match into CONFIRMED/LIKELY/LOW_CONFIDENCE/UNKNOWN tiers), clearance
detection (`clearance-detector.ts`, conservative keyword sets resolving to
REQUIRED/PREFERRED/NONE_DETECTED), and eligibility scoring (`eligibility-scorer.ts`).
Processed jobs and their sponsor matches are written to the `Job` and
`JobSponsorMatch` tables for the filtered feed.

## How resume parsing works

A user uploads a PDF or DOCX via the profile page. The upload route validates the
file (`src/lib/resume/validate.ts` — MIME/magic-byte check, 10MB limit, filename
sanitisation), stores it in a private R2 bucket under an owner-scoped
`{userId}/{uuid}/` key (`store.ts`), and extracts plain text (`extract.ts`, via
`pdf-parse` / `mammoth`). The text is sent to the Claude API
(`parse.ts`, model `claude-haiku-4-5`) using a `tool_use` call with
`tool_choice: any` so Claude returns a schema-enforced structured profile
(skills, roles, certifications, experience_years, education, sub_domains). The parsed
profile is validated and stored on `UserProfile` for human review before activation.

---

## Key design decisions

- **PostgreSQL over SQLite (ADR-001):** concurrent writes from multiple ingestion
  workers, native `pg_trgm` fuzzy matching for sponsor names, and avoidance of the
  Docker-volume write-failure mode that the reference project hit.
- **Multi-source aggregation (ADR-002):** Adzuna + Reed + Jooble + RemoteOK on free
  tiers rather than a single paid aggregator — broader coverage, no per-call cost,
  and rate-limit budgets managed per source.
- **LLM-based resume parsing (ADR-003):** Claude API structured output over brittle
  NLP libraries (pyresparser, spaCy NER) — far higher extraction accuracy with no
  model-training or maintenance burden.

---

## Where things live

| Path | Contents |
|---|---|
| `src/app/` | Next.js App Router — pages (`(dashboard)/`, `login/`) and API routes (`api/`) |
| `src/lib/integrations/` | Job-source adapters + dedup + gov.uk sponsor register |
| `src/lib/pipeline/` | Per-job processing orchestration |
| `src/lib/matching/` | Sponsor matcher, clearance detector, eligibility scorer |
| `src/lib/resume/` | Upload validation, text extraction, Claude parsing, R2 storage |
| `src/lib/workers/` | Background ingestion worker |
| `src/lib/db/` | Prisma client setup |
| `prisma/` | `schema.prisma`, migrations, `seed.ts` |
| `src/generated/prisma/` | Generated Prisma client (build artifact) |
