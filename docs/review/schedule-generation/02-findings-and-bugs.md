# Findings: functionality, bugs and gaps

Every `F-nn` below was checked against the code and, where marked **Verified**, reproduced by a throw-away Vitest probe that drove the real `POST /api/schedules/generate` handler and the real engine against an in-memory migrated SQLite database (the probe was deleted; `06-test-coverage-plan.md` turns each reproduction into a permanent test). Existing suites (764 tests across 51 files) pass, so **none of these defects is currently caught by a test**.

Severity: **S1** data loss / cross-tenant / silently wrong schedule · **S2** feature does not do what the UI says · **S3** incorrect but visible or low-impact · **S4** hygiene.

Section F carries the parity and manual/generated interoperability findings (`P-nn`); each one is analysed in full in `08-tier-parity-and-interop.md`.

---

## A. Correctness of the generated schedule

### F-01 · S1 · Past and existing assignments are never credited — the engine over-schedules

**Verified.** 5 required days, 2 kept "past" days, regenerate from the cutoff → 5 new days, **7 total**. Completion mode: 3 existing → 5 new, **8 total**. A locked day: 1 locked + 5 new = **6**.
**Why.** The route credits past/existing rows into the legacy `SchedulingContext.studentRequirements` (`prepareRegenerationContext`, `prepareCompletionContext`), then calls `ConfigurableSchedulingEngine.schedule()` which never receives that context and computes `requiredDays` from `clerkship.required_days` afresh. `StrategyContextBuilder` only removes the student's already-used _dates_, not the _count_.
**Fix.** Pass a per-student, per-clerkship (and per-elective) "already satisfied days" map into the engine (or compute it inside `buildSchedulingContext` from `schedule_assignments` for the schedule) and subtract it from `config.requiredDays` before the strategy runs. Treat locked rows the same way.

### F-05 · S1 · The constraint system is never executed

**Verified.** A student with no onboarding at the preceptor's health system, for a clerkship not offered at the preceptor's site, receives all 5 days with 0 violations.
**Why.** `validateAssignments()` builds `this.constraints` via `ConstraintFactory` but the loop body is a comment; only `CapacityChecker` runs. `PreceptorAvailabilityConstraint`/`PreceptorCapacityConstraint` are not even in the factory; the site constraints are conditional on context fields the engine never populates.
**Impact.** Generation happily produces schedules that Stage 1's schedule-health panel immediately flags (`not_onboarded`, `site_not_allowed`); `bypassedConstraints` is meaningless (F-11).
**Fix.** See `03-design-recommendations.md` §2 (single validation pipeline). At minimum: evaluate `this.constraints` against a live `SchedulingContext` that is updated as assignments are accepted, and include availability, capacity, onboarding, allowed-site, blackout, double-booking and lock constraints.

### F-07 · S1 · `CapacityChecker` default yearly cap = `preceptors.max_students` (a per-day number)

**Verified.** Preceptor `max_students = 1` (the Stage 1 default), no capacity rule, one existing assignment anywhere in the calendar year → engine returns **0 assignments, 5 violations "Preceptor at yearly capacity (1/1)", 0 unmet requirements, success=false**.
**Why.** `resolveCapacityRule()` falls back to `{ maxStudentsPerDay: 2, maxStudentsPerYear: preceptor.max_students || 20 }` while `StrategyContextBuilder` treats `max_students` as the _daily_ cap and 50 as yearly. Any smart/completion run against a schedule that already has assignments hits this for every preceptor without an explicit `preceptor_capacity_rules` row. (The integration suites pass because they always create a capacity rule with `maxStudentsPerYear: 100`, or run on an empty database.)
**Fix.** One capacity resolver with one semantic: `max_students` is per-day; yearly limit only from a rule, default unlimited. Count pending + DB occupancy in the same place.

### F-06 · S1 · A rejected batch is reported as fully assigned

**Verified** (same probe as F-07): 5 proposals rejected → 0 unmet requirements. `assignedDays` is computed from the _proposed_ list before knowing whether validation passed, so the student silently gets nothing and the results page shows no gap.
**Fix.** Compute unmet requirement from the _accepted_ list; on rejection record an unmet requirement with the violation reasons.

### F-12 · S2 · `minimal-change` is a no-op and its preview is wrong

