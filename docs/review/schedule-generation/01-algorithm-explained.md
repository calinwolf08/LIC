# How schedule generation works today

**Scope:** the code path behind **Auto-Generate → Generate schedule…** (`POST /api/schedules/generate`) and the lower-level `POST /api/scheduling/execute`, as of commit `0b3561a` on `master`.
**Audience:** engineers who need to change the engine or write tests for it. Every section names the file it describes so you can read along.

> This document describes what the code **does**, including behaviour that is wrong. Defects are marked `⚠ F-nn` and are explained in `02-findings-and-bugs.md`.

---

## 1. Thirty-second overview

```
RegenerateDialog ──POST /api/schedules/generate──▶ +server.ts (route)
                                                      │
        ┌─────────────────────────────────────────────┼──────────────────────────────┐
        │ preview=true                                │ strategy=completion          │ full-reoptimize / minimal-change
        ▼                                             ▼                              ▼
 analyzeRegenerationImpact()              prepareCompletionContext()        clearAllAssignments(from date)
 (legacy context, no writes)              (legacy context)                  prepareRegenerationContext() (legacy context)
        │                                             │                              │
        │                                             ▼                              ▼
        │                                  ConfigurableSchedulingEngine.schedule(dryRun: true)
        │                                             │
        │                                             ▼
        │                                  bulkCreateAssignments()  ──▶ schedule_assignments
        │                                             │
        └──── JSON response ◀─────────────────────────┴──── audit log (console only)
```

The engine is a **greedy, per-student, per-clerkship heuristic**. For every student (in table order) and every clerkship (in table order) it asks a _strategy_ to propose a full set of dates and preceptors, runs a (very partial) validation pass, and either accepts all proposed days or rejects all of them. A second _gap-filling_ pass tries to top up whatever is still missing using team-mates. There is no search, no backtracking, no scoring and no global optimisation.

Two independent "contexts" exist:

| Context                                                        | Built by                                                                             | Used by                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Legacy `SchedulingContext`** (`types/scheduling-context.ts`) | `buildSchedulingContext()` in `services/context-builder.ts`                          | The regeneration/completion/preview services and the **unused** legacy `SchedulingEngine` |
| **Engine's own context**                                       | `ConfigurableSchedulingEngine.buildSchedulingContext()` and `StrategyContextBuilder` | The strategies and the fallback gap filler                                                |

The route builds the legacy context, mutates it (credits past assignments, marks preserved assignments) and then **never passes it to the engine** (`⚠ F-01`). The engine rebuilds everything from the database on its own.

---

## 2. Entry points and gating

### 2.1 `POST /api/schedules/generate` (`src/routes/api/schedules/generate/+server.ts`)

1. `requireAutogen(locals)` – throws a SvelteKit `error(403)` unless the user's `user.entitlements` JSON contains `"autogen"`. (`hooks.server.ts` parses the column into `locals.entitlements` on every request.)
2. Parses the body with `generateScheduleSchema` (`features/scheduling/schemas.ts`):

   | Field                  | Type                                                  | Default                                                     | Meaning                                                                                                                                              |
   | ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `startDate`, `endDate` | `YYYY-MM-DD`                                          | required                                                    | Range the engine may place days in. `startDate < endDate` enforced.                                                                                  |
   | `regenerateFromDate`   | date                                                  | **today** (local-time midnight converted to UTC, `⚠ F-22`) | Assignments with `date >= regenerateFromDate` are deleted and regenerated; earlier ones are "past" and kept. Must lie within `[startDate, endDate]`. |
   | `strategy`             | `full-reoptimize` \| `minimal-change` \| `completion` | `full-reoptimize`                                           | See §7.                                                                                                                                              |
   | `preview`              | boolean                                               | false                                                       | Analyse impact only; no writes.                                                                                                                      |
   | `bypassedConstraints`  | string[]                                              | `[]`                                                        | Names of constraints to skip. **Currently has no effect** (`⚠ F-11`).                                                                               |

