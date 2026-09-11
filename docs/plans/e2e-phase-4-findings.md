# E2E Phase 4 — findings

Findings from the Phase 4 journeys (calendar as the workspace, blackout dates,
export, schedule health, dashboard/readiness) plus the two carried-over fixes
scheduled into this phase (P1-c active-schedule write gate, P1-e unsaved-changes
guard).

The recurring theme is the same schedule-scoping class seen in Phases 1–3 (a
read path scoped to student/entity but not to the active schedule), now extended
to the calendar and blackout dates, plus two "the surface doesn't carry the
truth" gaps (out-of-range styling never set; export missing columns).

## Product bugs (fixed this phase, with regression coverage)

### P4-a — Calendar counted other schedules' assignments _(fixed)_

`getEnrichedAssignments` (calendar-service) scoped assignments through
`schedule_students` membership but not by the assignment's own `schedule_id`, so
a student in more than one schedule with overlapping dates saw the other
schedule's chips on the calendar (and in the export, which shares this query).
**Fix:** join/scope by `sa.schedule_id = filters.scheduleId` (dropped the
membership join). **Regression:** `calendar-editing.integration.test.ts`.
Surfaced by J4.1 (the date-range filter that would not clear a chip).

### P4-b — Out-of-range calendar days were never flagged _(fixed)_

`calendarMonths()` (`/calendar/+page.svelte`) never set `isInRange`, so days
outside the active schedule's start/end were not styled `out-of-range` and the
grid gave no signal that a day lay outside the schedule.
**Fix:** compute `isInRange: dateStr >= rangeStart && dateStr <= rangeEnd` from
`data.activeSchedule` bounds. Asserted in J4.1.

### P4-d — Blackout dates were global, not schedule-scoped _(fixed, migration)_

Blackout dates had no `schedule_id`: creating a blackout in one schedule blacked
out that date in **every** schedule, and the calendar, conflict, and validation
queries read every schedule's blackouts — a tenant-isolation defect.
**Fix:** migration `shared/102_blackout_schedule_id` rebuilds `blackout_dates`
with a nullable `schedule_id`, `UNIQUE(schedule_id, date)` (was `UNIQUE(date)`)
and an index, backfilling existing rows to the active schedule; the service and
every read path (list, range, conflicts, calendar loader, schedule/assignment/
day-state validation) are scoped to the owning schedule, and creation/deletion
enforce ownership. **Regression:** cross-schedule isolation, same-date-in-two-
schedules, and delete-ownership tests in `blackout-date-service.test.ts`, plus
`migrations.equivalence` staying green (SQLite/Postgres schemas match).
Chosen (via AskUserQuestion) as "fix it now" over deferring.

### P4-e — Duplicate blackout surfaced a raw 500 _(fixed)_

A repeat blackout insert hit the UNIQUE constraint and surfaced as a 500 rather
than a friendly conflict. **Fix:** `createBlackoutDate` pre-checks (scoped to the
schedule) and raises `ConflictError` (→ 409) whose message says "duplicate".
**Regression:** `blackout-date-service.test.ts` → "rejects duplicate dates with a
friendly ConflictError". Asserted in J4.2.

### P4-f — Export did not carry site or override codes _(fixed)_

The `.xlsx` export omitted the site and the accepted override codes, so an
exported schedule could not be reconciled against what was actually scheduled —
the calendar knew more than the record it produced.
**Fix:** `getEnrichedAssignments` left-joins `sites` and returns `site_name`
(added to `EnrichedAssignment`); the Master Schedule sheet becomes one faithful
row per assignment with Site, Elective, Source, Locked and Override Codes
columns (override codes parsed from their stored JSON array). Asserted in J4.3.

## Testability changes (no product behaviour change)

- **Calendar page object** — `chipById` and `dayCell` take `.first()`: a date on
  a month boundary is rendered in two month grids (its own month plus the
  adjacent month's spillover week), so an unqualified locator matched two
  elements. This is why J4.1's chip click failed only for some seeded weekdays.

## Carried-over fixes built this phase

### P1-c — Active-schedule write gate _(built)_

A user must have a schedule selected to make any change. Entity list pages
already hid their "Add" entry points without an active schedule, but the create
endpoints did not enforce it — they called `autoAssociateWithActiveSchedule`,
which silently no-ops when none is set, orphaning the new row in no schedule.
**Fix:** `students`, `sites`, `health-systems`, `clerkships`, `preceptors` and
`teams` POST now resolve `requireActiveScheduleId` first (400 when none) and
associate with that schedule; the dead helper was removed. J1.2 asserts the
gate after the delete-active flow (the page offers no Add entry point and
`POST /api/students` returns 400).

### P1-e — Unsaved-changes navigation guard _(built, R10.3)_

`FormShell` implemented a discard-changes guard but was imported by zero forms.
Wired once at the app layout via a shared registry (`unsaved-changes.svelte.ts`):
forms register a dirty predicate and the single mounted guard fires when any is
dirty. The five entity forms register and mark themselves saved on a successful
submit and on explicit Cancel. J1.5 now asserts the in-app "Discard unsaved
changes?" dialog (never a native alert), with Cancel keeping edits and Discard
proceeding.

## Decisions recorded (not bugs)

### P4-c — Blackout conflict resolution deletes the conflicting assignments

Adding a blackout on a day that already has assignments opens a Scheduling
Conflict dialog listing each student/preceptor/clerkship (matching the conflicts
API); confirming **deletes** those assignments. The plan floated "keep the
assignments and just flag them"; the product's chosen resolution is to delete,
and J4.2 asserts that behaviour rather than treating it as a bug.

## Observations (follow-ups, not blocking)

- **Blackout finding delta.** In J4.4, adding one blackout on a day with one
  assignment raised the whole-schedule validation total by two, not one — the
  seeded day carries a second finding once considered. J4.4 therefore asserts
  cross-surface equality and return-to-baseline rather than an exact delta.
  Worth a closer look at `validateSchedule`'s per-day accounting, but the
  "one number everywhere" invariant holds on every surface.
- **Pre-existing flake.** `phase-2/preceptor-wizard.spec.ts` ("weekly
  availability pattern") times out with an `Internal error: step id not found`
  in this environment. Confirmed to reproduce on the pre-Phase-4 HEAD (stashed
  the Phase-4 changes and re-ran), so it is unrelated to this phase's work.

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — full unit/integration suite green (1722+ tests), including
  the new P4-d regressions and `migrations.equivalence`.
- Phase-4 journeys (`e2e/journeys/phase-4/`) green: J4.1 calendar, J4.2 blackout
  dates, J4.3 export, J4.4 schedule health, J4.5 dashboard/readiness. J1.2 and
  J1.5 re-assert the carried-over P1-c/P1-e fixes.