**Verified.** 5 valid future assignments; apply `minimal-change` → `preservedFutureAssignments: 0`, `deletedFutureAssignments: 5`, 0 original rows survive. Preview for the same request → `preservableCount: 5`.
**Why.** The route deletes future rows (`clearAllAssignments`) **before** `prepareRegenerationContext` inspects them, and `applyMinimalChangeStrategy()`'s output is discarded.
**Fix.** Reorder: analyse → decide keep-set → delete only non-kept → seed the engine with kept rows as pre-existing occupancy and credit (depends on F-01). Or remove the option until it works; the UI currently defaults to it.

### F-09 · S1 · Optional electives silently shrink the clerkship

**Verified.** `required_days = 10`, one elective `is_required = 0, minimum_days = 4` → 6 days generated, **no unmet requirement**.
**Why.** `nonElectiveDays = required_days − Σ all electives.minimum_days`, but only required electives are scheduled.
**Fix.** Subtract only required electives; treat optional electives as alternative ways to satisfy days (or ignore them) — decide the product rule and document it in the spec.

### F-15 · S2 · Block-based strategy chooses calendar blocks blindly

**Verified.** Inpatient, 10 days, block size 5, preceptor available every weekday from Mon 2 Mar, range starting Sun 1 Mar → **0 assignments**, "No preceptor available for block 1 (2026-03-01 to 2026-03-05)".
**Why.** Blocks are `availableDates.slice(k·size, (k+1)·size)` over _calendar_ days starting at `startDate`; weekends and preceptor availability are not considered when placing the block window, and windows never slide.
**Fix.** Search for the earliest window of `blockSize` _preceptor-available_ days (optionally weekday-only) per block; allow the window to move; check daily capacity (F-16).

### F-16 · S2 · Block-based ignores daily capacity

`findPreceptorAvailableForAllDates()` checks availability only; `hasDailyCapacity` is never called in this strategy, so several students can be stacked on a `max_students = 1` preceptor and the post-hoc capacity check (DB-only in dry run) does not catch it.

### F-17 · S3 · Fallback gap filler can double-book a student across clerkships

`fillStudentGap()` skips dates the student already has **for this clerkship** only. `bulkCreateAssignments` then de-duplicates by `(student, date)` keeping the last one, so one of the two days is dropped without any report.

### F-10 · S3 · Electives use the parent clerkship's strategy and ignore elective configuration

`resolveElectiveConfiguration()` is dead code; `global_elective_defaults` (seeded `daily_rotation`) and elective `override_*` columns are never read; `elective_sites`, `is_global_fallback_only` and capacity rules are ignored on the elective path; `maxStudentsPerYear` is hard-coded to 50.

### F-08 · S2 · Per-clerkship overrides are ignored

`clerkship_configurations.override_*` (the whole "Auto-scheduling" tab on a clerkship) has no effect on generation; `resolveClerkshipConfiguration()` reads only the global default row. `ClerkshipSettingsService.getClerkshipSettings()` already merges correctly and should be the single source.

### F-11 · S2 · `bypassedConstraints` does nothing, and the UI names do not match

The dialog sends `preceptor-capacity`, `site-capacity`, `specialty-match`, `health-system-continuity`, `no-double-booking`; constraint `name`s are `PreceptorCapacity`, `SiteCapacity`, … and the list is never evaluated anyway (F-05). `CapacityChecker` has no bypass hook. Completion mode's whole selling point ("relax constraints only for new assignments") is therefore not implemented.

### F-13 · S3 · Result statistics are wrong

**Verified.** Nothing schedulable, 1 student, 2 clerkships → `{ totalStudents: 0, fullyScheduledStudents: -2, unscheduledStudents: 2, completionRate: 0 }`. `totalStudents` counts students with ≥1 assignment; `fullyScheduled` subtracts a count of requirement rows.

### F-18 · S3 · Availability semantics differ between Stage 1 and the engine

Stage 1 validation treats "no availability row" as available and only `is_available = 0` as unavailable (a preceptor is schedulable with just a name, spec R3.5). The engine treats "no row" as unavailable and never schedules such a preceptor. Both are defensible but the difference is undocumented; the readiness checklist mentions it only indirectly ("Set availability for N preceptor(s)").