3. Loads **every row** of `students`, `preceptors`, `clerkships`, `health_systems`, `teams`, `student_health_system_onboarding`, `elective_sites`, `clerkship_sites`, `blackout_dates`, `preceptor_availability` – with **no schedule or user filter** (`⚠ F-02`).
4. Builds the legacy `SchedulingContext` from those rows.
5. Branches on `preview` / `completion` / everything else (see §7).
6. Calls the engine with `dryRun: true`, then persists the returned assignments with `bulkCreateAssignments()`.
7. Resolves a scheduling period: the caller's `user.active_schedule_id` if present, otherwise the global `is_active` period, otherwise creates/activates one (`⚠ F-23`).
8. Logs an audit event with `console`/logger only – nothing is written to the database (`⚠ F-24`).

### 2.2 `POST /api/scheduling/execute` (`src/routes/api/scheduling/execute/+server.ts`)

A thin wrapper around `engine.schedule(studentIds, clerkshipIds, options)`. Also gated by `requireAutogen`. Accepts arbitrary student and clerkship ids from the request body **without checking they belong to the caller's schedule** (`⚠ F-03`). Honours `dryRun` from the body; when `dryRun` is false the engine's own `commitAssignments()` writes rows (which, unlike the route above, _does_ populate `site_id` and `elective_id`).

### 2.3 Deprecated `DELETE /api/schedules`

Used by `RegenerateDialog` in "Full regeneration" mode before it calls the generate endpoint. It calls `clearAllAssignments(db, fromDate?)` which deletes **every unlocked assignment in the database** regardless of tenant, and it is **not** entitlement-gated (`⚠ F-04`).

---

## 3. The engine: `ConfigurableSchedulingEngine.schedule()`

File: `src/lib/features/scheduling/engine/configurable-scheduling-engine.ts` (1083 lines).

```ts
schedule(studentIds, clerkshipIds, {
	startDate,
	endDate,
	enableTeamFormation = false, // read but never used
	enableFallbacks = false, // gates Phase 6
	enableOptimization = false, // read but never used
	maxRetriesPerStudent = 3, // read but never used
	dryRun = false,
	bypassedConstraints = []
});
```

The route always passes `enableTeamFormation: true, enableFallbacks: true, dryRun: true` (full/smart) or just `dryRun: true` (completion – **fallbacks are off in completion mode**).

### Phase 1 – Load students and clerkships

`SELECT * FROM students WHERE id IN (...)`, same for clerkships. Returns an empty result if either list is empty.

### Phase 2 – Load clerkship configurations (`loadClerkshipConfigurations`)

For each clerkship a `ResolvedRequirementConfiguration` is built by `resolveClerkshipConfiguration()`:

- Picks `global_inpatient_defaults` or `global_outpatient_defaults` (row `school_id = 'default'`) by `clerkship.clerkship_type`. `global_elective_defaults` is loaded but never used.
- **Per-clerkship overrides in `clerkship_configurations` are ignored** – the documented "3-level inheritance" is only one level (`⚠ F-08`). `ClerkshipSettingsService.getClerkshipSettings()` implements the merge correctly but the engine does not call it.
- Field mapping:

  | Resolved field                                                                         | Source column                                                                                       | Default when row missing                       |
  | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
  | `assignmentStrategy`                                                                   | `assignment_strategy`                                                                               | `continuous_single`                            |
  | `healthSystemRule`                                                                     | `health_system_rule`                                                                                | `no_preference` (never enforced by the engine) |
  | `maxStudentsPerDay`                                                                    | `default_max_students_per_day`                                                                      | 2                                              |
  | `maxStudentsPerYear`                                                                   | `default_max_students_per_year`                                                                     | 50                                             |
  | `blockSizeDays`, `allowPartialBlocks`, `preferContinuousBlocks`                        | inpatient columns                                                                                   | undefined / false                              |
  | `allowTeams`, `allowFallbacks`, `fallbackRequiresApproval`, `fallbackAllowCrossSystem` | flag columns (`=== 1`)                                                                              | false                                          |
  | `requiredDays`                                                                         | `clerkship.required_days − Σ elective.minimum_days` (**all** electives, required or not, `⚠ F-09`) |                                                |

  Note `maxStudentsPerDay/Year` on this object are **not** what the strategies use for capacity; they use per-preceptor numbers from `StrategyContextBuilder` (§4.2).

