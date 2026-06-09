# JobScope

> Aggregates UK tech jobs, filters out roles you can't take, and ranks the rest by fit.

![Node](https://img.shields.io/badge/Node-20-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

<!-- Screenshot: add a screenshot of the job feed here after your first run -->

## What is JobScope

JobScope aggregates UK tech jobs from multiple job boards, then applies the two filters that generic job sites ignore: it cross-references every employer against the official gov.uk Register of Licensed Sponsors, and it automatically flags roles that require UK security clearance (SC/DV/CTC). Each role is enriched with a normalised salary range and scored for fit against your CV. It's built for developers job-hunting in the UK on a visa, who need to skip roles they're structurally ineligible for instead of finding out after applying.

## Features

- **Multi-source job aggregation** — Adzuna, Reed, Jooble, and RemoteOK. Works with zero API keys out of the box via RemoteOK.
- **Visa sponsor filter** — every employer matched against the official gov.uk Register of Licensed Sponsors (exact + fuzzy `pg_trgm` matching), tiered CONFIRMED / LIKELY / LOW_CONFIDENCE / UNKNOWN.
- **Security clearance detection** — SC/DV/CTC-required roles are automatically detected from the job text, flagged, and filterable (hidden by default).
- **Resume parsing** — upload your CV (PDF or DOCX), Claude extracts skills, certifications, and experience, then scores role fit.
- **Application tracker** — kanban and table views with ghosting detection (flags applications stuck with no response).
- **Live job feed** — filter by salary, location, sponsor-only, and clearance-free.
- **Freshness endpoint** — `/api/healthz` reports per-source ingestion age and returns 503 if any source is more than 25 hours stale.

## Quick Start (Docker — recommended)

```bash
git clone https://github.com/atharvak161/jobscope.git
cd jobscope
cp .env.example .env
# Edit .env — at minimum set NEXTAUTH_SECRET (see below)
docker-compose up
```

Open http://localhost:3000

**Minimum required for first run** (everything else is optional):

```
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
```

The app starts with RemoteOK jobs, which need no API key. Add the other keys below to pull in more sources. `docker-compose up` brings up PostgreSQL, runs `prisma db push` to create the schema, and starts the app automatically.

## API Keys

| Service | Key(s) needed | Where to get | Free tier | What it adds |
|---|---|---|---|---|
| RemoteOK | None | — | Unlimited | Remote tech jobs (default, always on) |
| Adzuna | `ADZUNA_APP_ID` + `ADZUNA_API_KEY` | [developer.adzuna.com](https://developer.adzuna.com) | 250 req/day | UK tech jobs |
| Reed | `REED_API_KEY` | [reed.co.uk/developers](https://www.reed.co.uk/developers) | 1,000 req/day | UK jobs |
| Jooble | `JOOBLE_API_KEY` | [jooble.org/api](https://jooble.org/api/about) | Generous free tier | Aggregated jobs |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Pay per use | Resume parsing (CV upload) |
| Cloudflare R2 | `CLOUDFLARE_R2_ACCOUNT_ID` + `R2_BUCKET` + `R2_ACCESS_KEY` + `R2_SECRET_KEY` | [dash.cloudflare.com](https://dash.cloudflare.com) | 10GB free | Resume file storage (optional) |

## Environment Variables

Every variable from `.env.example`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Pre-set for Docker; override for a local DB. |
| `NEXTAUTH_SECRET` | Yes | Session signing secret. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes | App base URL. Defaults to `http://localhost:3000`. |
| `ADZUNA_APP_ID` | Optional | Adzuna application ID. |
| `ADZUNA_API_KEY` | Optional | Adzuna API key. |
| `REED_API_KEY` | Optional | Reed Jobseeker API key. |
| `JOOBLE_API_KEY` | Optional | Jooble API key. |
| `ANTHROPIC_API_KEY` | Optional | Claude API key. Required for resume parsing; the feature is disabled without it. |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Optional | Cloudflare R2 account ID for resume storage. |
| `R2_BUCKET` | Optional | R2 bucket name. |
| `R2_ACCESS_KEY` | Optional | R2 access key ID. |
| `R2_SECRET_KEY` | Optional | R2 secret access key. |

Without R2 set, the app runs fine; uploaded resumes just won't persist across restarts.

## Running without Docker (development)

```bash
npm install
# Start PostgreSQL locally, or use the bundled db container:
docker-compose up db -d
npx prisma db push
npm run dev
```

Open http://localhost:3000

Other scripts:

```bash
npm run build      # production build
npm start          # run the production build
npm run lint       # eslint
npm test           # jest unit tests
```

## Database

- **PostgreSQL 16** with **Prisma 7** as the ORM.
- `docker-compose up` runs `npx prisma db push` automatically on start, so the schema is created on first boot — no manual migration step.
- Nine models: `User`, `UserProfile`, `Job`, `Application`, `SponsorRegister`, `JobSponsorMatch`, `RawJobIngestion`, plus NextAuth's `Account`, `Session`, and `VerificationToken`.
- All primary keys are UUIDs (not sequential integers) — an IDOR-prevention decision baked into the schema.
- Full-text fuzzy matching for sponsor names uses a `pg_trgm` GIN index (`prisma/migrations/003_trgm_index.sql`). If you manage the schema with raw migrations rather than `db push`, enable the extension first:

  ```bash
  docker-compose exec db psql -U jobscope -d jobscope -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
  ```

## Project Structure

```
src/
  app/                 Next.js App Router
    (dashboard)/       Authenticated pages: dashboard, jobs, jobs/[id], applications, resume
    api/               API routes: jobs, applications, resume, auth, healthz
    login/             Auth page
  lib/
    integrations/      Job source adapters (adzuna, reed, jooble, remoteok) + gov.uk sponsor register
    matching/          Sponsor matcher, clearance detector, eligibility scorer
    resume/            CV upload, validation, text extraction, Claude parsing
    workers/           Ingestion worker
  components/          UI components (shadcn/ui)
prisma/
  schema.prisma        Database schema
  migrations/          SQL migrations (incl. 003_trgm_index.sql)
  seed.ts              Seed script
```

System design, ADRs, and the security threat model are maintained in the organisation's docs tree, outside this repo.

## Architecture

JobScope ingests raw job listings into a staging table (`RawJobIngestion`) with SHA-256 content-hash deduplication, normalises them into the `Job` table, then enriches each one: the sponsor matcher cross-references the employer against the gov.uk register, and the clearance detector scans the text for clearance requirements. An eligibility scorer ranks the result. The feed serves only feed-visible jobs, ordered by fit and recency. The full system design (`JOBSCOPE_ARCHITECTURE.md`) and ADRs are maintained in the organisation's docs tree.

Key decisions:

- **PostgreSQL over SQLite** — concurrent ingestion workers and `pg_trgm` fuzzy full-text matching for sponsor names.
- **Multi-source aggregation** — no single point of failure; if one job board is down or rate-limited, the others keep the feed fresh.
- **Claude for resume parsing** — schema-enforced structured output extracts cleaner, more reliable profiles than rule-based CV parsers.

## Security

- **IDOR protection** — every application and profile query is scoped to the authenticated `userId` at the service layer; primary keys are UUIDs, not guessable integers.
- **SSRF prevention** — the server never fetches a URL supplied by user input. All outbound HTTP comes from background workers against a compile-time host allowlist.
- **Prompt injection defence** — Claude resume-parsing calls use forced `tool_choice` so model output is constrained to the extraction schema.

The full threat model and security review are maintained in the organisation's docs tree (`docs/security/job-tracker/`).

## Troubleshooting

- **Port 3000 already in use** — `docker-compose down`, then `docker-compose up` again.
- **Database connection refused** — wait for the `db` container to report healthy. The health check runs every 5 seconds; the app waits for it before starting.
- **Resume parsing not working** — requires `ANTHROPIC_API_KEY`. The feature is disabled without it.
- **No jobs showing** — RemoteOK needs no key, so if the feed is empty, check network connectivity. Other sources only appear once their keys are set.

## Contributing / Development

JobScope is primarily a personal job-search tool maintained for personal use. Contributions are welcome — open an issue or PR. Run `npm run lint` and `npm test` before submitting.

## Licence

MIT
