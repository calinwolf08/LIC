# E2E Phase 3 — findings

Findings from the Phase 3 manual-scheduling journeys (entry points, range
creation, the soft-code/override conversation, hard blocks, the edit lifecycle,
swap, electives, locks, and the availability ripple).

Three product bugs surfaced — all instances of the same class: a read path that
was scoped to a student but **not** to the active schedule, so a student who
belongs to more than one schedule saw the other schedules' days bleed into the
current one. Each is fixed with a scoping filter plus a regression unit test.
One UI gap and one deep-linking gap are recorded, and one apparent bug turned
out to be enforced-by-design and is documented rather than "fixed".

## Product bugs (fixed this phase, with regression tests)

### P3-a — Student schedule/progress view counted other schedules' days _(fixed)_

`getStudentScheduleData` (schedule-views-service) filtered the assignments query
by `student_id` and the date range but not by `schedule_id`, so a student's
schedule and clerkship-progress view counted assignments from the same user's
other schedules with overlapping dates. Powers the student detail page's
Schedule tab and the `/api/students/[id]/schedule` endpoint.
**Fix:** add `.where('sa.schedule_id', '=', scheduleId)` to the assignments
query (the clerkship-progress query was already scoped).
**Regression:** `schedule-views-service.test.ts` → "does not count assignments
from the same student on another schedule (P3-a)".
Surfaced by J3.5 (edit lifecycle).

### P3-c — Requirement preview counted other schedules' days _(fixed)_

`previewRequirementImpact` (requirement-preview) scoped the clerkship lookup to
the schedule but counted the student's existing days by `student_id` +
`clerkship_id` (+ `elective_id`) only — so the dialog's "N of M still needed"
strip and the amber over-assignment warning reflected every schedule at once.
**Fix:** add `.where('schedule_id', '=', scheduleId)` to the assignment count.
**Regression:** `requirement-preview.test.ts` → "does not count the student's
days on another schedule (P3-c)".
Surfaced while building J3.7 (electives).

### P3-d — Student requirement status counted other schedules' days _(fixed)_

`getStudentStatuses` (requirement-status) loaded assignments by
`student_id in (…)` with no `schedule_id` filter, even though the students and
clerkships it iterates are already schedule-scoped. It powers the students list
and the student detail overview (days scheduled / completed / conflicts). In a
fresh sandbox, Alice showed "5 scheduled" for Family Medicine — her Demo-schedule
days leaking in.
**Fix:** add `.where('schedule_id', '=', scheduleId)` to the assignments query.
**Regression:** `requirement-status.test.ts` → "does not count the student's
days on another schedule (P3-d)".
Surfaced by J3.7 (visible in the student-page overview during the run).

### P3-g — Deleting a schedule orphaned its assignments _(fixed)_

`deleteSchedulingPeriod` deleted the period and its entity-junction rows
(`schedule_students`, `schedule_clerkships`, …) but not its
`schedule_assignments`. The orphaned rows are unreachable afterward (every
assignment view is schedule-scoped) yet still occupy the global
`UNIQUE(student_id, date)` slot (`idx_assignments_student_date`), so a student
who had a day in a deleted schedule could not be reassigned that calendar date in
any other schedule. It also accumulates dead rows over time.
**Fix:** delete `schedule_assignments` for the schedule before deleting the
period.
**Regression:** `scheduling-period-service.test.ts` → "deletes the period's
assignments too (P3-g, no orphans)".
Surfaced by the Phase-3 sandbox teardown: each journey deletes its sandbox, and
the leftover assignments collided (via the global unique) with the next journey
that assigned the same student on the same date.

> These four are siblings of the Phase-0 review's schedule-scoping work
> (F-02 / `04-schema-alignment.md`, which added `schedule_id` to
> `schedule_assignments`). The generation and deletion paths were scoped then;
> these three read paths were missed.

## Investigated — not a bug (documented)

### P3-f — Cross-schedule "double-book" is enforced by the schema, on purpose

