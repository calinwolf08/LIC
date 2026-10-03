# E2E test strategy — flow-based, combinatorial, traceable

This is the living guide for the end-to-end suite. The goal is coverage that
behaves like a thorough product tester: long UI journeys over realistic worlds,
exercising **combinations** of constraints (not one entity at a time), with an
assertion after every action so a failure localizes, and with each journey traced
to the requirements it protects so a requirement change produces a clear,
self-describing failure.

## Principles

1. **Worlds, not entities.** A journey runs against a *world* — a realistic cohort
   (many students; block + scattered + elective clerkships; preceptors with varied
   sessions / capacity / availability; mutual exclusions; blackouts; quarters) built
   by `e2e/worlds/world-builder.ts` from a declarative spec in
   `e2e/worlds/catalog.ts`. No single-student/single-preceptor tests.
2. **Journeys = a tester's session.** One `test` performs a long sequence of real
   UI actions and asserts after each. Combining steps loses nothing (state is
   validated between them) and gains consecutive-action coverage.
3. **Through the real UI.** Worlds are *provisioned* via API for speed, but the
   behavior under test is *driven and asserted through the UI* (the Generate
   dialog, the calendar, the student page), cross-checked against the authoritative
   validator (`/api/schedules/validation`) and the DB.
4. **Happy + unhappy.** The suite covers both; a single journey often does both
   (place a valid day, then the invalid one beside it).
5. **Traceability is a build gate.** Every journey cites the requirements and
   constraints it covers; `npm run coverage:check` fails if any catalogued
   constraint has no covering journey.

## Building blocks (Phase 0)

| Piece | File | Purpose |
|-------|------|---------|
| World builder | `e2e/worlds/world-builder.ts` | `buildWorld(page, db, spec)` → active sandbox + id maps; date helpers (`mondayAtLeast`, `addDays`, `weekdaysBetween`). |
| World catalog | `e2e/worlds/catalog.ts` | Named `WorldSpec`s (`blockScatterWorld`, `onboardingGapWorld`, `completionWorld`, `shortfallWorld`). Add new worlds here so setup is reviewable in one place. |
| Validation reader | `e2e/oracle/validation.ts` | `readValidation`, `countOf`, `hasStudentCode` — the authoritative conflict source behind all three UI surfaces. |
| Predicates | `e2e/oracle/predicates.ts` | Pure, obviously-correct specs of each rule (`weekKey`, `sessionsOverlap`, `inBlockWeek`, …) journeys use to compute expected outcomes. |
| Page objects | `e2e/pages/` | `GeneratePage` (readiness, dialog modes, bypass, results), `HealthPanel` (calendar conflicts/overrides), `StudentSchedulePage` (per-student conflict panel + list + edit), `AssignmentDialog`, `CalendarPage`. |

## Tagging & traceability

Add these annotations in a `// @coverage ...` comment at the top of each spec
(scanned by `e2e/scripts/generate-coverage.ts`):

- `@req(R3.1)` — product requirement(s) the journey protects.
- `@finding(CF-L3)` — review finding / decision it guards.
- `@constraint(block_week_conflict)` — a scheduling rule it genuinely validates.
- `@scenario(AG-1)` — the mega-journey id.

`npm run coverage:map` regenerates `e2e/COVERAGE.md` (requirement→journey,
constraint→journey, scenarios, gaps). `npm run coverage:check` (CI) fails if the
map is stale, if a focused/skipped test slipped in, or **if any constraint in
`e2e/coverage-catalog.ts` has no `@constraint` owner**. When the product gains a new
scheduling rule, add its code to `coverage-catalog.ts`; the build goes red until a
journey annotates it — that is the "requirement shifted, here's where to update"
signal.

## Scenario catalog

### Auto-generation (phase-10, driven through the real Generate dialog)

| ID | World | Proves |
|----|-------|--------|
| AG-1 | `blockScatterWorld(2)` | full-reoptimize places every student's block on its Monday and scatter in the free week (L3) at scale; 0 block_week_conflict/session_clash; calendar health + student panels + results all agree. |
| AG-2 | `onboardingGapWorld` | the dialog's per-constraint **bypass** stamps an accepted override (conflict→override) end to end. |
| AG-3 | `completionWorld` | **completion** mode fills only the missing day, preserves a locked clinical day and a non-clinical free day, never double-books the free day. |
| AG-4 | `shortfallWorld` | an oversubscribed world places within capacity, never over-books, and the results page + validator report the shortfall honestly. |
| AG-5 | `strategyWorld` | the configured assignment strategy drives placement: continuous_single keeps one preceptor across the rotation; daily_rotation spreads the days across preceptors. |
| AG-6 | `blockScatterWorld(1)` × 3 anchors | L3 holds across calendar alignments (guards the date-sensitive class of bug that hid the original L3 defect). |
| AG-7 | `smartWorld` | smart (minimal-change) regeneration preserves past + locked days and generates only the remaining future gap. |

Phase 1 (auto-generation) is complete.

### Manual planning (phase-10, driven through the assignment dialog)

