# LIC — Client-Feedback Implementation Plan (sequenced, test-first)

**Date:** 2026-09-21
**Companion:** [`client-feedback-roadmap.md`](./client-feedback-roadmap.md) (item
IDs `A1`…`N1` are used verbatim here).
**Status:** Proposed. Phases are ordered by value + dependency; each is
independently shippable and independently green.

---

## 0. How to read this plan

Every phase lists four things:

1. **Scope** — the roadmap item IDs it delivers.
2. **Backend / data** — migrations, services, API routes.
3. **UI** — pages/components.
4. **Tests** — the part that matters most, split into **Unit/Integration**,
   **E2E journeys**, and **Edge cases**. E2E is the primary gate: _every scenario
   the client actually hit is reproduced as a Playwright journey that drives the
   real UI end to end_, not a backend or API-only assertion.

### Testing philosophy (non-negotiable)

- **The user's path is the test.** For each client-hit scenario there is a
  Playwright journey that navigates the real pages, clicks the real controls,
  and asserts on what the user would see — using the existing page objects
  (`AssignmentDialog`, `CalendarPage`, `HealthPanel`, `EntityTabs`,
  `ConfirmDialog`, `expectToast`) under `e2e/pages/`. New UI gets new page-object
  methods so specs stay declarative.
- **Reproduce the bug first.** For every `BUG` item, the journey is written (and
  committed) so it **fails on `main`** against today's behavior, then passes
  after the fix. This is why several journeys below explicitly assert the
  _corrected_ behavior that the current suite silently tolerates (e.g. the
  schedule-lifecycle spec masks **B1** today by manually re-activating — Phase 1
  removes that mask).
- **Traceability.** Each journey carries `// @coverage @finding(CF-<id>)`
  (new namespace for client feedback, e.g. `CF-B1`) plus the relevant `@req(...)`,
  so `npm run coverage:map` / `coverage:check` proves every item has a journey.
  Add the `CF-*` items to `e2e/COVERAGE.md`'s generator input.
- **Both tiers.** Any item on the Basic↔Gated line runs its journey for
  `asFreshUser` (Basic) **and** `asFreshEntitledUser` (entitled), asserting the
  Basic user sees the data/warning and the entitled user additionally sees the
  automation. Gating regressions are caught here and in the Phase‑6 gating specs.
- **Backend truth is asserted too, but never _instead_.** Where a bug is a data
  corruption (I1) or a silent no-op (H1, B1), the journey asserts both the UI
  state _and_ the persisted state via `apiOf(page)` so we prove the fix at both
  layers.
- **Edge cases are mandatory, not optional.** Each phase enumerates the boundary
  inputs that would expose a _new_ gap (empty selections, weekend-only patterns,
  single-member teams, credit sums crossing a requirement boundary, DST/date-line
  at month edges, tenant isolation). These frequently surface the "additional
  gaps in the process" the client's testing implied.

### Definition of Done (every phase)

- `npm run lint` · `npm run check` · `npm run test:unit -- --run` ·
  `npm run build` green.
- New/updated Playwright journeys green via `npm run test:e2e:journeys`; `@smoke`
  subset still green; **zero retries** (a flake is a bug — repo rule).
- `npm run coverage:map` regenerated; `coverage:check` passes with every `CF-*`
  item in this phase mapped to at least one journey.
- Each client-hit scenario in the phase demonstrably **fails before / passes
  after** (attach the before-failure in the PR description).
- No `alert()`/`confirm()`; errors in-context; unsaved-changes guard on new
  multi-field forms (repo UX conventions R10.x).

### Data / fixtures prep (shared, do once up front)

- Extend the seed / sandbox fixtures (`e2e/fixtures/`, `scripts/seed/`) with the
  scenarios the client exercised: multiple health systems **sharing a name**
  ("Kaiser" ×2) for C3; a preceptor **with no availability** and one with a
  **weekday-only pattern** for H1/I1/I2; a **single-preceptor** team candidate for
  G1; two clerkships whose preceptors **overlap on one weekday** for L1/L2; a
  student with an **inpatient block** overlapping outpatient weeks for L3.