The `student_double_booked` hard check (assignment-validation and
schedule-validation) queries `schedule_assignments` by `student_id` + `date`
without a `schedule_id` filter, so it flags a student's day in schedule A when
creating on the same date in schedule B. This first looked like a fourth
scoping bug, but the DB enforces a **global** `UNIQUE(student_id, date)`
(`idx_assignments_student_date`, migration 001, comment "student cannot be
double-booked on same date"): a student is one place per calendar day across
every schedule. The validator deliberately mirrors that constraint so the
conflict surfaces as a clean hard violation instead of a raw DB unique-violation
error. **No change** — both call sites now carry a comment explaining why they
are intentionally not schedule-scoped (unlike the counting paths above).
J3.6 (swap) picks each student a date free of any existing assignment to respect
this constraint.

## Gaps and their resolutions

### P3-b — `EntityTabs` did not restore the active tab from the URL _(fixed)_

`EntityTabs` wrote the chosen tab to a URL query param (`?tab=…`) on click but
never read it back to initialise `active`, so deep-linking or reloading
`…/students/[id]?tab=schedule` landed on the default Overview tab — even though
the sibling view toggle (`?view=list`) _was_ restored by the student page's own
`$effect`.
**Fix:** an `$effect` in `EntityTabs` restores `active` from `urlParam` on mount
and on back/forward, mirroring the `?view=` behaviour; `select()` writes the
param, so once they agree it is a no-op and cannot loop.
**Regression:** `e2e/journeys/phase-3/entity-tab-deeplink.spec.ts` — a `?tab=`
URL opens that tab, survives reload, and a click updates the URL so the reloaded
URL restores it.

### P3-e — Swap has an API and service but no UI surface _(decision: keep, no UI now)_

`POST /api/schedules/assignments/swap` and `swapAssignments` (editing-service)
are implemented and correct (they exchange two assignments' preceptors, both
sides validated before either is written), but nothing in the app reaches them.
**Decision:** keep the route and service — do **not** wire a UI for now; revisit
only if coordinators ask to trade two assignments' preceptors. J3.6 drives the
route directly so it stays covered and cannot rot. Recorded in the plan §1.2/§1.3.

## Pre-existing failure observed (out of Phase-3 scope)

- **J2.2 (Phase 2, preceptor wizard → availability) fails on the current
  system date.** The weekly Mon/Wed/Fri pattern preview computes "0 dates", so
  the wizard never lands back on the list and the test times out. It reproduces
  identically on a clean `HEAD` checkout (with the Phase-3 changes stashed), so
  it is not caused by this phase — it is date-sensitive (the run's "today" is
  well inside the seeded schedule range) and belongs to the Phase-2 preceptor
  suite. Recorded here so the full-suite result is understood; not fixed as part
  of Phase 3.

## Decisions confirmed (no change needed)

- **The one dialog serves every entry point.** Student page (student locked),
  calendar day (date locked) and the dialog's own "Add assignment" all render the
  same component and agree with the API afterward. J3.1.
- **The soft vocabulary is accept-and-record.** Each accepted soft code
  (`blackout_date`, `not_onboarded`, …) persists on the row's `override_codes`
  and shows in the schedule-health panel; onboarding the student later reads as
  resolved. J3.3.
- **Hard blocks never pass.** A student double-book is refused in the picker
  (day listed as blocked, submit disabled) and rejected by the API even when the
  hard override code is forced. J3.4.
- **Per-elective requirements are tracked independently.** The dialog counts
  against the elective's own `minimum_days` (not the clerkship's), and days on
  one elective do not count toward another; each row carries its own
  `elective_id`. J3.7.
- **Locks are Stage 2.** The lock control appears only with the `autogen`
  entitlement; a locked manual day persists `locked = 1` and shows 🔒, and the
  update API silently ignores a `locked` field from a non-entitled caller. J3.8.
- **Schedule health is live.** Marking a preceptor unavailable on a day they are
  already assigned surfaces a `preceptor_unavailable` conflict on reload — the
  health view is recomputed from current availability, not frozen at assignment
  time. J3.9.

## Test-infrastructure notes (in `e2e/journeys/phase-3/`)

- **`helpers.ts` → `populatedSandbox(page, name)`** — manual-scheduling journeys
  mutate heavily, so each runs in a throwaway sandbox schedule seeded with the
  full roster (read from the active schedule's `/api/*` lists while Demo is
  active, then added to the sandbox and activated). Works for either tier: J3.8's
  basic-tier test populates from the isolated Tenant B schedule.
- **The student-schedule endpoint returns camelCase** (`preceptorId`,
  `electiveName`), while the `db` fixture returns raw snake_case columns
  (`preceptor_id`, `elective_id`). Journeys read the API in camelCase and the DB
  in snake_case; mixing them silently reads `undefined` (cost a debugging cycle
  in J3.5).
- **`AssignmentDialog.submitAndExpectCreated`** matches the most recent toast
  (`.last()`), so a still-visible "N day(s) assigned" toast from an earlier
  create in the same test does not trip Playwright strict mode.
- **The global `UNIQUE(student_id, date)`** means any journey that assigns a
  student on a fixed date can collide with the seeded Demo/Tenant-B rows; J3.6
  and J3.9 pick the first future weekday free of the student's existing days
  (via the `db` fixture) rather than a fixed offset.