- Electives (`clerkship_electives` + `elective_sites` + `elective_preceptors`) are grouped per clerkship into `electivesByClerkship`.
- `resolveElectiveConfiguration()` exists but is **never called**; electives are scheduled with the parent clerkship's configuration (`⚠ F-10`).

### Phase 3 – Build the engine context and constraints

`buildSchedulingContext()` loads **all** preceptors, blackout dates, availability, health systems, teams and onboarding rows (again unscoped) and produces a `SchedulingContext`. It is handed to `ConstraintFactory.buildConstraints()` which instantiates:

- always: `BlackoutDateConstraint`, `NoDoubleBookingConstraint`, `SpecialtyMatchConstraint` (a no-op);
- conditionally on context fields that this context **never sets** (`siteAvailability`, `siteCapacityRules`, `clerkshipSites`, `preceptorClerkshipAssociations`): the site constraints – so they are never added;
- per clerkship: `HealthSystemContinuityConstraint` only when the rule is `enforce_same_system`; `StudentOnboardingConstraint` because `studentOnboarding` **is** set; `PreceptorClerkshipAssociationConstraint` never (association maps not set).

`PreceptorAvailabilityConstraint` and `PreceptorCapacityConstraint` are not in the factory at all.

**None of these constraints is ever evaluated.** `validateAssignments()` (§5) iterates the list but the loop body is a comment: _"Full constraint integration would require passing the context"_ (`⚠ F-05`). Building them is wasted work and the `bypassedConstraints` option they were meant to honour is dead.

### Phase 4 – Prioritise students

`prioritizeStudents()` returns the array unchanged. Order is whatever SQLite returns for `WHERE id IN (...)` (effectively insertion order). Students earlier in the list get first pick of every preceptor day (`⚠ D-01`, design note).

### Phase 5 – Primary scheduling

```
for student in students:
  for clerkship in clerkships:          // every student does every clerkship
    scheduleStudentToClerkship(student, clerkship)
```

`scheduleStudentToClerkship`:

