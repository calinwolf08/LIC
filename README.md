# LIC Scheduling App

A scheduling and validation tool for medical-school Longitudinal Integrated
Clerkship (LIC) programs. Administrators build and validate student schedules —
which student is with which preceptor, at which site, for which clerkship, on
which days — and track each student's progress toward their requirements.

## Two-stage product

- **Stage 1 — Core scheduling tool (all users):** manage students, preceptors,
  clerkships, and locations; set requirements, availability, and blackout dates;
  **build and adjust schedules by hand** with real-time conflict validation and
  per-student requirement tracking (completed / scheduled / unscheduled); export
  to Excel. Fully usable without ever running auto-generation.
- **Stage 2 — Auto-Generate (gated):** a constraint-based engine that generates
  and optimizes schedules, with violation diagnostics, teams, backup preceptors,
  and per-clerkship strategy configuration. Entirely gated behind a per-user
  `autogen` entitlement and lives under `/generate`.

The authoritative spec, design review, and step-by-step implementation plan are
in [`docs/spec/`](docs/spec/).

## Tech stack

SvelteKit 2 · Svelte 5 (runes) · SQLite + Kysely · better-auth · Tailwind 4 +
shadcn-svelte · Zod + superforms · Vitest + Playwright · adapter-node.

## Quick start

```bash
npm install
npm run db:migrate      # apply migrations to ./sqlite.db
npm run db:seed         # demo data + two logins (see below)
npm run dev             # http://localhost:5173
```

### Seed logins

| User                | Password      | Entitlement              |
| ------------------- | ------------- | ------------------------ |
| `admin@example.com` | `password123` | `autogen` (sees Stage 2) |
| `basic@example.com` | `password123` | none (Stage 1 only)      |

Grant/revoke the Stage 2 entitlement manually:

```bash
npx tsx scripts/set-entitlement.ts <email> autogen on|off
```

## Development commands

```bash
npm run check                 # svelte-check / TypeScript
npm run lint                  # prettier --check
npm run format                # prettier --write
npm run test:unit -- --run    # unit + integration (Vitest)
npm run test:e2e              # Playwright (builds + previews first)
npm run build                 # production build
```

## Project layout

```
src/lib/features/<feature>/     feature verticals (components / services / schemas)
src/lib/components/             shared UI primitives (PageHeader, dialogs, toast, …)
src/lib/server/                 server-only helpers (entitlements)
src/routes/(app)/               authenticated app pages
src/routes/(app)/generate/      gated Stage 2 hub
src/routes/api/                 JSON API endpoints
src/lib/db/                     Kysely setup, migrations, seed
docs/spec/                      authoritative spec + plan (start here)
docs/archive/                   superseded planning docs
```