- Add page-object methods as each phase needs them (listed per phase). Keep the
  fresh-account pattern so the seeded Demo Schedule is never disturbed.

---

## Phase 1 — P0 stabilization (the six bugs)

**Why first:** these are trust-breakers; B1 alone caused the B2/B3/"wrong dates"
cluster. Small, high-leverage, mostly isolated.

**Scope:** A1, B1, C1, G1, H1, I1.

**Backend / data**

- **B1** — wizard create path: activate the new schedule on finish (or make
  "create + activate" an explicit, defaulted choice). Fix
  `new-schedule-wizard.svelte` create branch (`is_active` + call
  `/api/scheduling-periods/[id]/activate`), and confirm `refreshSchedules()`
  reflects the new active id before `goto('/calendar')`.
- **G1** — `team-validator.ts` health-system check: a team of one (or members
  lacking a health-system association) must pass; `requireSameHealthSystem`
  becomes a soft, overrideable guide, not a hard block (feeds Phase 3).
- **H1** — availability pattern expansion: when a weekly pattern intersected with
  the chosen date range yields **zero** dates, return a warning instead of a
  silent success; surface it in the UI.
- **I1** — preceptor capacity/availability aggregation: count out-of-availability
  assigned days correctly (no negative/NaN math); persist an explicit override
  code on such assignments; expose an "assigned outside availability" flag on the
  preceptor detail payload.
- **A1** — sign-up hand-off: validate email format before switching forms.
- **C1** — schedule create: end-before-start returns an inline field error.

**UI**

- B1: post-wizard the calendar shows the **new** name + date range; the schedule
  switcher shows the new schedule as active.
- I1: preceptor detail shows an "assigned outside availability" badge/row; the
  assignment dialog requires an explicit override (soft code) rather than
  offering no dates or breaking silently (pairs with I2 copy in Phase 2).
- A1/C1/H1: inline errors/toasts.

**Tests**

- **Unit/Integration**
  - `team-validator` unit: 1 member → valid; members same/different HS →
    valid + warning flag (not error). `preceptor-availability` expansion unit:
    weekday pattern × weekend-only range → `{ added: 0, warning }`.
  - Capacity aggregation unit (extend `capacity-side-effects` service tests):
    assignment outside availability contributes to load without corrupting
    totals; math stable at 0 and at over-capacity.
  - `auth.signup` test extends for invalid-email rejection at the hand-off.
