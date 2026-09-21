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

### D7-2 — deleting a schedule is not dependency-blocked (it cascades)

Unlike the entity deletes in J7.4 (site, health system, preceptor, clerkship,
elective, student), deleting a _schedule_ is not refused when it still holds
assignments: it cascades its own assignments and schedule-entity junctions
(established by J1.2 and finding P3-g, so those rows never orphan the global
UNIQUE(student, date) slot). J7.4 therefore treats the schedule delete as the
final cleanup step, not a blocked delete. (The `scheduling_periods.is_active`
column carries a separate "cannot delete the active period" guard, but that flag
is distinct from the user's active-schedule _pointer_, which the sandbox uses;
deleting the user's active schedule is allowed and simply clears the pointer.)

### D7-3 — preceptor daily capacity is GLOBAL across schedules

A preceptor's per-day capacity is enforced across every schedule, not per
schedule: the create/edit validator counts a preceptor's assignments on a
calendar date without scoping to a schedule (mirroring the global
UNIQUE(student, date) rule for students). So a preceptor booked to capacity on
day D in schedule A is over capacity for day D in schedule B. J7.2 asserts this.
No code change — this records the (correct, intended) behaviour as the answer to
the plan's "per schedule or global?" question.

### D7-4 — shared-location ripple asserted via clerkship-eligibility, not a hard site delete

The plan's J7.2 says "delete P's site". A site shared by two schedules is
dependency-blocked from hard deletion (J7.4), so the assertable cross-schedule
ripple is a change to the shared site's _clerkship eligibility_: re-pointing the
clerkship↔site link surfaces `site_not_allowed` in both schedules' validation.
J7.2 asserts that. No code change.

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
- **J7.2 — Shared entities across schedules** (`shared-entities.spec.ts`,
  `@long`). Two overlapping schedules (A, B) share a student, preceptor, site and
  clerkship. Preceptor capacity is global (D7-3): a preceptor booked to capacity
  on day D in A is over capacity for D in B. The SharedEntityWarning on the shared
  student's Details tab names both schedules. A change to the shared site's
  clerkship eligibility ripples `site_not_allowed` into both schedules' validation
  (D7-4). Deleting schedule A leaves B's assignment and the shared entities intact.
- **J7.3 — Time boundaries** (`time-boundaries.spec.ts`, `@long`). A schedule
  straddling today: past assignments are credited (a student whose only days are
  in the past reads as complete); creating on a past day surfaces `past_date`;
  a Smart (minimal-change) and a Full regenerate both preserve past rows (locked
  or not); moving a future row back into the past trips `past_date` and needs an
  explicit override; the calendar marks today (`ring-primary`) correctly with the
  grid spanning the month boundary.
- **J7.4 — Dependency-deletion chain** (`dependency-chain.spec.ts`, `@long`).
  A full graph (HS → site → preceptor / clerkship → elective → student, wired and
  carrying assignments): every entity delete is refused while dependents exist
  (site/preceptor/clerkship/student → 409; health-system/elective → 400), then the
  blocks resolve bottom-up (assignments → elective → leaf entities → site → HS →
  schedule) and each delete succeeds; afterwards no orphan rows remain in any
  junction or child table. The locations UI slice is already covered by J2.1;
  this asserts the full API block-status contract and DB-level cleanup.
- **J7.5 — Two tabs, one schedule** (`two-tabs.spec.ts`, `@long`). Two pages on
  one session/active schedule: tab 2 books a student/day first, tab 1's stale
  submit is hard-blocked (`student_double_booked`) with no duplicate row, tab 2
  deletes it and tab 1's retry succeeds; then tab 2 runs a Full generation and,
  after a refresh, tab 1 shows the generated rows with a health pill equal to the
  validation API's total.

## Harness notes

- The schedule-health panel loads its override chips asynchronously after
  navigation, and the empty-state ("No overrides") can render for a beat before
  the fetch resolves. Reading `overrideCounts()` once immediately after
  `calendar.goto()` therefore races the fetch; J7.1 polls the derived count with
  `expect.poll` instead. No product change — a test-side robustness fix.

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — full unit/integration suite green (1724 tests; +2 for P7-a).
- Phase-7 journeys (`e2e/journeys/phase-7/`) green: J7.1, J7.1-smoke, J7.2, J7.3,
  J7.4, J7.5, J7.6 (7 tests).

## Coverage

All Phase 7 journeys from the plan are now implemented: J7.1 (+ smoke), J7.2,
J7.3, J7.4, J7.5, J7.6.
