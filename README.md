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

## Deployment

The app is a SvelteKit `adapter-node` build (selected automatically when the
`COOLIFY` env var is set) started with `node build`.

**The database engine is chosen by environment variables** — SQLite by default
(local dev and tests), PostgreSQL in production — with no code changes. See
[Choosing the database engine](#choosing-the-database-engine) below.

**1. Set up the database before the server starts.** better-auth does **not**
create its tables at runtime, and the app's migrations must be applied — on a
fresh database the first sign-up returns a 500 (`no such table: user`) until
this runs. One idempotent command does both, on whichever engine the environment
selects, and is safe to run on every deploy (it **never** seeds):

```bash
npm run db:setup
```

Wire it to run **before** the server boots — e.g. set the start command to:

```bash
npm run db:setup && node build
```

`db:setup` needs `tsx` (a devDependency) and the `src/` tree present, so do not
prune devDependencies or the source in the deploy image.

**2. Keep the data across redeploys.** How depends on the engine — see below.

### Choosing the database engine

Resolution precedence (`src/lib/db/config.ts`):

1. `DATABASE_DIALECT` (`sqlite` | `postgres`) — explicit override.
2. else `DATABASE_URL` — a `postgres://…` / `postgresql://…` URL selects Postgres.
3. else SQLite at `DATABASE_PATH` (default `./sqlite.db`).

Every db command (`db:setup`, `db:migrate`, `db:seed`, resets) reads the same
variables, so they always target the database the app uses.

#### PostgreSQL (recommended for production)

Create a Postgres service in Coolify and point the app at it:

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

Because the data lives in a **separate** Postgres service (its own volume,
backed up by Coolify), app redeploys cannot touch it — there is no per-app
volume to forget. Nothing else changes: `npm run db:setup && node build` builds
the schema and boots.

#### SQLite

Put the file on a **persistent volume**, or every redeploy starts from an empty
database. Point `DATABASE_PATH` at a mounted directory and mount the *directory*
(WAL mode also writes `…-wal` / `…-shm` sidecar files):

```
DATABASE_PATH=/app/data/sqlite.db        # env var
/app/data                                 # Coolify persistent volume
```

### Adding a third engine

Kysely already ships MySQL/MSSQL dialects. To add one: create
`src/lib/db/dialects/<engine>.ts` exporting a `DialectAdapter`, register it in
`src/lib/db/dialects/index.ts`, add a Postgres-style baseline under
`src/lib/db/migrations/<engine>/001_baseline.ts`, and add a better-auth profile
in `ensure-auth-tables.ts`. No call sites change; every future shared migration
is inherited. Full instructions live in the headers of those files and in
`docs/spec/plan/DB-DIALECT-ABSTRACTION.md`.

## Development commands

```bash
npm run check                 # svelte-check / TypeScript
npm run lint                  # prettier --check
npm run format                # prettier --write
npm run test:unit -- --run    # unit + integration (Vitest)
npm run test:e2e              # Playwright (builds + previews first)
npm run test:e2e:smoke        # the @smoke subset (PR gate, a few minutes)
npm run test:e2e:journeys     # only the phased journeys (e2e/journeys/phase-*)
npm run build                 # production build
```

### End-to-end journeys

The Playwright suite is organised by the plan in `docs/plans/e2e-validation-plan.md`:

- `e2e/fixtures/` — the `test` object every spec imports. `asAdmin` / `asBasic` are
  pages already signed in as the seeded users (login runs once per worker and the
  storage state is reused); `asFreshUser` / `asFreshEntitledUser` register a new
  account through the real form; `sandbox` creates throwaway schedules that are
  restored and deleted after the test; `db` is a Kysely handle on
  `./test-sqlite.db`; `apiOf(page)` calls the JSON API in the page's own session.
- `e2e/pages/` — page objects for the seams every journey touches: the unified
  assignment dialog, the schedule-health panel, the calendar, entity tabs and the
  shared confirm dialog.
- `e2e/journeys/phase-N/` — the phased journeys (project `journeys`, zero
  retries: a flake is a bug). Everything directly under `e2e/journeys/` is the
  pre-plan `legacy` project and keeps one retry until it is folded into a phase.
- Tags select subsets: `--grep @smoke`, `@stage1`, `@stage2`, `@tenant`, `@long`.
- `e2e/global-setup.ts` asserts the seed invariants (users, entitlement,
  materialised availability, electives, blackout dates, a locked row, one
  un-onboarded student) so a broken seed fails in one message.
- Traces, videos and screenshots are kept for failures only (`test-results/`).

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
