# Step 25 — Dev Data Commands (reset one user / reset everything)

## Objective
Two commands: wipe a single account and everything it owns (leaving other accounts intact, so
cross-tenant checks stay possible), and wipe the database back to a fresh state.

## Context
`package.json` has `db:migrate`, `db:seed`, `seed:scenario` — nothing that removes data.
`src/lib/db/scripts/` contains only `seed.ts` and `seed-schedule.ts`. Manual QA of steps 26–27
depends on being able to (a) recreate a test account from scratch and (b) keep a *second* account's
data around to prove it is not visible. That makes this step a prerequisite for verifying the
privacy work by hand, so it goes first.

Ownership model to respect (do not guess — read it):
- `scheduling_periods.user_id` is the owner column.
- Entities (`students`, `preceptors`, `clerkships`, `sites`, `health_systems`, `preceptor_teams`)
  have **no** `user_id`; they belong to a schedule through the `schedule_*` junction tables.
- `schedule_assignments` has **no `schedule_id`** — assignments attach to a student, and the student
  attaches to a schedule via `schedule_students`.
- better-auth owns `user`, `session`, `account`, `verification`.

## Scope
**In:** two CLI scripts + npm scripts, dry-run output, confirmation for the destructive one.
**Out:** any admin UI (explicitly deferred).

## Implementation

1. **`src/lib/db/scripts/reset-user.ts`** — `npm run db:reset-user -- --email=someone@example.com`
   - Resolve the user; exit non-zero with a clear message if not found.
   - Collect the user's schedule ids (`scheduling_periods.user_id = ?`).
   - Delete, inside one transaction, in FK-safe order:
     1. `schedule_assignments` for students that belong **only** to this user's schedules
        (see the shared-entity note below),
     2. the `schedule_*` junction rows for those schedules,
     3. entities left orphaned — i.e. rows in `students`/`preceptors`/`clerkships`/`sites`/
        `health_systems`/`preceptor_teams` with **no remaining junction row in any schedule**,
     4. dependent per-entity data for those orphans (`preceptor_availability`,
        `preceptor_availability_patterns`, `preceptor_sites`, `student_health_system_onboarding`,
        `clerkship_sites`, `preceptor_teams` membership, elective/config rows),
     5. the schedules themselves,
     6. better-auth rows: `session`, `account`, `verification`, then `user`.
   - **Shared entities are the trap:** an entity referenced by another user's schedule must be left
     alone. Delete an entity only when it has zero junction rows after step 2. Assert this with a
     test.
   - Flags: `--dry-run` (default off) printing a per-table count of what *would* go; `--yes` to skip
     the interactive confirmation.
2. **`src/lib/db/scripts/reset-all.ts`** — `npm run db:reset`
   - Drops/recreates the schema by re-running migrations against a truncated DB (simplest correct
     approach: delete every table's rows in FK-safe order, or delete the file when
     `DATABASE_PATH` points at a local SQLite file and re-run migrations).
   - Requires `--yes` **or** an interactive confirmation; refuses to run when `NODE_ENV=production`
     unless `--force-production` is passed. This is a footgun; make it hard to fire by accident.
   - `--seed` flag to run the seed afterwards, so `npm run db:reset -- --yes --seed` is a one-liner
     fresh environment.
3. **npm scripts:** `db:reset-user`, `db:reset`. Document both in `README.md` (or `HANDOFF.md`) with
   the exact invocations, including the `DATABASE_PATH=...` prefix used by the e2e database.
4. Share the deletion logic in `src/lib/db/scripts/reset-lib.ts` so both scripts and the tests use
   one implementation rather than duplicating the FK order.

## Testing
- **Unit/integration (`reset-lib`), against a migrated test DB:**
  - Two users each with a schedule and their own entities → resetting user A removes A's schedule,
    entities, assignments and auth rows, and leaves **every one of B's rows untouched** (assert
    counts per table).
  - **Shared entity:** one clerkship attached to both A's and B's schedules → resetting A removes
    only A's junction row; the clerkship itself and B's junction row survive.
  - Assignments belonging to a student that is shared with B are not deleted.
  - Unknown email → throws/exits non-zero, changes nothing.
  - `--dry-run` reports non-zero counts and mutates nothing.
  - `reset-all` on a populated DB leaves every table empty and the schema intact (a subsequent
    `seed` succeeds).
- **Manual smoke (document in the step's PR):** create the test account, run `db:reset-user`, sign
  up again with the same email successfully.

## Acceptance criteria
- [ ] `npm run db:reset-user -- --email=…` removes exactly that account and its exclusively-owned
      data, provably leaving other accounts intact.
- [ ] Entities shared with another user's schedule are never deleted.
- [ ] `npm run db:reset` returns the database to a fresh (optionally seeded) state and cannot be
      fired accidentally in production.
- [ ] Both commands documented with copy-pasteable invocations.
- [ ] Definition of done per GUIDELINES.md.
