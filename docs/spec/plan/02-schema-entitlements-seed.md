# Step 02 — Schema Consolidation, Entitlements & Seed Data

## Objective
Reset the database schema to a clean consolidated baseline matching the spec's domain model, add the user-entitlement column for Stage 2 gating, add the assignment `locked` flag, and ship a rich deterministic seed. Also clean repo cruft.

## Context
25 incremental migrations carry dead concepts (dropped specialty, superseded availability models, `preceptor_site_clerkships`), and there is no entitlement or assignment-lock concept (DESIGN_REVIEW E4, D1, C4). **Existing data does not need to be preserved** — a destructive reset is explicitly allowed.

## Prerequisites
None (runs independently; step 03 consumes the entitlement column).

## Scope
**In:** schema baseline, new columns, codegen types, seed script, repo cleanup. **Out:** API/UI gating (step 03), validation logic (step 10).

## Implementation

1. **Baseline migration.** Replace `src/lib/db/migrations/001…025` with a single `001_baseline.ts` that creates the final schema (same tables the current 25 migrations produce — use `src/lib/db/types.ts` as the source of truth), minus tables/columns that nothing in `src/` reads or writes anymore (verify each candidate with a repo-wide grep before dropping; when in doubt, keep it). Keep better-auth tables exactly as better-auth expects (`user`, `session`, `account`, `verification` — see `better-auth_migrations/`).
2. **New columns** in the baseline:
   - `user.entitlements` TEXT NOT NULL DEFAULT `'[]'` — JSON array of strings; the only defined value for now is `"autogen"`.
   - `schedule_assignments.locked` INTEGER NOT NULL DEFAULT 0 — preset/locked assignments (F6; consumed by steps 09/13).
   - `schedule_assignments.source` TEXT NOT NULL DEFAULT `'manual'` — `'manual' | 'generated'`.
3. Delete the committed `sqlite.db`; add `sqlite.db*` to `.gitignore` if not present. Fresh DBs come from `npm run db:migrate && npm run db:seed`.
4. Run `npm run db:types` and fix all resulting type errors.
5. **Seed** (`npm run db:seed`): idempotent, produces the demo dataset from `docs/schedule-first-architecture.md` Phase 7: test user `admin@example.com` / `password123` (created via better-auth API so hashing is correct), one active schedule (full academic year spanning today), 2 health systems, 4 sites, 6 clerkships (mixed types, sensible required days), 10 students, 8 preceptors **with availability patterns**, blackout dates, and a partially built schedule of manual assignments (some past, some future, at least one deliberate availability violation and one student with unscheduled days — so validation/status UIs have material). Give the seed user the `autogen` entitlement; add a second user without it (`basic@example.com` / `password123`) for gating tests.
6. **Scenario seeds** (`scripts/seed/`): keep working; update to the baseline schema.
7. **Repo cleanup:** delete stray artifacts at root: `e2e-*.log`, `e2e-test-results-summary.md`, `test-verification-report.md`, `e2e-final-results.log`, `COMMANDS_TO_RUN.md`, `TEST_COVERAGE_REPORT.md` (fold anything still relevant into docs). Update `README.md`: current status section replaced with a pointer to `docs/spec/` (fix the stale "9.7% complete").

## Testing
- Unit: migration applies to a fresh DB without error; seed runs twice without duplicating; a service smoke test per major table (insert/select round-trip through Kysely with generated types).
- Verify both users can log in via the auth API in an integration test or e2e.
- Full existing unit suite must pass against the baseline schema (this proves the baseline matches what the code expects).

## Acceptance criteria
- [ ] `rm -f sqlite.db && npm run db:migrate && npm run db:seed` produces a working app with the demo dataset; login works for both seed users.
- [ ] `user.entitlements`, `schedule_assignments.locked`, `schedule_assignments.source` exist in `src/lib/db/types.ts` (generated).
- [ ] Single baseline migration; old migration files removed.
- [ ] Root of repo contains no test logs/status artifacts; `sqlite.db` untracked.
- [ ] Definition of done per GUIDELINES.md.