### F-19 · S3 · Team membership is the only eligibility source; `preceptor_sites`/`clerkship_sites` are ignored

A preceptor who is not on a team for the clerkship is never a candidate (the Teams tab copy says "only used as a backup" — in fact they are never used at all, because the fallback resolver is also team-based). Conversely a team member is eligible even if the clerkship is not offered at the site where they are available.

### F-20 · S3 · Health-system / site / team continuity rules never influence placement

`healthSystemRule`, `require_same_health_system|site|specialty`, `HealthSystemContinuityConstraint`, `SiteContinuityConstraint`, `SamePreceptorTeamConstraint` are configured, stored, tested in isolation, and unused by the running engine (F-05).

### F-21 · S4 · `DailyRotation` and `BlockBased` are all-or-nothing, `TeamContinuity` returns partials

Inconsistent contract: a 19/20 result is kept for outpatient clerkships and thrown away for inpatient ones. Decide one rule (recommend: keep partials, report the gap) and apply it to all strategies.

---

## B. Tenant isolation, scope and data integrity

### F-02 · S1 · Generation and deletion run across every tenant

**Verified.** Tenant A runs generation: B's future assignment is deleted, B's student receives 10 generated days including 5 with **A's preceptor for A's clerkship**. `DELETE /api/schedules?clearAll=true` called by A removes all of B's rows.
**Why.** The route loads `students`, `preceptors`, `clerkships`, `blackout_dates`, `preceptor_availability` and `teams` without a schedule filter; `clearAllAssignments` has no scope; the engine's `StrategyContextBuilder` and `buildSchedulingContext` are equally unscoped; the schedule id is only used _after_ saving, to pick a period.
**Fix.** Resolve `requireActiveScheduleId(locals)` first; pass `scheduleId` to every loader and to deletion (`… WHERE student_id IN (SELECT student_id FROM schedule_students WHERE schedule_id = ?)`); restrict the engine to entities in the `schedule_*` junctions; reject `startDate/endDate` outside the schedule's range. Add the mirror test to `tenant-isolation-mutations.test.ts`.

### F-03 · S1 · `/api/scheduling/execute` schedules arbitrary ids

Body-supplied `studentIds`/`clerkshipIds` are not checked against the caller's schedule; with `dryRun: false` it writes rows for other tenants' students. Either delete the endpoint (nothing in the UI calls it) or scope it like F-02.

### F-04 · S1 · `DELETE /api/schedules` is unscoped and not Stage 2 gated

Any signed-in Stage 1 user can wipe every tenant's unlocked assignments. It is only used by the Stage 2 dialog. Scope it to the active schedule and either gate it or replace it with an explicit "clear my schedule" Stage 1 action with confirmation.

### F-14 · S2 · Generated rows lose `site_id` and `elective_id`

**Verified.** Rows saved by the route have `site_id = NULL` (the dry-run engine result carries no site and `bulkCreateAssignments` does not map `elective_id`). Manual creation requires a site (Step 29) and elective progress is tracked by `elective_id`; generated electives therefore never count toward elective requirements and calendar/site views show "no site". `engine.commitAssignments()` (the non-dry-run path) _does_ set both, but does not set `source = 'generated'`. Two persistence paths, each half right.

### F-22 · S3 · Default `regenerateFromDate` uses local time

`new Date(); setHours(0,0,0,0); toISOString()` yields _yesterday_ in UTC+ time zones. Use `todayUTC()` like the rest of the codebase (`date-utils.ts`).

### F-23 · S3 · Period auto-creation uses the global `is_active` flag

When the caller has no active schedule the route falls back to `getActiveSchedulingPeriod()` (installation-wide) and `createSchedulingPeriod({ is_active: true })`, which throws `ConflictError` if _any other user's_ period is active, and creates a period with `user_id = NULL`. Schedule-first architecture already guarantees an active schedule; delete this branch and fail with 400 "No active schedule".

### F-24 · S4 · Audit log is never persisted

`logRegenerationEvent()` writes to the logger only ("TODO: store in database table"). `userId` is never passed. There is no record of who generated what, when, with which options — required for G6 ("never modifies past assignments unless explicitly told to") to be auditable.

### F-26 · S3 · DB CHECK constraint rejects the default strategy

