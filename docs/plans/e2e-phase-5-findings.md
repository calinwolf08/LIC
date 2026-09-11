# E2E Phase 5 — findings

Findings from the Phase 5 auto-generation journeys (first full run, regenerate
modes vs human edits, bypass/override parity, results & diagnostics). All run as
the seeded entitled admin against a throwaway, generation-ready sandbox stood up
by `e2e/journeys/phase-5/helpers.ts` (`generationSandbox`): a clerkship with
required days, a preceptor bound to a health system with materialised
availability at an allowed site, and onboarded (or deliberately un-onboarded)
students.

## Product bugs (fixed this phase, with regression coverage)

### P5-a — Calendar chips lost provenance (source / locked / elective) _(fixed)_

The calendar page's assignment→grid mapping (`CalendarDayAssignment` in
`/calendar/+page.svelte`) copied only identity + colour and dropped `source`,
`locked` and `electiveName`. The grid renders `assignment.source ?? 'manual'`,
so every chip — including auto-generated and locked days — showed as manual: no
Auto marker, no lock, no elective, even though the DB and export carried the
truth. **Fix:** pass `source`, `locked` and `electiveName` through the mapping
(the `CalendarDayAssignment` type already declared them). Asserted in J5.1 (the
calendar shows `data-source="generated"` chips after a Full run).

### P5-b — Bypass constraint codes were unvalidated _(fixed)_

`generateScheduleSchema.bypassedConstraints` was `z.array(z.string())`, so a
run could pass an unknown code (a typo) or a **hard** code
(`student_double_booked`) and have it silently accepted — a caller could appear
to "bypass" a hard block. **Fix:** constrain each entry with `isOverrideCode`,
the canonical overridable (soft) vocabulary, so an unknown or hard code is a
400. Asserted in J5.3.

### P5-c — Generated override codes were dropped before persistence _(fixed)_

The engine's `ProposalValidator` stamps each accepted proposal with the soft
codes it bypassed (`overrideCodes`, F-11), and `insertGeneratedAssignments`
persists them — but the generate endpoint's `toGeneratedRows` mapped proposals
to the persistence input **without** `overrideCodes`, so every generated day was
stored with `override_codes=[]`. A bypassed auto day was therefore invisible in
the schedule-health override list and left no audit trail. **Fix:** carry
`overrideCodes` through `toGeneratedRows`. Asserted in J5.3 (a run bypassing
`not_onboarded` now stores the code and the health panel counts the overrides).

## Decisions / spec reconciliations recorded

### D5-1 — Generation surfaces soft violations by default; bypass makes them overrides

The plan framed J5.3 as "un-onboarded student → **unmet** → bypass to schedule."
The implementation (F-05) instead **places** the day and *surfaces* the soft
violation: without a bypass the row carries no override code and the violation
shows in the health "conflicts by type"; with the code in `bypassedConstraints`
the same day is placed as an accepted **override** (stamped, shown in the
override list). J5.3 asserts this real behaviour rather than an unmet-then-bypass
flow. The manual and generated override vocabularies match, which is the parity
the journey exists to prove.

## Testability notes

- **Generate dialog apply over API.** J5.1 opens the Generate dialog (the UI
  entry point) but applies the run over the same session's API: the modal's
  custom full-screen overlay never satisfies Playwright's actionability
  ("visible, enabled and stable") for its Apply button. The results page,
  calendar and DB assertions cover the outcome. Worth revisiting the dialog's
  overlay/stability if the modal is exercised directly later.

## Not yet covered (carried forward)

J5.4 (fallbacks & approval), J5.5 (configuration → behaviour: rotation/block
sizes, global vs per-clerkship), and J5.6 (teams management) are not yet
written. The generation-sandbox helper and the fixes above (provenance markers,
override persistence, bypass validation) are the foundation they build on;
these three are the remaining Phase 5 work.

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — full unit/integration suite green (1722 tests).
- Phase-5 journeys (`e2e/journeys/phase-5/`) green: J5.1 first full run, J5.2
  regenerate modes, J5.3 bypass parity, J5.7 results & diagnostics.