1. For each elective with `is_required = 1` → `scheduleStudentToElective()` (§6).
2. If `config.requiredDays > 0` → `scheduleStudentNonElectiveDays()`:
   1. `StrategyContextBuilder.buildContext()` (§4) with `pendingAssignments` = everything accepted so far in this run.
   2. Remove from `context.availableDates` any date this student already has in `pendingAssignments` (the builder already removed DB dates and pending dates; this is a second, redundant filter).
   3. `StrategySelector.selectStrategy(config)` picks the first strategy whose `canHandle()` is true: `BlockBasedStrategy` (`block_based` + `blockSizeDays`), `DailyRotationStrategy` (`daily_rotation`), else `TeamContinuityStrategy` (handles `team_continuity`, `continuous_single`, undefined and – via the selector's fallback – anything else, including `continuous_team`).
   4. `strategy.generateAssignments(context)` → `{ success, assignments, error }`.
   5. If any assignments were proposed → `validateAssignments()` (§5). If valid, **all** are accepted into `ResultBuilder` and `pendingAssignments`. If invalid, **all** are discarded and the capacity violations are recorded.
   6. Unmet requirement is recorded only when `!result.success || assignments.length < requiredDays`. Because `assignedDays` is taken from the **proposed** list, a batch that was rejected in step 5 is reported as fully assigned (`⚠ F-06`).

### Phase 6 – Fallback gap filling (`runFallbackGapFilling`)

Runs only when `enableFallbacks` is true and there are unmet requirements. Converts each `UnmetRequirement` for `FallbackGapFiller.fillGaps()` (§8) with `primaryTeamId` / `primaryHealthSystemId` **undefined** (the engine does not track which team was used), then clears the unmet list and rebuilds it from the gap filler's `partialFulfillments` and `stillUnmet`.

### Phase 7 – Result and optional commit

`ResultBuilder.build()` returns:

```ts
{
	(success,
		assignments,
		unmetRequirements,
		statistics,
		violations,
		pendingApprovals); /* always [] */
}
```

`success` = no unmet requirements **and** no error-severity violations. `statistics` are computed from the assignments list; `totalStudents` counts only students who received at least one assignment and `fullyScheduledStudents = totalStudents − unmetRequirements.length` (a count of requirement rows, so it goes negative – `⚠ F-13`).

If `dryRun` is false, `commitAssignments()` inserts rows with `site_id` looked up from `preceptor_availability` and `elective_id` from the proposal. Note it does **not** set `source` (defaults to `'manual'`) or `updated_at`.

---

## 4. `StrategyContextBuilder` (`strategies/strategy-context.ts`)

Called once per (student, clerkship) and once per (student, elective). Each call issues the following queries (`⚠ D-02`, performance):

| Step                              | Query                                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildAvailableDates`             | all `blackout_dates`; this student's `schedule_assignments.date`                                               | Produces every calendar day in `[startDate, endDate]` (or today → +365 days if omitted) minus blackouts, minus dates the student already has in the DB, minus pending dates for the student. **Weekends are included**; only preceptor availability excludes them.                                                                                                                                                                                           |
| `buildAvailablePreceptors`        | `preceptor_team_members ⋈ preceptor_teams WHERE clerkship_id = ?` → the **only** source of eligible preceptors | A clerkship with no team has no candidates and every student gets an unmet requirement with reason _"No preceptors available"_. Then, **per preceptor**: availability rows (`is_available = 1`, all dates, not range-limited), `COUNT(*)` of that preceptor's assignments (all time), the general capacity rule (`clerkship_id IS NULL AND requirement_type IS NULL` only – the 5-level hierarchy in `CapacityChecker` is not used here), `preceptor_sites`. |
| `buildAssignmentsByPreceptorDate` | **all** `schedule_assignments` (`preceptor_id, date`)                                                          | Daily occupancy map, DB + pending.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `buildTeams`                      | `preceptor_teams` for the clerkship + members per team                                                         | Includes `require_same_*` flags that no strategy reads.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `buildExistingAssignments`        | **all** `schedule_assignments` again                                                                           | Not read by any strategy.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `buildHealthSystemInfo`           | all health systems, all sites                                                                                  | Only used for `healthSystems`/`sites` maps that no strategy reads.                                                                                                                                                                                                                                                                                                                                                                                           |

Per-preceptor capacity numbers exposed to strategies:

```
maxStudentsPerDay  = capacityRule?.max_students_per_day  ?? preceptor.max_students ?? 1
maxStudentsPerYear = capacityRule?.max_students_per_year ?? 50
currentAssignmentCount = COUNT(all assignments ever) + pending for this preceptor
```

So without a capacity rule a preceptor's Stage 1 `max_students` is the **daily** cap here, but the **yearly** cap in `CapacityChecker` (§5) – the two components disagree (`⚠ F-07`).

---

## 5. Post-hoc validation: `validateAssignments()` and `CapacityChecker`

For every proposed assignment the engine calls `CapacityChecker.checkCapacity(preceptorId, date, { clerkshipId, requirementType })` (`capacity/capacity-checker.ts`):

1. `resolveCapacityRule()` walks the hierarchy preceptor+clerkship+type → preceptor+clerkship → preceptor+type → preceptor → **default `{ maxStudentsPerDay: 2, maxStudentsPerYear: preceptor.max_students || 20 }`**.
2. Daily check: `COUNT(schedule_assignments WHERE preceptor_id = ? AND date = ?)` **from the database only**. Pending assignments of the current run are invisible, so in a dry run this check never fires for the current batch.
3. Yearly check: `COUNT(... WHERE date BETWEEN Jan 1 and Dec 31 of the assignment's year)` ≥ `maxStudentsPerYear` → violation. With the default rule and the Stage 1 default `max_students = 1`, **one** existing assignment in the calendar year blocks every further assignment to that preceptor (`⚠ F-07`, verified: 0 assignments, 5 violations, 0 unmet requirements).
4. Block check only when `blockNumber` is passed (it never is).

Any violation makes the whole batch invalid; the constraint list is then iterated but not evaluated (§3, Phase 3).

---

## 6. Elective scheduling (`scheduleStudentToElective`)

For each `is_required = 1` elective of the clerkship:

1. Build a strategy context with `requiredDays = elective.minimum_days` and `requirementType: 'elective'`.
2. **Replace** `context.availablePreceptors` with the elective's `elective_preceptors` (not the team), each with `availability` = all their `is_available = 1` dates minus the student's pending dates, `maxStudentsPerDay = preceptor.max_students ?? 1`, `maxStudentsPerYear = 50`, `currentAssignmentCount = 0`, `isGlobalFallbackOnly` ignored. Capacity rules and `elective_sites` are ignored.
3. Select the strategy from the **clerkship** config (so an outpatient clerkship schedules its electives with `continuous_single`, not the `daily_rotation` in `global_elective_defaults`).
4. Tag proposals with `electiveId` and `requirementType: 'elective'`, validate as in §5, record unmet requirement as `"<clerkship> - <elective>"`.

Optional electives (`is_required = 0`) are never scheduled, yet their `minimum_days` were subtracted from the clerkship's non-elective days in Phase 2, so the clerkship is under-scheduled and reported complete (`⚠ F-09`, verified: 10 required → 6 generated, no unmet requirement).

---

## 7. Regeneration modes in the route

### 7.1 `preview: true`

`analyzeRegenerationImpact()` (`services/regeneration-service.ts`) reads all assignments in `[startDate, endDate]`, splits them at `regenerateFromDate`, computes per-student "progress" from the past half, and for `minimal-change` classifies future assignments as _preservable_ (preceptor has some availability and is available that day, not a blackout) or _affected_, and for affected ones looks for a replacement preceptor in the legacy context. Returns counts and lists. No writes.

### 7.2 `full-reoptimize` and `minimal-change`

1. `clearAllAssignments(db, regenerateFromDate)` – `DELETE FROM schedule_assignments WHERE locked = 0 AND date >= regenerateFromDate` **for all tenants** (`⚠ F-02`).
2. `prepareRegenerationContext()` – credits past assignments (`date < regenerateFromDate`) against the **legacy** context's `studentRequirements`; for `minimal-change` also calls `identifyAffectedAssignments()` on the future rows – which were just deleted in step 1, so it always finds zero (`⚠ F-12`). `applyMinimalChangeStrategy()` returns a list of assignments to attempt that the route discards.
3. `engine.schedule(allStudentIds, allClerkshipIds, { startDate: regenerateFromDate, endDate, enableTeamFormation, enableFallbacks, dryRun: true })`. The engine knows nothing about the credits from step 2, so it schedules the **full** `required_days` again from the cutoff (`⚠ F-01`, verified: 5 required + 2 past → 7 total).
4. `bulkCreateAssignments()` de-duplicates by `(student, date)`, skips slots already occupied in the DB (this is how locked rows survive), and inserts with `source = 'generated'` but **no `site_id`, no `elective_id`** (`⚠ F-14`).
5. Period resolution and console audit.

In practice `minimal-change` and `full-reoptimize` produce identical schedules; only the reported numbers differ, and the preview for `minimal-change` promises preservation that the apply step does not deliver (verified: preview "preservable 5", apply "preserved 0, deleted 5").

### 7.3 `completion`

1. `prepareCompletionContext()` – loads all assignments in range, credits them to the legacy context, lists students with remaining days. If nobody has gaps, returns early.
2. `engine.schedule(...)` with **no fallbacks** and full `required_days` (credits again ignored). `StrategyContextBuilder` does exclude the student's existing dates, so the engine proposes `required_days` _new_ days on other dates.
3. Filters the engine output to `(student, date, clerkship)` keys not already present, saves the rest. Verified: 5 required + 3 existing → 5 new → 8 total.

---

## 8. The strategies (`strategies/*.strategy.ts`)

All strategies receive `StrategyContext` and return `ProposedAssignment[]` (student, preceptor, clerkship, date, optional `requirementType`, `blockNumber`, `teamId`).

### 8.1 `TeamContinuityStrategy` (default; also `continuous_single`, `continuous_team`, unknown)

1. Fail with `"Insufficient available dates"` if `availableDates.length < requiredDays` (calendar days, not preceptor days).
2. Build an ordered member list: if any team for the clerkship has members among `availablePreceptors`, take the union of **all** teams' members, primary members (not `is_fallback_only`, not `is_global_fallback_only`) sorted by `priority`, then fallback-only members. With no team, fall back to all preceptors sorted by load (never reached in practice because §4.2 already returned no preceptors without a team).
3. For each member in order: skip if `currentAssignmentCount + assignedThisRun ≥ maxStudentsPerYear`; take the member's available dates ∩ `availableDates`, minus dates used so far, that still have daily capacity (`assignmentsByPreceptorDate` count < `maxStudentsPerDay`), sorted; assign as many as needed.
4. If still short, `fillRemainingDays()` scans remaining dates and takes the first load-sorted preceptor with availability and daily/yearly capacity (this ignores the fallback-only ordering).
5. Returns `success: false` **with the partial list** if short; the engine still accepts the partial list. Metadata includes `continuityPercent`.

Not consulted: `healthSystemRule`, team `require_same_*` flags, sites, onboarding.

### 8.2 `BlockBasedStrategy` (`block_based` with `blockSizeDays`)

1. Fail if `availableDates.length < requiredDays` or (partial block needed and `allowPartialBlocks === false`).
2. Blocks are the **first `requiredDays` calendar days** of `availableDates`, cut into `blockSizeDays` chunks. Availability is not considered when choosing dates, so with weekday-only availability and a 5-day block starting on a Sunday the first block is Sun–Thu and no preceptor covers it (`⚠ F-15`, verified: 0 assignments). Blocks never slide.
3. For each block: reuse the previous preceptor if `preferContinuousBlocks` and available for every block day, else the first load-sorted preceptor available for every day. **Daily capacity is not checked** – two students can be placed on the same `max_students = 1` preceptor (`⚠ F-16`).
4. Any block without a preceptor → `success: false` with **no** assignments (all-or-nothing).

### 8.3 `DailyRotationStrategy` (`daily_rotation`)

1. Collect dates on which at least one candidate is available with daily capacity; fail (empty) if fewer than `requiredDays`.
2. Take the first `requiredDays` such dates; on each, prefer a preceptor different from yesterday's, round-robin, tracking local daily counts. All-or-nothing like block-based.

---

## 9. Fallback gap filling (`fallback/gap-filler.ts`, `fallback/preceptor-resolver.ts`)

Runs after Phase 5 for clerkships whose config has `allowFallbacks` (global default: on).

1. Sort unmet requirements by `remainingDays` descending.
2. For each: because the engine passes no primary team, use the **first** team of the clerkship as "primary" and its highest-priority member's health system as the primary health system.
3. `getOrderedFallbackPreceptors()` builds tiers: (1) members of the primary team, (2) members of other teams in the same health system, (3) if `fallbackAllowCrossSystem`, everyone else. Fallback-only flags are ignored here.
4. For each candidate, `getPreceptorAvailableDates()` reads availability in range and, **per date**, calls `CapacityChecker.checkCapacity()` (2–5 queries), `resolveCapacityRule()` (again), and a `COUNT` of that preceptor-day, then adds pending occupancy. Dates already used by the student for _this clerkship_ are skipped – dates used for **another clerkship are not** (`⚠ F-17`: a student can end up with two assignments on one day; the UNIQUE index / `bulkCreateAssignments` de-dup then silently drops one).
5. Assignments are returned with `tier`, `fallbackTeamId`, `originalTeamId`; the engine stores them as `metadata.isFallback` on the proposal, which is dropped at persistence.

`FallbackResolver` (explicit `preceptor_fallbacks` chains) is deprecated, instantiated by the engine, and never called. `TeamValidator` (`team-formation/`) is never referenced anywhere.

---

## 10. What the engine does _not_ consider

Because the constraint list is never evaluated and the strategies only look at availability and capacity, the following configured rules are silently ignored at generation time even though Stage 1 validation flags them afterwards:

- Student onboarding per health system (`student_health_system_onboarding`) – verified: a non-onboarded student is assigned.
- Clerkship allowed sites (`clerkship_sites`) and elective sites – verified.
- Health-system continuity / `health_system_rule`, team `require_same_health_system|site|specialty`.
- Preceptor `is_global_fallback_only` in the fallback phase and in the elective path.
- Site availability and site capacity rules.
- Locked assignments as _credit_ (they survive deletion but their days are scheduled again).
- Per-clerkship overrides (`clerkship_configurations`), elective overrides, `global_elective_defaults`.
- The active schedule: its date range, its entity membership, its owner.

---

## 11. What is persisted and how the rest of the app reads it

Rows written by the route: `student_id, preceptor_id, clerkship_id, date, status='scheduled', source='generated'`, `site_id = NULL`, `elective_id = NULL`, `locked = 0`, `override_codes = '[]'`.

Downstream consumers:

- **Calendar / student / preceptor pages** read `schedule_assignments` joined through `schedule_students`; generated rows for the caller's students appear immediately. Rows created for _other_ tenants' students appear on _their_ calendars.
- **Schedule health** (`validateSchedule()`) re-checks every row against Stage 1 rules; generated rows that violate onboarding or site rules show up there as findings.
- **Auto-Generate → Results** (`/generate/results`) calls `GET /api/schedule/summary` which recomputes completion from the DB. It never receives the engine's `violations`/`unmetRequirements`, and `getScheduleSummaryData()` returns no `violationStats`, so `ViolationStatsCard` and `SuggestionsPanel` never render (`⚠ F-25`). The engine's result JSON is shown only transiently in the dialog's success message.

---

## 12. Data the engine depends on (checklist for test authors)

For a student to receive generated days for a clerkship, **all** of the following must be true:

1. `clerkships.required_days > Σ minimum_days of its electives` (otherwise 0 non-elective days).
2. At least one `preceptor_teams` row with `clerkship_id` = the clerkship and at least one `preceptor_team_members` row.
3. `preceptor_availability` rows with `is_available = 1` for those preceptors on dates inside the requested range. **Availability patterns alone are not enough** – the engine reads only materialised rows, and the demo seed writes only patterns, so the seeded `admin@example.com` gets zero generated assignments today.
4. No blackout on those dates.
5. Daily capacity: `preceptor_capacity_rules` general rule, else `preceptors.max_students`.
6. Yearly capacity in `CapacityChecker`: a capacity rule, else `preceptors.max_students` – so seed a general capacity rule with a realistic `max_students_per_year` or the engine rejects everything after the first assignment of the year.
7. For required electives: `elective_preceptors` rows with availability.
