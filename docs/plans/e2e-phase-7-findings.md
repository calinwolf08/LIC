# E2E Phase 7 — findings

Findings from the Phase 7 journeys (cross-area combinations and long arcs). These
run on a hand-built "semester" world (`e2e/journeys/phase-7/helpers.ts`,
`semesterWorld`): 2 health systems, 3 sites, 3 clerkships (one carrying an
optional elective), 4 preceptors (one deliberately left without materialised
availability), and 5 students (one un-onboarded at the second health system).

## Product bugs (fixed this phase, with regression coverage)

### P7-a — `over_required_days` counted elective days toward the clerkship budget _(fixed)_

The create- and edit-time soft check `over_required_days` counted **every**
assignment for a `(student, clerkship)` pair — elective-tagged days included —
against the clerkship's `required_days`. So a student whose clerkship required
days were already fully scheduled tripped `over_required_days` the moment a
legitimate **optional elective** day was added on that clerkship, and (since the
manual-create path rejects unaccepted soft codes) the create was refused unless
the user explicitly overrode a warning that should never have fired.

This contradicted the rest of the system, which treats elective days as a
separate requirement: the generation credit path (`computeCredit` in
`/api/schedules/generate`) already splits rows by `elective_id`, crediting
elective days to the elective and only non-elective days to the clerkship's core
requirement.

**Fix.** `AssignmentCandidate` gained an `elective_id` field, threaded through
every candidate the validator sees (manual create, bulk create, the checked edit
path, and the dialog dry-run previews). In `validateAssignmentCandidate` the
`over_required_days` check now:

- skips entirely when the candidate itself carries an `elective_id` (an elective
  day belongs to the elective's own minimum, which has no maximum to exceed); and
- counts only **core** existing rows (`elective_id IS NULL`) toward the
  clerkship's `required_days`.

A genuine over-scheduling of the clerkship's core days still trips the warning.
Regression tests in `assignment-validation.test.ts` (`over_required_days vs
electives (P7-a)`): an elective day never trips it even with the core days full,
and existing elective days don't inflate the core count. Exercised end-to-end in
J7.1, where student 1's hand-built schedule includes both a `over_required_days`
override day and an optional elective day.

## Decisions / reconciliations

### D7-1 — an un-onboarded student is placed-but-flagged, not left unmet

The plan's J7.1 narrative expects the un-onboarded student (S5 at health system B)
to come back **unmet** after a Full run. The engine's actual, already-tested
behaviour (J5.3) is to **place** the day and **surface** the `not_onboarded` soft
violation rather than leave the requirement unmet; a run that _bypasses_
`not_onboarded` converts the surfaced flag into a stamped override code (P5-c).
J7.1 asserts that real behaviour: after the first Full run S5's health-system-B
days exist but carry no accepted code and the schedule-health surface counts
`not_onboarded`; after a bypass run the same days carry the `not_onboarded`
override code; completing S5's onboarding and re-running clears it to zero. No
code change — this records the spec reconciliation.

## Journeys

- **J7.1 — A semester, two tiers** (`semester.spec.ts`, `@long`). A fresh basic
  account registers, builds the whole semester world, hand-schedules student 1
  fully (clean days + one `over_required_days` override + an optional elective
  day), exports as a Stage 1 user (every row `manual`). Then it is granted
  `autogen`: readiness names the un-materialised preceptor (P4, the availability
  item is not done with a count), P4 is materialised, student 1's hand rows are
  locked. A Full run leaves student 1's locked rows untouched **by id** and
  generates students 2–5; S5's health-system-B days are placed-but-flagged
  `not_onboarded` (D7-1). A bypass run stamps the code (P5-c) and the health panel
  counts it alongside student 1's manual override. Onboarding S5 and re-running
  clears `not_onboarded`; two generated days are hand-edited (`source` stays
  `generated`); Completion loses nothing. Finally the entitlement is revoked:
  Stage 1 edits still work, the lock toggle is inert, `/generate` is 403, and the
  export carries both `manual` and `generated` sources with the manual override
  code intact.
- **J7.1 (smoke)** (`smoke.spec.ts`, `@smoke`). The trimmed
  register → build → hand-schedule → lock → Full → export slice, asserting manual
  rows survive and both sources reach the export.
- **J7.6 — Volume smoke** (`volume.spec.ts`, `@long`). 60 students × 6 clerkships
  × 12 preceptors seeded via API + materialised rows. A Full run completes within
  the route timeout and places all 360 days; the calendar renders the populated
  month and applies a student filter without hanging (timings logged, generous
  tripwire bounds asserted); the export streams; the dashboard's student-status
  partition covers the whole roster (all 60 fully scheduled). A regression
  tripwire, not a benchmark.

## Harness notes

- The schedule-health panel loads its override chips asynchronously after
  navigation, and the empty-state ("No overrides") can render for a beat before
  the fetch resolves. Reading `overrideCounts()` once immediately after
  `calendar.goto()` therefore races the fetch; J7.1 polls the derived count with
  `expect.poll` instead. No product change — a test-side robustness fix.

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — full unit/integration suite green (1724 tests; +2 for P7-a).
- Phase-7 journeys (`e2e/journeys/phase-7/`) green: J7.1, J7.1-smoke, J7.6.

## Not yet covered (later pass)

J7.2 (shared entities across schedules), J7.3 (time boundaries), J7.4
(dependency-deletion chain) and J7.5 (two tabs, one schedule) are specified in the
plan but not yet implemented.
