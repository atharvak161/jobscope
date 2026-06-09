# Local Development Guide

Everything you need to clone JobScope and run it on your machine. Follow it top to
bottom and you will have a working dev server, a seeded database, and a passing test
suite.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x | The project targets Node 20 (`node:20-alpine` in the Dockerfile). Use `nvm install 20`. |
| npm | 10.x | Ships with Node 20. |
| Docker Desktop | latest | Only required for the Docker database option (recommended). |
| git | any recent | To clone the repo. |
| PostgreSQL | 16 | Only required if you run Postgres locally instead of via Docker. |

Check your versions:

```bash
node --version   # v20.x
npm --version    # 10.x
docker --version
git --version
```

---

## 2. Clone and install

```bash
git clone https://github.com/atharvak161/jobscope.git
cd jobscope
npm install
```

`npm install` runs a `postinstall` hook that executes `prisma generate`, so the
Prisma client is built into `src/generated/prisma` automatically.

Then create your local environment file:

```bash
cp .env.example .env
```

Fill in the values — see [Section 7](#7-environment-variables) for which are
required.

---

## 3. Database setup

Pick **one** of the two options below.

### Option A — Docker (recommended)

Starts just PostgreSQL 16 in a container, leaving the app to run on your host via
`npm run dev`. This is the fastest path.

```bash
docker-compose up db -d
```

This launches Postgres 16 on `localhost:5432` with database `jobscope`, user
`jobscope`, password `jobscope` — which matches the default `DATABASE_URL` in
`.env.example`. The container has a healthcheck and persists data in the
`postgres_data` volume.

To stop it: `docker-compose stop db`. To wipe data: `docker-compose down -v`.

### Option B — Local PostgreSQL

If you would rather run Postgres natively:

1. Install PostgreSQL 16 (`brew install postgresql@16` on macOS, or your distro's
   package).
2. Start the server, then create the database and user:

   ```bash
   psql postgres -c "CREATE USER jobscope WITH PASSWORD 'jobscope';"
   psql postgres -c "CREATE DATABASE jobscope OWNER jobscope;"
   ```

3. Confirm your `.env` `DATABASE_URL` matches:

   ```
   DATABASE_URL=postgresql://jobscope:jobscope@localhost:5432/jobscope
   ```

---

## 4. Sync the schema

With the database running, push the Prisma schema into it:

```bash
npx prisma db push
```

This creates all tables (users, jobs, applications, user_profiles,
sponsor_register, job_sponsor_matches, raw_job_ingestion, and the NextAuth tables)
without generating a migration file. Use this for local dev. For migration history,
use `npx prisma migrate dev` instead.

---

## 5. Seed data

A seed script lives at `prisma/seed.ts`. It populates sample jobs, a sponsor
register sample, and a demo user/profile so the feed is not empty on first run.

```bash
npx ts-node prisma/seed.ts
```

Equivalent, since the seed is wired into `package.json`:

```bash
npx prisma db seed
```

---

## 6. Run the app

### Dev server

```bash
npm run dev
```

The app starts on http://localhost:3000 with hot reload.

### Tests

```bash
npx jest
```

The test suite covers the matching engine (`src/lib/matching/__tests__`) and resume
parsing (`src/lib/resume/__tests__`).

### Type check

```bash
npx tsc --noEmit
```

Type-checks the whole project without emitting build output.

---

## 7. Environment variables

Copy `.env.example` to `.env` and fill in values. The table below is the source of
truth for what each variable does and whether it is required to boot.

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | **Required** | Postgres connection string. Default matches the Docker/local setup above. |
| `NEXTAUTH_SECRET` | **Required** | Session signing secret. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | **Required** | Base URL of the app — `http://localhost:3000` in dev. |
| `ANTHROPIC_API_KEY` | Required for resume parsing | Claude API key. Without it, resume upload works but parsing fails. |
| `ADZUNA_APP_ID` | Optional | Adzuna job-source adapter. Empty = that source is skipped. |
| `ADZUNA_API_KEY` | Optional | Pairs with `ADZUNA_APP_ID`. |
| `REED_API_KEY` | Optional | Reed job-source adapter. |
| `JOOBLE_API_KEY` | Optional | Jooble job-source adapter. |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Optional | R2 resume file storage. Empty = storage features disabled. |
| `R2_BUCKET` | Optional | R2 bucket name. |
| `R2_ACCESS_KEY` | Optional | R2 access key. |
| `R2_SECRET_KEY` | Optional | R2 secret key. |
| `NEXT_PUBLIC_APP_URL` | Optional | Base URL used by server-side fetches to internal API routes. Defaults to relative paths if unset. |

For a first run, only `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` are
strictly needed to boot. Add `ANTHROPIC_API_KEY` to exercise resume parsing, and the
job-source keys to pull live listings. Everything else degrades gracefully when
empty.

---

## 8. Common dev commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npx jest` | Run all tests |
| `npx tsc --noEmit` | Type check without emitting |
| `npx prisma db push` | Sync schema to database |
| `npx prisma studio` | Open Prisma database browser |
| `docker-compose up` | Full stack (app + db) |
| `docker-compose up db -d` | Database only |

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't reach database server at localhost:5432` | The DB is not running. Start it: `docker-compose up db -d`. |
| `Environment variable not found: DATABASE_URL` | You skipped `cp .env.example .env`. |
| Prisma client type errors after schema edit | Re-run `npx prisma generate`. |
| Resume parse returns an error about the API key | Set `ANTHROPIC_API_KEY` in `.env`. |
| Empty job feed | Run the seed (`npx prisma db seed`) or configure job-source API keys. |
