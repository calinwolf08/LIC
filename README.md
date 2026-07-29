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

The seed also creates a second account whose data is all named **"Tenant B …"**
(owned by `basic@example.com`), so tenant-isolation can be checked by hand and
by the `tenant-isolation` e2e journey. The seed is idempotent.

### Seeded demo scenario

So the calendar, schedule-health panel and override review have content on first
run, `admin@example.com` starts with a hand-built set of assignments (all dates
anchored to *today*, so the demo never rots into the past):

| Scenario                      | What it demonstrates                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| Clean 5-day block             | A normal calendar run and healthy progress bars                        |
| Partially-complete clerkship  | The requirement strip and the "days left" badge (10 of 28 days)        |
| Fully-complete clerkship      | The completed state (14 of 14 days)                                    |
| Preceptor over capacity ×4    | Schedule health counts **4** findings (one per day, not per student) and the override review groups the run into one 4-day row; carries an accepted `preceptor_capacity` override |
| Resolved `not_onboarded`      | The override review's active/resolved toggle — the student has since onboarded, so the exception reads as resolved |

Tenant B gets the same shape at smaller scale (two students, one accepted
override) so isolation tests have more than a single row to miss.

Grant/revoke the Stage 2 entitlement manually:

```bash
npx tsx scripts/set-entitlement.ts <email> autogen on|off
```

### Resetting data

```bash
# Remove ONE account and everything it exclusively owns (entities shared with
# another user, and other accounts, are left intact). Asks to confirm first.
npm run db:reset-user -- --email=someone@example.com
npm run db:reset-user -- --email=someone@example.com --dry-run   # counts only
npm run db:reset-user -- --email=someone@example.com --yes       # no prompt

# Wipe the whole database back to an empty (migrated) state. Refuses to run with
# NODE_ENV=production unless --force-production is also passed.
npm run db:reset -- --yes
npm run db:reset -- --yes --seed                                 # fresh + reseed
```

All reset/seed commands target `DATABASE_PATH` (default `./sqlite.db`); prefix it
to point at another database, e.g. the e2e DB:
`DATABASE_PATH=./test-sqlite.db npm run db:reset-user -- --email=admin@example.com --yes`.
Do **not** run a reset against `./test-sqlite.db` while a preview/e2e run is
using it.

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
