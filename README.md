# JobScope

Personalised job search and application tracker with live sponsorship filtering, SC-clearance detection, and gov.uk sponsor register cross-reference.

---

## What it does

- **Multi-source job fetching** — aggregates listings from Adzuna, Reed, and Jooble in a single feed
- **Sponsorship filtering** — cross-references the live gov.uk Register of Licensed Sponsors to flag which employers can sponsor Skilled Worker visas
- **SC-clearance detection** — identifies roles requiring Security Clearance and surfaces them with appropriate labels
- **Application tracker** — tracks every application from saved through to offer, with status history and notes
- **Resume parsing** — parses uploaded CVs to auto-fill application data and surface keyword gaps against job descriptions
- **AI-assisted matching** — uses Claude to score job relevance and draft tailored cover letters

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL (hosted on Railway) |
| ORM | Prisma |
| Auth | NextAuth.js |
| AI | Anthropic Claude API |
| Storage | Cloudflare R2 (resume files) |
| Hosting | Railway |

---

## Project status

This project is under active development. APIs, schema, and UI are subject to change without notice.

---

## Getting started

1. Copy `.env.example` to `.env.local` and fill in all required values
2. `npm install`
3. `npx prisma migrate dev`
4. `npm run dev`

Open [http://localhost:3000](http://localhost:3000) to view the app.
