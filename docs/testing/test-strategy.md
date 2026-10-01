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

### Manual planning (phase-10, planned — Phase 2)

- **MP-1 Build-a-cohort by hand** — one long dialog session hitting every soft code
  (override each), the hard block (refusal), non-clinical kinds, and batch day-modes
  (single/range/individual), asserting the conflict panel + validation after each.
- **MP-2 Edit/reassign/remove under load** — introduce then resolve each soft code
  via edits, asserting re-validation; reassign across sites/preceptors.
- **MP-3 Eligibility narrowing** — drive the dialog's clerkship↔preceptor↔site
  gating through every combination.

## What stays at unit/integration level (deliberately not e2e)

Pure logic keeps fast, localized tests and is **referenced**, not duplicated, in
e2e: `weekKey`/scheduling-kind, distribution redaction, eligibility, the validators,
migration parity, tenant isolation. Converting these to e2e would be slower, flakier
and worse at localizing failures. The e2e suite proves the *wiring and
combinations*; units prove the *logic*.

## Runtime

Mega-journeys amortize the slow web-server boot (one world per journey). `@stage1`
is the fast PR gate; `@stage2 @long` is the full combinatorial matrix (nightly).
