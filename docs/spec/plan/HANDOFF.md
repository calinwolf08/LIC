# Round 2 — Implementation Handoff

You are continuing work on the **LIC Scheduling App** — a SvelteKit 2 / Svelte 5 (runes) /
SQLite+Kysely / better-auth / Tailwind medical-school clerkship scheduler. It's a two-stage
product: Stage 1 is manual scheduling + validation (all users); Stage 2 is auto-generation, gated
behind the per-user `autogen` entitlement. You're in the middle of "Round 2" — fixing issues found
during first real use.

**Branch:** `claude/lic-scheduling-spec-review-vtpx09` (develop, commit, and push here; branch off
the latest default if the PR was already merged).

## Start by reading the plan

The authoritative plan lives in `docs/spec/plan/`. Read these first, in order:

1. `ROUND-2-OVERVIEW.md` — dependency graph, root-cause briefing, and a table mapping all 31
   reported issues → step.
2. `GUIDELINES.md` — binding conventions (shared primitives only: `PageHeader`, `EntityTabs`,
   `ConfirmDialog`, `EmptyState`, `toast`, `FormShell`, `DetailSummary`; no hand-rolled modals;
   no `window.confirm`/`reload`; Kysely-only through feature services; envelope
   `{success,data}` / `{success,error}`; entity names are links; Stage-2 gating enforced
   **server-side**).
3. The step files you'll implement: `17-assignment-eligibility-services.md`,
   `18-unified-assignment-dialog.md`, `19-student-page-rework.md`, `20-calendar-page-rework.md`,
   `21-preceptor-page-assignments.md`, `24-integrated-regression.md`.

## Already done (do NOT redo)

Steps **15, 16, 22, 23** are complete, tested, committed, and pushed:

- **15**: per-user schedule resolution (`getActiveScheduleForUser` / `getScheduleRange` in
  `src/lib/api/schedule-context.ts`); the year fallback in `schedule-views-service.ts` is deleted
  (view fns now take an explicit `scheduleId`); `refreshSchedules()` in the schedule store fixes the
  stale sidebar; `getActiveSchedulingPeriod` is `@deprecated`.
- **16**: preceptor availability crash fixed (`pattern-form.svelte` defaults `sites=[]`);
  `GET /api/preceptors/[id]` always returns a `sites` array via `getPreceptorSitesWithDetails`;
  availability editor sits above the calendar.
- **22 / 23**: row actions renamed to **"Manage"**; `/locations` edit dialogs removed; new
  `/sites/[id]` detail page; shared **`DetailSummary`** component (`src/lib/components/`) on student
  + site Overview; "Schedules" removed from sidebar and added as "Manage schedules" in the switcher.

## Your task: implement Steps 17 → 18 → (19, 20, 21) → 24, in that dependency order

17 is the backend (migration + `assignment-eligibility.ts`, `assignment-day-state.ts`,
`requirement-preview.ts` services, override columns, APIs). 18 is the single unified assignment
dialog that consumes 17 (cascading eligibility, availability-aware date picker, override
conversations for unavailable / double-book / capacity / over-required / past-date, and the
**"Lock" checkbox gated behind `autogen`**). 19 / 20 / 21 wire that dialog into the student,
calendar, and preceptor pages and fix their specific bugs. 24 is integrated regression + the seed
fix.

**For each step:** write a failing test first for every bug fix, implement per the step doc, keep
`npx vitest run` + `npx svelte-check` + `npx playwright test` green, then commit and push before
moving on. Update `docs/spec/DESIGN_REVIEW.md`'s Round-2 status as you go.

## Critical operational knowledge (learned the hard way)

- **E2E workflow:** Playwright's `webServer` runs on port 4173 with a seeded `test-sqlite.db` and
  `reuseExistingServer` when not CI. Fastest loop:
  `rm -f test-sqlite.db*` →
  `DATABASE_PATH=./test-sqlite.db npx tsx e2e/setup-test-db.ts` →
  seed with `DATABASE_PATH=./test-sqlite.db PUBLIC_BASE_URL=http://localhost:4173 BETTER_AUTH_SECRET=test-secret-key-for-e2e-testing npx tsx src/lib/db/scripts/seed.ts` →
  `npm run build` → `npm run preview &` → `npx playwright test`.
  **After any source change you must rebuild before the preview reflects it.**
- **`pkill` exits 144 in this sandbox and can abort a chained command.** Run
  `pkill -f "vite preview"`, `npm run build`, seed, and `npm run preview` as **separate** Bash calls
  — never chain a build after a pkill in one command, or the build silently doesn't complete and
  you'll debug a stale build for an hour.