**Verified.** `UPDATE global_outpatient_defaults SET assignment_strategy = 'team_continuity'` fails with `CHECK constraint failed`. The global-defaults form offers "Team Continuity (Default)" and the `AssignmentStrategy` enum lists it; saving the form with that value fails on SQLite and Postgres alike (both baselines carry the same CHECK). `continuous_team` is accepted by the DB but has no strategy (falls through to team continuity).

---

## C. Results, UI and diagnostics

### F-25 · S2 · Violations and suggestions never reach the Results page

`GET /api/schedule/summary` → `getScheduleSummaryData()` recomputes completion from the DB and never sets `violationStats`; the engine's `violations`, `unmetRequirements` (with _reasons_) and `statistics` are returned once in the POST response and then lost. `ViolationStatsCard`, `SuggestionsPanel` and `suggestion-generator.ts` (0% coverage) are dead in practice. Step 13's acceptance criterion "violation stats + suggestions visible after every generation run" is not met. Persist the last run (see `04-schema-alignment.md` §3).

### F-27 · S3 · `getScheduleSummaryData()` is not schedule-scoped

It selects **all** students and clerkships, so the Results page counts other tenants' students as "unscheduled". Same class of bug as F-02.

### F-28 · S3 · Readiness item "Configure auto-generation (teams / capacity)" does not check teams or capacity

`getSetupChecklist()` marks it done when `clerkshipCount > 0 && preceptorCount > 0`. Given F-19 (no team ⇒ nothing generated) the checklist should verify every clerkship in the schedule has a team with ≥1 member who has availability in range.

### F-29 · S3 · Seeded demo data cannot be generated against

`seed.ts` writes `preceptor_availability_patterns` only; the engine reads `preceptor_availability`. `admin@example.com` clicking Generate gets 0 assignments and "No preceptors available" for every student. Either materialise pattern rows in the seed or make the engine (and Stage 1 validation) resolve patterns.

### F-30 · S4 · Dialog "Full" mode deletes twice and is inconsistent with the API

`RegenerateDialog` full mode calls `DELETE /api/schedules` (from today) and then POSTs with no `regenerateFromDate` (also today). Past assignments are therefore _kept_ in "Full Regeneration (Start Over)" despite the warning "delete all existing assignments". The route already deletes; the extra call only widens the blast radius (F-04).

---

## F. Parity and manual/generated interoperability

Full analysis, including the concept-parity matrix and the required Stage 1 updates, is in `08-tier-parity-and-interop.md`. Verified items were reproduced against the real assignment routes.

| #    | Sev | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | S1  | **Electives are configurable but not assignable.** No `elective_id` in the create/bulk/update schemas, the dialog, the read models or the export. **Verified:** posting `elective_id` returns 201 and stores `null` (Zod strips it). **Verified:** requirement tracking counts an elective day as a plain clerkship day, so per-elective progress does not exist in either tier.                                                                                                                                                       |
| P-02 | S1  | **Team eligibility is inverted between tiers.** The Stage 1 dialog treats "on no team" as _eligible for everything_; the engine treats it as _eligible for nothing_ (F-19). A hand-built roster generates nothing, and the Stage 1 refusal reason names teams — a Stage 2 concept whose UI is gated.                                                                                                                                                                                                                                   |
| P-03 | S1  | **Create and edit use different validators.** Create uses `validateAssignmentCandidate` (hard/soft codes, overrides, `override_codes` persisted); PATCH/reassign/swap use the legacy `validateAssignment` (strings, everything hard, no overrides, no site/onboarding/range checks). **Verified:** moving a day onto an explicitly unavailable date with `force=true` and `override_codes` → 400; reassigning to an at-capacity preceptor → `valid:false` with no override path. Generated or overridden days are therefore immovable. |
| P-04 | S2  | **Reassign and swap ignore relational rules.** **Verified:** an elective day reassigns cleanly to a preceptor outside that elective's pool, keeping `elective_id`. Team, allowed-site and elective-pool rules are unchecked on both paths.                                                                                                                                                                                                                                                                                             |
| P-05 | S3  | **"No availability row" means opposite things** — assignable in Stage 1, never scheduled by the engine (see F-18). Undocumented in the UI.                                                                                                                                                                                                                                                                                                                                                                                             |
| P-06 | S3  | **Capacity rules are Stage 2-only but change Stage 1 warnings.** Stage 1 warns from `preceptors.max_students`; the engine reads `preceptor_capacity_rules`. An entitled user sees two capacities for one preceptor.                                                                                                                                                                                                                                                                                                                    |
| P-07 | S2  | **`source`, `locked`, `elective_id` and `override_codes` appear in no read model** (calendar, student schedule, preceptor schedule, export), so generated days are indistinguishable from hand-made ones and cannot be filtered.                                                                                                                                                                                                                                                                                                       |
| P-08 | S3  | **Lock semantics undocumented and untested.** **Verified:** a non-entitled user can move a locked generated assignment (only the lock toggle is gated). Defensible, but unwritten and unasserted.                                                                                                                                                                                                                                                                                                                                      |
| P-09 | S2  | **Generation silently loses to manual rows.** `bulkCreateAssignments` skips occupied `(student, date)` slots — the mechanism that preserves manual and locked rows — and reports nothing, so the user never learns which days were skipped or why.                                                                                                                                                                                                                                                                                     |
| P-10 | S3  | **Three write paths for `schedule_assignments`** (`createManualAssignment`, `bulkCreateAssignments`, `commitAssignments`) set different column subsets; any new column will be missed by at least one.                                                                                                                                                                                                                                                                                                                                 |
| P-11 | S3  | **No preview of the effect on the user's own work.** Nothing distinguishes generated from manual rows in the preview, and the preview itself is wrong for minimal-change (F-12).                                                                                                                                                                                                                                                                                                                                                       |
| P-12 | S4  | **`/api/preceptors/teams*` is ungated while its UI is gated**, so a Stage 1 user can create teams by API that they cannot see, silently changing dialog eligibility.                                                                                                                                                                                                                                                                                                                                                                   |