| ID | World | Proves |
|----|-------|--------|
| MP-1 | `manualWorld` | a hand build across batch modes (range with weekday filter, individual days), non-clinical day-types (free day + exam), and an overridden session clash — validation clean after each legit batch, one conflict only where deliberately created. |
| MP-2 | `mutualExclusionWorld` | edit / reassign / remove: introduce an L2 mutual-exclusion conflict (AM+PM, no session clash), resolve it by removing a day, reassign a day across preceptors, and remove it — conflict surfaces track every change. |
| MP-3 | `eligibilityWorld` | the dialog's clerkship↔preceptor↔site eligibility annotations disable impossible combinations (with reasons) as the coordinator picks. |
| MP-4 | `planWorld` | the manual **Planner** (L4): build a multi-student draft, override a staged soft conflict (session_clash) so it becomes committable, leave another (mutual_exclusion) unresolved, commit in one action — the committable pins persist (overrides recorded), the unresolved one is skipped and stays in the draft, and the committed-schedule validator matches what actually committed. |
| MP-5 | `manualWorld` | planner build modes & non-clinical (happy path): Add-button gating, the past-date floor on the date field, **range** mode with weekday chips toggled off, **individual** adds, **AM+PM half-days** on one date staying clean, **free day / exam** pins hiding the clinical pickers and rendering distinctly, removing a pin, then a clean one-button commit that leaves a conflict-free schedule. |
| MP-6 | `plannerConflictWorld` | planner conflict matrix (unhappy path): one plan trips **every** conflict the dry-run surfaces — not_onboarded, preceptor_unavailable, site_not_allowed, preceptor_capacity, block_week_conflict, blackout_date — each shown in the panel and marking its pin "to resolve". The coordinator accepts the overrides, resets one and removes another, then commits: the committable pins persist (overrides recorded), the reset pin is skipped and kept, and the committed-schedule validator shows only what actually committed. |

Phase 2 (manual planning) is complete. MP-4–6 cover the Planner (L4): a draft pin
layer (`schedule_plan_pins`) whose dry-run reuses the same `evaluateAssignments`
as commit, every add-form affordance, every surfaceable conflict with its override,
and a batch commit through the same validator as manual create.

**Dry-run vs commit — create-time codes (preview parity).** The whole-schedule
evaluator (`evaluateAssignments`) deliberately omits the *create-time* codes
(`past_date`, `over_required_days`) so the dashboard/calendar health isn't flooded
with "already happened" / finished-rotation noise. The planner, however, must preview
exactly what commit will do, so `evaluatePlan` recomputes those two codes for the
draft (over committed rows + pins in order, counting core non-elective days as commit
does) and folds them into the per-pin status and the conflict panel. A pin past the
requirement or in the past therefore reads "to resolve" (and its soft override works)
rather than a falsely-green "OK", and the Commit button's count matches what will
persist. `past_date` is additionally prevented up front by the date field's today
floor. Proven by `plan-service` unit tests and the `CF-PLAN-PARITY` journey.

## Two-tier structure & consolidation (Phase 3)

The suite is deliberately two tiers:

1. **Mega-journeys (`phase-10/`)** own the *combinatorial* coverage — realistic
   cohorts, several constraints and actions in one flow, every surface cross-checked.
   They are the primary coverage for auto-generation (AG-1…AG-7) and manual planning
   (MP-1…MP-3).
2. **Focused specs (`phase-9/` and the phased journeys)** each guard exactly *one*
   engine guarantee or UI entry point that the mega-journeys deliberately do not
   exercise. They stay because deleting them would lose real coverage, not because
   they are redundant.

Phase 3 removed the specs that the mega-journeys genuinely subsume (same behavior,
same UI path, equal-or-stronger assertions). The ledger below is the record so a
later reviewer can see *why* something was removed and *where* its coverage now
lives — if a mega-journey that absorbed a case is ever weakened, this table says
what it must keep proving.

| Retired / slimmed | What it proved | Now owned by |
|-------------------|----------------|--------------|
| `phase-9/multi-student-generation.spec.ts` (retired) | multi-student full gen with 0 false conflicts; capacity/availability shortfall places what it can and reports unmet | **AG-1** (multi-student, exact placements, 0 conflicts, through the real dialog) + **AG-4** (shortfall within capacity, honest unmet on the results page) |
| `phase-9/generate-ui.spec.ts` (retired) | the real Generate **button** runs the engine; full-mode L3 through the UI | **AG-1…AG-7** all click the real Apply button; **AG-1/AG-6** prove L3 through it; full-mode clear/replace semantics are **J5.2** (`phase-5/regenerate`) |
| `phase-9/autogen-constraints.spec.ts` (slimmed 5→2) | L2 auto-avoid; L3 auto-avoid; M2/M3 no-clinical-on-free-day; full-reoptimize preserves non-clinical | L3 → **AG-1**; M2/M3 (completion) → **AG-3**. **Kept** here: L2 auto-avoidance (no AG world has a mutual-exclusion rule) and full-reoptimize-preserves-non-clinical (AG-3 only proves *completion* mode) |

Focused specs intentionally **kept** because no mega-journey reproduces them:
`autogen-sessions` / `availability-session` / `day-overbook` (AM+PM half-day packing
and the "two half-days on one date is clean" guarantee), `block-vs-scattered` and
`edit-revalidation` (the *manual* dialog warn→override→panel path for
block_week_conflict, and L3-via-edit), `mutual-exclusion` (setting the rule through
the preceptor-page **rule editor** UI), `generation-settings-ui` (the global-defaults
**form**, not an API strategy override). None of these carry `@constraint`
annotations, so the 14/14 constraint gate is unaffected by the retirements.

## What stays at unit/integration level (deliberately not e2e)

Pure logic keeps fast, localized tests and is **referenced**, not duplicated, in
e2e: `weekKey`/scheduling-kind, distribution redaction, eligibility, the validators,
migration parity, tenant isolation. Converting these to e2e would be slower, flakier
and worse at localizing failures. The e2e suite proves the *wiring and
combinations*; units prove the *logic*.

## Runtime

Mega-journeys amortize the slow web-server boot (one world per journey). `@stage1`
is the fast PR gate; `@stage2 @long` is the full combinatorial matrix (nightly).
