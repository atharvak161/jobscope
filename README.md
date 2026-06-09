# JobScope

Job aggregator for UK visa-sponsored roles. Filters by sponsorship status, security clearance requirements, and salary. Parses your CV with AI to score role fit.

## Quick start

**Requirements:** Docker + Docker Compose, API keys (see below)

```bash
git clone https://github.com/atharvak161/jobscope.git
cd jobscope
cp .env.example .env
# Fill in .env with your API keys
docker-compose up
```

Open http://localhost:3000.

## API keys needed

| Key | Where to get | Free tier |
|---|---|---|
| ADZUNA_APP_ID + ADZUNA_API_KEY | developer.adzuna.com | 250 req/day |
| REED_API_KEY | reed.co.uk/developers | 1000 req/day |
| JOOBLE_API_KEY | jooble.org/api | 500 req/day |
| ANTHROPIC_API_KEY | console.anthropic.com | Pay per use |

NEXTAUTH_SECRET: run `openssl rand -base64 32`

Cloudflare R2 (resume storage) is optional — the app works without it, resumes just won't persist between restarts.

## Database migrations

Migrations run automatically on `docker-compose up`. One migration (003 — full-text search index) uses `CREATE INDEX CONCURRENTLY` and must be run manually if you hit an error:

```bash
docker-compose exec db psql -U jobscope -d jobscope -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

## Architecture

See `docs/architecture/JOBSCOPE_ARCHITECTURE.md` for full system design, ADRs, and schema.