## D. Dead, duplicated and misleading code

| Item                                                                                                                                                | Location                                                                | Note                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `SchedulingEngine`                                                                                                                           | `services/scheduling-engine.ts`                                         | Exported from `features/scheduling/index.ts`, fully tested (98%), not used by any route. It _does_ run constraints — the newer engine regressed this. |
| `FallbackResolver`                                                                                                                                  | `fallback/fallback-resolver.ts`                                         | Deprecated, instantiated by the engine, never called (6.7% coverage).                                                                                 |
| `TeamValidator`                                                                                                                                     | `team-formation/team-validator.ts`                                      | 404 lines, never imported (0%).                                                                                                                       |
| `resolveElectiveConfiguration`, `enableTeamFormation`, `enableOptimization`, `maxRetriesPerStudent`, `pendingApprovals`, `fallbackRequiresApproval` | engine                                                                  | Read/declared, never used.                                                                                                                            |
| `RequirementService`, `/api/scheduling-config/requirements/*`                                                                                       |                                                                         | Deprecated (table dropped) but still routable.                                                                                                        |
| `docs/scheduling/test-coverage-summary.md`                                                                                                          |                                                                         | Cites `regenerate-dialog.test.ts` (24 tests) which does not exist.                                                                                    |
| `e2e/api/**`, `e2e/ui/**`                                                                                                                           |                                                                         | Not in `playwright.config.ts` (`testDir: e2e/journeys`); they use `start_date`/`end_date` keys the API does not accept. Nothing runs them.            |
| Three different capacity semantics                                                                                                                  | `StrategyContextBuilder`, `CapacityChecker`, `assignment-validation.ts` | See F-07.                                                                                                                                             |

---

## E. What works

To keep the picture fair, these behaviours were exercised and are correct:

- Entitlement gating: non-entitled `POST /api/schedules/generate` → 403 (verified); `/generate` layout 403; nav item hidden; seven gated routes covered by `stage2-gating.test.ts`.
- In a fresh schedule (no prior assignments, capacity rules present) the team-continuity strategy fills requirements, respects `max_students` per day across students (verified 2 students / 1 preceptor: max 1 per day, both complete), skips blackout dates and explicit `is_available = 0` days, and returns partial results with reasons.
- Locked rows survive regeneration (`clearAllAssignments` keeps `locked = 1`; `bulkCreateAssignments` skips occupied `(student, date)` slots) — they are just not credited (F-01).
- The gap filler's tiering (same team → same health system → cross-system when allowed) and its unit tests are sound.
- Preview mode makes no writes.