- **E2E journeys** (new `e2e/journeys/phase-9/` for client-feedback; tag
  `@stage1`, add `@finding` annotations)
  - `CF-B1` **wizard-activates-schedule.spec.ts** — fresh user runs the wizard
    with a distinct name + date range, **does not** manually re-activate, then
    asserts: `/api/user/active-schedule` returns the new name; `/calendar` header
    shows the new range; `/dashboard` "finish setting up" no longer says "name
    your schedule"; entity lists are scoped to the new schedule (old default's
    entities absent). _Also update `phase-1/schedule-lifecycle.spec.ts` to drop
    the manual `activate()` mask and rely on wizard activation._
  - `CF-A1` **signup-invalid-email.spec.ts** — type an invalid email in sign-in,
    click "Sign up", assert an inline validation error and that no account/nav
    happened.
  - `CF-C1` **schedule-end-before-start.spec.ts** — assert the inline error
    appears at the Details step (stronger than today's "must not navigate" check).
  - `CF-G1` **team-single-member.spec.ts** — create a one-member team with the
    same-HS guide on; assert it **creates** (with an optional warning), not an
    error. (Full team UX is Phase 3.)
  - `CF-H1` **availability-empty-pattern.spec.ts** — add a Wed/Thu/Fri pattern
    over a Sun–Sun range that contains no matching weekday; assert a visible
    "0 dates — this pattern doesn't match the range" warning and that nothing was
    silently saved (verify via `/api/preceptors/[id]/availability`).
  - `CF-I1` **assign-outside-availability.spec.ts** — from the student schedule,
    assign a preceptor on a day outside their availability; assert the dialog
    **requires an override** (soft warning + accept), the assignment persists,
    the preceptor detail shows the "outside availability" flag, and the
    capacity/availability numbers on the preceptor page are correct (no NaN,
    counts match).
- **Edge cases**
  - B1: duplicate-from-existing path also activates; deleting the just-created
    active schedule still lands on the documented "no active schedule" state.
  - H1: pattern that matches _some_ but not all weeks; single matching day.
  - I1: two out-of-availability assignments same preceptor different days →
    capacity math still correct; then move one back into availability → flag
    clears.
  - G1: zero-member submit still blocked (min 1); tenant isolation — can't add a
    preceptor from another user to the team.

---

## Phase 2 — Cross-cutting clarity (copy, context, wizard comprehension)

**Why second:** cheap, no data-model risk, and dissolves the largest bucket of
"unclear" notes. N1 is the anchor.

**Scope:** N1, B2, B3, B4, C2, C3, C4, C5, D1, D2, E1, F1, F2, H2, H3, H4, H5, I2, I4.

**Backend / data**

- D2: drop/relocate health-system location field (migration + form).
- F1: phone-type enum on preceptor contact. F2: clarify `max_students` ownership
  (rename to `preceptor_max_students` if it's the preceptor's, or move to site);
  document the decision in the migration.
- E1: optional `official_course_name` alongside display `name` (or help text
  only — decide in build; either way no behavior change).

**UI**

- **N1**: shared `PageContextHeader` ("You are viewing **{EntityType}: {Name}**")
  on every entity detail page; every metric tile labeled with its subject
  ("Capacity — this preceptor", "Requirement — this student"). Wire into
  preceptor/student/clerkship/site/health-system/team detail pages.
- Wizard: step reorder / skippable HS step (C2); disambiguating columns
  (HS + location) in entity tables (C3); auto-select newly-created entity (C4);
  relabel selection to "Include in this schedule" + helper text + a running
  "N selected" summary (C5).
- Onboarding: dashboard checklist reconciled with the active schedule (B3);
  copy distinguishing "finish your current schedule" vs. "create another" (B2);
  an "Edit entities anytime" entry point after the wizard (B4).
- Availability copy overhaul (H2–H5): rename "pattern" → type (Weekly/Monthly);
  replace "available/unavailable/open slots/save X dates" with plain language;
  explain that a weekly type is a rule applied to a chosen date range.
- I2: assigning a no-availability preceptor explains why and offers the override
  (built on Phase 1's I1 path). I4: student schedule header names the student.

**Tests**

- **Unit/Integration** — form schema tests for the new/renamed fields (phone
  type enum, HS without location, clerkship official name). Dashboard-checklist
  service test: reflects the _active_ schedule's setup state.
- **E2E journeys** (extend Phase‑2/‑4 specs + new client-feedback specs)
  - `CF-N1` **page-context-and-metric-labels.spec.ts** — visit preceptor,
    student, clerkship, site detail; assert the context header names the entity
    and each metric tile carries its subject label. (Directly answers "not sure
    if capacity applies to student or what.")
  - `CF-wizard-clarity` **wizard-comprehension.spec.ts** — create a HS, assert
    it's **auto-selected** (C4); table shows HS/location columns so two "Kaiser"
    rows are distinguishable (C3); the selection control reads "Include in this
    schedule" and a live count updates (C5); the HS step can be skipped (C2).
  - `CF-onboarding` **dashboard-finish-setup.spec.ts** — after Phase‑1 wizard
    activation, the dashboard checklist no longer claims the schedule is unnamed
    and reflects the active schedule (B3); the "create new vs. finish current"
    copy is present (B2); an edit-entities entry point exists (B4).
  - `CF-availability-copy` **availability-copy.spec.ts** — the editor shows the
    reworded labels, no literal "pattern" as the primary noun, and inline help
    that a weekly type still needs a date range (H2–H5). Pairs with `CF-H1`.
  - Extend `phase-2/drill-through-and-lists.spec.ts` for I4 (student schedule
    names its student) and D1/D2 (HS detail has no location field; hierarchy
    explainer visible).
- **Edge cases** — HS with no sites still renders the explainer; preceptor with
  no phone type defaults gracefully; migration back-compat for existing
  `max_students` values; two identically-named sites remain distinguishable in
  the assignment dialog's site picker (`AssignmentDialog.optionLabels('site')`).

---

## Phase 3 — Teams as coverage groups (+ core preceptors)

**Why third:** the client walked into Teams in Basic; make the concept correct
and legible. Depends on Phase 1's G1 fix.

**Scope:** G2, G3, G4, F5.

**Backend / data**

- Team model: membership-first. Remove the hard same-HS block (done in P1);
  compute **serveable clerkships = intersection of members' clerkship
  eligibility**; expose that list on the team payload. Emit an **overlap
  warning** when members' eligibilities don't intersect (family-medicine +
  surgery), storable as an accepted override on the team.
- F5: `student.core_preceptor_ids` (and/or core team). Validation soft code
  `outside_core_preceptor` in the shared vocabulary (R7.4) — a **warning**, not a
  block; accepted codes stored on the assignment row.
- Team↔clerkship: teams are always selectable in the assignment dialog; a team
  that can't serve the chosen clerkship shows disabled-with-reason, not hidden.

**UI**

- Team detail: "what is a team" explainer (coverage group), members with roles,
  **inferred serveable-clerkships list**, overlap warning + override control;
  "Admin" relabeled to the actual user.
- Student detail: set core preceptor(s)/team. Assignment dialog: soft warning
  when assigning outside a student's core preceptor/team, with accept.

**Tests**

- **Unit/Integration** — team service: serveable-clerkship inference across
  member sets; overlap-warning trigger + override persistence. Validator: new
  `outside_core_preceptor` soft code behaves like other soft codes across create/
  reassign/change-date/swap (parity with `phase-3/soft-codes`).
- **E2E journeys**
  - `CF-G2/3/4` **teams-coverage-group.spec.ts** — create a coverage-group team;
    assert the explainer text; add two members with **non-overlapping**
    specialties → overlap warning; override → team saves; the team's serveable
    clerkships list matches the members' intersection; in the assignment dialog
    the team is **visible** for a non-served clerkship but disabled-with-reason
    (never silently absent — directly fixes "added team but couldn't select it").
  - `CF-F5` **core-preceptor-restriction.spec.ts** — set a student's core
    preceptor; assign that preceptor → clean; assign a **different** preceptor →
    soft warning `outside_core_preceptor`, accept to proceed; the accepted
    override appears in the schedule‑health panel (`HealthPanel.overrideCounts`).
    Runs for Basic (warning only) and entitled (same warning; automation is Gated
    and out of scope here).
- **Edge cases** — one-member team's serveable list = that member's eligibility;
  removing the last overlapping member re-triggers the warning; a core preceptor
  later removed from the schedule surfaces cleanly on the student page; tenant
  isolation on team membership and core-preceptor selection.

---

## Phase 4 — Availability depth (calendar, notes, preference, block-first)

**Scope:** H6, H8 (Basic surface), H7.

**Backend / data**

- H8: `preceptor_availability.preference` enum (`preferred` | `in_a_pinch`) —
  Basic stores + displays; the auto-gen weighting is a Gated consumer (assert it
  stays gated).
- H7: allow an **unassigned/placeholder assignment block** (no preceptor yet) that
  knows date + health system/site; a later step assigns the preceptor. Reuses the
  assignment row with a nullable preceptor + a `placeholder` status; validator
  treats it as not-yet-schedulable, not a violation.
- H6: availability read model for a full-calendar view + `notes` field.

**UI** — availability calendar visualization (month grid of resulting available
days, colored by preference); notes field; placeholder-block creation from the
calendar and a "fill placeholder" flow.

**Tests**

- **Unit/Integration** — preference persists + surfaces in the availability read
  model; entitled generation weights `preferred` over `in_a_pinch` while Basic
  ignores weighting (guard both). Placeholder block: validator returns
  "needs preceptor", not a soft/hard violation; converting a placeholder to a
  real assignment runs the full validator.
- **E2E journeys**
  - `CF-H6` **availability-calendar.spec.ts** — configure availability, open the
    calendar view, assert the resulting days render and match the pattern; add a
    note and re-read it.
  - `CF-H8` **availability-preference.spec.ts** — tag days preferred vs.
    in-a-pinch; assert the visual distinction (Basic). Entitled variant asserts
    the generator prefers the preferred days; Basic variant asserts no
    auto-behavior leaks in.
  - `CF-H7` **block-first-placeholder.spec.ts** — create a placeholder block for a
    date + site with no preceptor; assert it shows as "needs preceptor" (not a
    red violation); later assign a preceptor and assert it becomes a normal
    assignment and passes validation.
- **Edge cases** — preference on a day with no availability row; placeholder on a
  blackout date (warn, not corrupt); placeholder left unfilled at export time
  (appears clearly, doesn't count toward requirements).

---

## Phase 5 — Requirement math: credit value, missed days, standalone electives

**Why here:** touches the completion engine — highest correctness risk, so it
gets the deepest validation. Directly serves the Basic client's day-counting.

**Scope:** M1 (+ F4), E2, E3.

**Backend / data**

- M1/F4: `assignment.credit_value` (default 1.0; e.g. 0.5, or >1 for long days),
  editable per assignment; requirement tracking sums **credit**, not row count.
  Completed/scheduled/unscheduled all become credit sums (floor 0).
- E2: `clerkship.min_required_days` (allowable-miss threshold) — a student is
  "complete" at ≥ min even if < required; surface "X of Y (min Z)".
- E3: electives with **no parent clerkship** (standalone/optional); requirement
  tracking counts them against the elective only (never toward a clerkship total),
  consistent with R4.4.

**UI** — credit field in the assignment dialog + on-the-fly edit; clerkship
config gains min-required; requirement strips show credit sums and the min
threshold; electives UI allows standalone.

**Tests** — _this phase's tests are the most exhaustive because the math is
load-bearing._

- **Unit/Integration** — requirement-calculation service: half-day credits sum to
  whole requirements (2×0.5 = 1 completed); >1 credit reaches requirement faster;
  min-required marks complete below required; standalone elective days never
  bleed into a clerkship total; over-required still flagged via `over_required_days`.
  Property-style table of (required, min, [credits…], today) → expected
  completed/scheduled/unscheduled.
- **E2E journeys**
  - `CF-M1` **credit-value.spec.ts** — assign two half-credit days; assert the
    student requirement strip shows 1.0 completed and the preceptor load reflects
    credit; edit a credit value on the fly and assert the strip updates live.
  - `CF-E2` **allowed-missed-days.spec.ts** — set min-required below required;
    schedule to the min; assert the student reads **complete** (green) with a
    "min met" indication and no false "unscheduled".
  - `CF-E3` **standalone-elective.spec.ts** — create a standalone/optional
    elective, assign days, assert they count to the elective and **not** to any
    clerkship total.
  - Extend `phase-4/export.spec.ts` and `phase-4/schedule-health.spec.ts` so
    credit + min-required render correctly in export and health counts.
- **Edge cases** — credit 0 rejected or explicitly allowed (decide + test);
  fractional sums at the requirement boundary (2.5 vs. 3.0); credit change that
  crosses complete→incomplete flips status live; min-required > required rejected;
  standalone elective with `is_required=1` vs `0` accounting.

---

## Phase 6 — Calendar as a workspace (views, filters, range select)

**Scope:** J1, J2, J3, I3.

**Backend / data** — calendar summary endpoint gains filter params + an
availability overlay dataset; block/grid (student×date) read model.

**UI** — filter panel + "show availability"/"show assigned days" toggles (J1);
list view rendered as a **table under each date** (J2); new **block/grid view**
rows=students, cols=dates (J3); calendar day-range selection that opens the
assignment dialog in range mode (I3), with clear "range vs. individual days" copy.

**Tests**

- **Unit/Integration** — calendar summary filtering (by student/preceptor/
  clerkship/date range) returns the right set; grid read model shape.
- **E2E journeys**
  - `CF-J1` **calendar-filters-toggles.spec.ts** (extend
    `phase-4/calendar-workspace.spec.ts`) — apply filters via `CalendarPage.filter`,
    toggle availability/assigned overlays, assert the visible set changes and that
    filters are labeled as display-only (R8.2).
  - `CF-J2` **calendar-list-table.spec.ts** — `setView('list')` shows a per-date
    **table**; assert more rows/data density than the old list; export honors the
    view.
  - `CF-J3` **block-grid-view.spec.ts** — students as rows, dates as columns,
    highlighted cells for assigned blocks; a student's block spans contiguous
    cells.
  - `CF-I3` **calendar-range-select.spec.ts** — select a date range on the
    calendar; assert the dialog opens in **range** mode with the "range vs
    individual" explanation; create the range (`AssignmentDialog.pickRange` with
    weekday filter), assert the days land and blackout/weekend skipping works.
- **Edge cases** — range crossing a month boundary; range with all days
  blackout (0 created + explanation); grid view with 50 students / long range
  performance budget (< 1s, R-perf); filter combination that yields empty state.

---

## Phase 7 — Conflict visibility chain (the client's headline need)

**Scope:** L1, then L2 (Basic surface), then L3 (Basic modeling + validation).
_L1 → L2 → L3 ordered by dependency._

**Backend / data**

- **L1**: a conflict/overlap analyzer over the active schedule (no generation):
  detect a student whose assignments across **different clerkships** collide on a
  date or overload a day; return typed findings (entities + date) through the
  shared validation payload so the calendar/dashboard can render them. Runs
  identically for Basic and entitled (validation parity, G8/R7).
- **L2**: pairwise `mutual_exclusion` rule between preceptors → soft code
  surfaced when both are used for a student on the same day (Basic warns; Gated
  auto-avoids — keep the automation gated).
- **L3**: `clerkship.scheduling_kind` = block (inpatient) | scattered
  (outpatient); validator understands blocks occupy whole weeks and **derives**
  outpatient-available weeks (weeks consumed by blocks are unavailable for
  scattered days) — no separate cap. Basic validates/warns on overrun; Gated
  auto-places.

**UI** — a conflict panel (dashboard + calendar markers + per-student view);
mutual-exclusion rule editor; clerkship kind selector with explanation of the
block/scattered mix and the derived week logic.

**Tests**

- **Unit/Integration** — analyzer unit: cross-clerkship same-day overlap
  detected; no false positive for same clerkship continuity; identical payload
  for Basic vs entitled (extend `phase-6/validation-parity.spec.ts`).
  Mutual-exclusion soft-code parity across all mutation routes. Block-week
  derivation unit: N block weeks reduce scattered availability by exactly those
  weeks; boundary at partial weeks.
- **E2E journeys**
  - `CF-L1` **conflict-visibility.spec.ts** — with the seeded overlapping-preceptor
    scenario, assert the conflict panel lists the cross-clerkship conflict
    (student, date, both preceptors/clerkships) and the calendar marks the day;
    resolve one assignment and assert the conflict clears — **for a Basic
    (non-entitled) user** (this is the whole point).
  - `CF-L2` **mutual-exclusion.spec.ts** — define a not-both-same-day rule for two
    preceptors; assign both to a student on the same day → soft warning; accept →
    recorded as an override; Basic sees the warning, entitled additionally can let
    the generator avoid it (assert the automation is gated off for Basic).
  - `CF-L3` **block-vs-scattered.spec.ts** — mark a clerkship as block, schedule an
    inpatient block for a student, then attempt outpatient days in the consumed
    weeks → validation warns that those weeks are unavailable; scheduling in free
    weeks is clean. Basic = warning; entitled = auto-placement respects it.
- **Edge cases** — conflict spanning three clerkships on one day; mutual-exclusion
  with a preceptor also being someone's core preceptor (F5 interaction); block
  that partially overlaps a week; tenant isolation on all analyzers.

---

## Phase 8 — Non-clinical assignments (free days, exams, quarters)

**Scope:** M2, M3, M4 (quarter dates only; the 1-exam-per-quarter _rule_ is
backlog).

**Backend / data** — assignment `kind` extended: `clinical` | `free_day` |
`exam`, where `free_day`/`exam` need **no preceptor/clerkship/site**; they occupy
the student's day (still block double-booking) but don't count toward clinical
requirements. `quarter` date ranges per schedule (optional).

**UI** — assignment dialog gains a "type" selector; free-day/exam paths hide the
clinical pickers; quarter setup in schedule settings; calendar/exports render
non-clinical days distinctly.

**Tests**

- **Unit/Integration** — non-clinical assignment validation: still hard-blocks
  student double-booking; never contributes to clinical requirement math; quarter
  boundaries computed correctly.
- **E2E journeys**
  - `CF-M2` **free-day.spec.ts** — assign a free day (no preceptor/clerkship);
    assert it appears on the student schedule, blocks a second assignment that
    day, and doesn't change requirement completion.
  - `CF-M3` **exam-assignment.spec.ts** — assign an exam day; same invariants;
    renders distinctly on calendar + export.
  - `CF-M4` **quarters.spec.ts** — define quarter dates; assert they display and
    (if the optional rule is enabled later) an exam maps to its quarter.
- **Edge cases** — free day on a blackout date; exam overlapping an existing
  clinical assignment (hard block); quarter boundaries at schedule start/end.

---

## Phase 9 — Distribution + FERPA (scope-gated)

**Scope:** K2 (spike, gates K1), then K1.

**Step 9a — FERPA scoping spike (K2)** — produce a short decision doc
(`docs/plans/ferpa-scoping.md`): what student data may be sent, to whom, minimum
necessary per recipient (a preceptor sees only their students; a site only its
own), audit/logging, and consent assumptions. **No K1 code until this lands.**

**Step 9b — Send schedule (K1)** — multi-select recipients (preceptors/students/
sites); generate per-recipient views honoring the K2 minimum-necessary rule;
send/export.

**Tests**

- **Unit/Integration** — per-recipient redaction: a preceptor's payload contains
  only their students/days; cross-student data is excluded (this is the FERPA
  assertion and must be unit-proven, not just UI-checked). Multi-tenant scoping on
  every recipient query.
- **E2E journeys**
  - `CF-K1` **send-schedule.spec.ts** — select multiple recipients, preview each
    recipient's view, assert a preceptor's preview shows only their own
    students/days (FERPA minimum-necessary visible in the flow), and the send
    action completes with confirmation.
- **Edge cases** — recipient with no assignments (empty but valid view); a student
  selected as a recipient can't see other students; tenant isolation across the
  whole send path.

---

## Phase 10 — L4 epic: manual schedule-building assistant (Basic slice)

**Why last:** depends on L1, L2, L3 (Phase 7), H7 (Phase 4), I3 (Phase 6). Only
the **manual** slice is Basic; auto-suggesting whom to pin stays Gated.

**Scope:** L4 (Basic: filter → pin → custom pattern + override → one-button
batch-create). Delivered as sub-steps, each shippable:

1. **Pinning model** — a per-session set of tentative (student, preceptor,
   clerkship, dates) selections that don't yet persist as assignments.
2. **Conflict-aware pinning** — pinning surfaces L1/L2/L3 warnings against
   already-pinned + existing assignments; carry prior students forward.
3. **Custom patterns + override-any-validation** — arbitrary day patterns with an
   explicit override of soft codes (hard codes like double-booking still block).
4. **Batch create** — one action converts all valid pins into real assignments
   through the same validator as manual create (parity).

**Tests**

- **Unit/Integration** — pin store operations; conflict evaluation of a pin set
  against existing assignments; batch-create runs each pin through the shared
  validator (no bypass of hard codes); override records soft codes on rows.
- **E2E journeys**
  - `CF-L4-a` **pin-and-batch-create.spec.ts** — filter to a clerkship, pin a
    preceptor for a student across dates, pin a second clerkship avoiding the
    first's conflict, then **one button** creates all assignments; assert they all
    persist and validate, and that a hard conflict in the pin set blocks _only_
    that pin, not the batch.
  - `CF-L4-b` **planning-carry-forward.spec.ts** — plan student A, then plan
    student B; assert B's pinning surfaces conflicts against A's just-created
    schedule (mutual-exclusion / shared-preceptor same day).
  - `CF-L4-c` **custom-pattern-override.spec.ts** — build a custom (irregular)
    pattern, override the soft warnings, batch-create; assert overrides are
    recorded in the health panel and hard blocks still stopped.
  - **Gating**: entitled-only "suggest whom to pin" is absent for Basic (extend
    `phase-6/gating.spec.ts`).
- **Edge cases** — pin set with an internal contradiction (same student two
  preceptors one day) → that pin flagged, rest proceed; batch-create partial
  failure surfaces which pins failed and why; abandoning the session discards
  pins (nothing persisted); large pin set performance budget.

---

## Sequencing summary & dependencies

| Phase | Theme                              | Depends on         | Client scenarios closed (primary)                     |
| ----- | ---------------------------------- | ------------------ | ----------------------------------------------------- |
| 1     | P0 bugs                            | —                  | A1, B1, C1, G1, H1, I1                                 |
| 2     | Clarity / context / copy           | 1 (B1, I1)         | N1, B2–B4, C2–C5, D1–D2, E1, F1–F2, H2–H5, I2, I4     |
| 3     | Teams as coverage groups + core    | 1 (G1)             | G2–G4, F5                                              |
| 4     | Availability depth                 | 2 (copy)           | H6, H7, H8                                             |
| 5     | Requirement math                   | —                  | M1/F4, E2, E3                                          |
| 6     | Calendar workspace                 | 2                  | J1–J3, I3                                              |
| 7     | Conflict visibility chain          | 3 (F5), 5, 6       | L1, L2, L3                                             |
| 8     | Non-clinical assignments           | 5 (math)           | M2, M3, M4                                             |
| 9     | Distribution + FERPA               | 2, K2 spike        | K2, K1                                                 |
| 10    | Planning assistant (Basic slice)   | 4, 6, 7            | L4                                                     |

**Fastest path to "this client can use it":** Phases 1 → 2 → 7-L1. That closes
every P0 bug, the comprehension cluster, and the headline conflict-visibility ask.
Phases 3–6, 8–10 deepen from there.

## Test infrastructure work threaded through all phases

- New `e2e/journeys/phase-9/` directory (client-feedback journeys) — or fold into
  the nearest existing phase per item; either way tag `@stage1`/`@stage2` and add
  `@finding(CF-*)` annotations.
- Extend `e2e/pages/` objects: availability calendar, conflict panel, pin
  workspace, block/grid view, page-context header, send-schedule dialog.
- Add the `CF-*` finding namespace to `e2e/scripts/generate-coverage.ts` inputs so
  `COVERAGE.md` proves every roadmap item maps to a journey; wire `coverage:check`
  into the Definition of Done.
- Keep **zero retries**; every new journey must be deterministic against the
  seeded fixtures (extend the seed for the client's exact scenarios rather than
  relying on timing).