- **Seed:** step 17's work made the seed authoritative (`seed-schedule.ts`). The admin's active
  schedule is now **"Demo Schedule"**, spanning roughly **one month before today → ~9 months after**
  (e.g. 2026-06-01 → 2027-04-30 when "today" is 2026-07-25), so it always straddles today. Two
  consequences for tests: the **first selectable day in the picker is in the past** (a `past_date`
  conversation stacks on whatever else you triggered — advance a month or two first), and dates you
  hard-code must sit inside that window.
- **Overrides need the right preconditions.** `not_onboarded` only fires when the preceptor has a
  `health_system_id`; a preceptor created via API without one produces a clean assignment and no
  override row. Likewise `preceptor_capacity` needs `max_students` already met. If a test asserts on
  an override, construct the precondition explicitly.
- **`schedule_assignments` has no `schedule_id` column** — assignments scope transitively via
  `schedule_students`. Step 17 adds `override_codes` / `override_note`; after any migration run
  `npm run db:types` and **update every hand-built test schema** that does
  `createTable('schedule_assignments')` (there are ~7 — grep for it), or those tests fail with
  NOT NULL / missing-column errors.
- **E2E isolation:** use unique timestamped names; never permanently mutate seeded entities (create
  a dedicated entity via `page.request` instead — see `preceptor-availability.spec.ts`); restore
  shared state (e.g. set "My Schedule" active again) in a `finally`. Playwright
  `getByRole(.., { name })` string = case-insensitive **substring**; a `RegExp` built from a value
  containing `()` breaks — pass a plain string or escape.
- Stage-2 gating: UI reads `$page.data.entitlements` (includes `'autogen'`); server uses
  `requireAutogen(locals)`. The seed's admin has `autogen`, the basic user does not.

## Known loose thread (optional)

Creating a **site with no health system** fails silently (dialog stays open) despite the field being
labeled "(Optional)" and the schema transforming `'' → undefined`. Not yet diagnosed; out of scope
for 17–21 but worth a fix if you touch site creation.

## Quality gates that must stay green

`npx vitest run`, `npx svelte-check --tsconfig ./tsconfig.json`, `npx playwright test`,
`npm run build`.

---

## Round 3 (steps 25–33) — next up

Round 2 is shipped. **Round 3 is planned but not started**: see `ROUND-3-OVERVIEW.md`.

Two of its steps are a **data-privacy defect, not product polish** — today a signed-in user can see
and modify another user's students, preceptors, clerkships, sites, health systems and assignments.
Verified: the dashboard totals, `/locations`, the calendar's filter lists and
`getEnrichedAssignments` are all unscoped, and **no entity mutation route contains a single
ownership check**. Do **step 26 (reads) then 27 (mutations) before anything else in the round**, and
prove the fix by running the new isolation tests against the pre-fix commit and watching them fail.

Step 25 (dev data commands: reset one user / reset everything) is small and comes first, because
verifying isolation by hand needs a second account whose data must survive resetting the first.

### Dev data reset commands (step 25 — shipped)

Shared FK-safe deletion logic lives in `src/lib/db/scripts/reset-lib.ts` (`resetUser`, `resetAll`);
the two CLIs wrap it. The reset targets `DATABASE_PATH` (default `./sqlite.db`), so prefix it to hit
the e2e DB.

- **Reset one account** (removes the user and everything it *exclusively* owns; entities shared with
  another user's schedule survive, and so does any entity pinned by a shared student's surviving
  assignment):
  ```
  npm run db:reset-user -- --email=someone@example.com            # asks to confirm, shows the plan first
  npm run db:reset-user -- --email=someone@example.com --dry-run  # per-table counts, writes nothing
  npm run db:reset-user -- --email=someone@example.com --yes      # no prompt
  DATABASE_PATH=./test-sqlite.db npm run db:reset-user -- --email=admin@example.com --yes
  ```
  Unknown email exits non-zero and changes nothing.
- **Reset everything** (empties every table; schema stays, so a later `db:seed` works):
  ```
  npm run db:reset -- --yes
  npm run db:reset -- --yes --seed        # one-liner fresh environment
  npm run db:reset -- --dry-run
  ```
  Refuses to run with `NODE_ENV=production` unless `--force-production` is also passed.

Gotcha learned here: a migration seeds an ownerless `default-2026` `scheduling_periods` row
(`user_id = NULL`). `reset-user` never touches it (it isn't anyone's), so absolute
`scheduling_periods` counts in tests include it — assert on specific ids, not totals.
