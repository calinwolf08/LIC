# E2E journey coverage — by feature area

A map of what the Playwright journey suite actually exercises, grouped by
**product feature area** rather than by test phase, so you can scan a feature
and see at a glance what is covered and where the holes are.

- **Suite:** `e2e/journeys/**` (single `journeys` Playwright project), 48 spec
  files, 46 journeys, 90 test cases. Full run is green on a fresh seed.
- **What "covered" means here:** each journey asserts across up to three layers
  at its checkpoints — **UI** (role/label/testid), the **same-session API**, and
  the **database** — so a green journey means the user-visible behaviour, the
  server contract, and the persisted state all agree. Where a scenario only
  asserts one or two layers, it's called out.
- **Tags:** `@smoke` (fast PR gate), `@stage1` (works on every tier),
  `@stage2` (auto-generation / entitled tier), `@long` (nightly arcs),
  `@tenant` (multi-tenant). The machine-generated requirement/finding
  traceability table lives in `e2e/COVERAGE.md`; this doc is the human-readable
  companion.
- **How to read the "Gaps" lines:** they list behaviour in that area that the
  journey suite does _not_ drive through the browser. Many are intentional
  (no UI surface exists, or it's covered at the unit/integration layer) and say
  so; the rest are candidate additions.

---

## 1. Authentication & accounts

**Journeys:** J1.1 (`phase-1/account-lifecycle.spec.ts`)

| Scenario                                                                                               | Layers                 |
| ------------------------------------------------------------------------------------------------------ | ---------------------- |
| Register: inline validation blocks bad input; a clean submit lands schedule-first                      | UI + redirect          |
| Register: a duplicate email is refused in-context (not a crash)                                        | UI                     |
| Remember-me makes the session cookie persistent; without it the cookie is session-only                 | UI + cookie inspection |
| A deep link taken while logged out round-trips through login with its full path + query (`redirectTo`) | UI + URL               |
| Protected API returns 401 (JSON envelope) when logged out; auth routes stay reachable                  | API                    |
| A wrong password shows an in-context error, not a 500                                                  | UI                     |

**Gaps / not covered:** password reset / change-password flow; email
verification; logout button (sign-out is exercised implicitly via fixtures, not
as an asserted user action); account deletion; multi-session/device eviction.

---

## 2. Schedules (lifecycle, scoping, active-schedule)

**Journeys:** J1.2 (`schedule-lifecycle.spec.ts`), J1.3 (`schedule-scoping.spec.ts`), J7.7c (`config-edits.spec.ts`)

| Scenario                                                                                                                                          | Layers        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Full lifecycle on **basic** tier: wizard → edit → duplicate → activate → delete (incl. deleting the active schedule)                              | UI + API + DB |
| Same full lifecycle on **entitled** tier                                                                                                          | UI + API + DB |
| Create form rejects an end date before the start date, in-context                                                                                 | UI            |
| An entity in one schedule is invisible in another; rename updates the switcher live                                                               | UI + API      |
| Cross-tenant activation of another user's schedule is refused (404)                                                                               | API           |
| **Shrinking the window** past an existing assignment (gap #3 closed): the row is kept, not dropped, and surfaces as an `outside_schedule` finding | API + DB      |

**Related invariants asserted elsewhere:** active-schedule **write gate** (P1-c)
— writes are refused unless the target is the active schedule — is asserted in
J1.2 and again in J7.x. Schedule delete **cascades** (does not block) is asserted
in J7.4 (D7-2).

**Gaps / not covered:** duplicating a schedule that has generated rows (only
hand-built rows are duplicated in the journey); archiving/soft-delete if that
concept exists. _Date-range shrink under existing assignments is now covered by
J7.7c._

---

## 3. Locations (health systems & sites)

**Journeys:** J2.1 (`locations.spec.ts`), J7.7b (`config-edits.spec.ts`)

| Scenario                                                                                                                                                                   | Layers        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Build health system → site → preceptor, then delete **bottom-up** with dependency blocks at each level                                                                     | UI + API + DB |
| Creating a site without a health system is refused in-context                                                                                                              | UI            |
| **Re-parenting a site** to another health system (gap #3 closed): the move succeeds and the assignments on that site survive intact (no cascade delete, site_id preserved) | API + DB      |

**Related:** the full dependency-deletion chain (every entity blocked while
dependents exist, resolves bottom-up, no orphans) is J7.4.

**Gaps / not covered:** site address/contact field validation; deactivating vs
deleting a location. _Site re-parenting under existing assignments is now covered
by J7.7b._

---

## 4. Preceptors & availability

**Journeys:** J2.2 (`preceptor-wizard.spec.ts`), J2.6 (`drill-through-and-lists.spec.ts`), J2.7 (`availability-editing.spec.ts`), J3.9 (`availability-ripple.spec.ts`)

| Scenario                                                                                                                                                                                                                 | Layers        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Wizard: basic info → health system & site → weekly availability **pattern** that materialises into concrete dates → list shows the availability-configured indicator; detail Availability tab reproduces the builder     | UI + API + DB |
| A preceptor is schedulable with **only a name** (no site, no availability); the list reads "Not Set" (R3.5)                                                                                                              | UI + API      |
| Preceptor list shows the availability-configured indicator (per-row)                                                                                                                                                     | UI            |
| Availability **ripple**: marking a preceptor unavailable surfaces a conflict on an existing assignment day                                                                                                               | UI + API + DB |
| **Single-date edit** (gap #1 closed): an individual "Unavailable" override flips one materialised date to `is_available=0` while its neighbours stay available; **deleting** that override returns the date to available | UI + API      |

**Related:** per-preceptor **daily capacity** is respected by generation (J5.5);
the "mark available" side-effect override is J3.3 (§8 below).

**Gaps / not covered:** overlapping-pattern resolution; availability across
multiple sites for one preceptor within one pattern (single-site pattern is the
covered path); vacation/leave blocks distinct from per-day unavailability.
_Per-date edit/delete is now covered by J2.7._

---

## 5. Students & onboarding

**Journeys:** J2.3 (`student-hub.spec.ts`), J2.6 (`drill-through-and-lists.spec.ts`)

| Scenario                                                          | Layers        |
| ----------------------------------------------------------------- | ------------- |
| Create → hub tabs, inline edit, onboarding, progress, list status | UI + API + DB |
| Duplicate email is refused inline                                 | UI            |
| `/students/[id]/edit` redirects to the inline detail page         | UI + URL      |
| Deleting a student who has assignments is refused in-context      | UI + API      |
| Student list shows per-student status and completion              | UI            |

**Related:** onboarding **resolves** a `not_onboarded` override once completed
(J3.3, J5.3); student status moves none → partial → full and names the at-risk
student (J4.5).

**Gaps / not covered:** bulk student import; student transfer between schedules;
re-onboarding after a health-system change.

---

## 6. Clerkships & electives

**Journeys:** J2.4 (`clerkship-config.spec.ts`), J2.6, J3.7 (`electives.spec.ts`), J7.7a (`config-edits.spec.ts`)

| Scenario                                                                                                                               | Layers        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Create → edit details → manage allowed sites → create a required elective within the day budget → delete                               | UI + API + DB |
| The seeded Internal Medicine clerkship shows its required and optional electives                                                       | UI            |
| Tier gating: entitled sees the Stage 2 tabs (Auto-scheduling, Preceptor teams); basic sees only Stage 1 tabs                           | UI            |
| Clerkship list shows type and required-days columns; Manage opens the detail                                                           | UI            |
| **Per-elective** requirement tracking: Cardiology and Dermatology count **separately** toward their own minimums                       | UI + API + DB |
| **Raising an elective's minimum** after a day counts against it (gap #3 closed): requirement tracking re-baselines "2 of 3" → "4 of 5" | UI + API      |

**Related:** optional electives do **not** reduce the base clerkship day budget
(asserted at the unit layer; the day-budget guard is exercised in J2.4/J3.7).

**Gaps / not covered:** editing an existing elective's required/optional flag
after assignments reference it; removing an allowed site that already has
assignments; elective ordering/priority if it exists. _Editing an elective's
minimum-days under a dependent assignment is now covered by J7.7a._

---

## 7. Manual scheduling — the assignment dialog

**Journeys:** J3.1 (`entry-points.spec.ts`), J3.2 (`range-creation.spec.ts`), J3.5 (`edit-lifecycle.spec.ts`), J3.6 (`swap.spec.ts`), J3.8 (`locks.spec.ts`)

| Scenario                                                                                               | Layers        |
| ------------------------------------------------------------------------------------------------------ | ------------- |
| Three entry points, one dialog: create from the student page and from the calendar; all surfaces agree | UI + API + DB |
| A past day surfaces the `past_date` warning in the dialog                                              | UI            |
| Range creation: a clean Mon–Fri range creates one assignment per weekday                               | UI + API + DB |
| Edit lifecycle: create → move → reassign → delete, with the API agreeing at each step                  | UI + API + DB |
| **Swap** two assignments' preceptors (API-only route — no UI surface exists)                           | API + DB      |
| **Locks** (entitled): a manual day can be locked and unlocked                                          | UI + API + DB |
| Locks (basic): no lock control, and the API ignores a locked update                                    | UI + API      |

**Gaps / not covered:** drag-and-drop move on the calendar grid (moves go through
the dialog, not a drag gesture); multi-select / bulk edit of assignments; an
**undo** of a delete. Swap has no UI, so it's asserted only through the route.

---

## 8. Conflict validation (soft codes, hard blocks, overrides, bypass)

This is the safety core. Every mutation goes through **one validator** (asserted
for parity in §11).

**Journeys:** J3.3 (`soft-codes.spec.ts`), J3.4 (`hard-blocks.spec.ts`), J3.10 (`capacity-side-effects.spec.ts`), J4.4 (`schedule-health.spec.ts`), J5.3 (`bypass.spec.ts`), J6.4 (`validation-parity.spec.ts`)

| Scenario                                                                                                                                                                        | Layers        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Soft** `blackout_date`: assigning on a blackout day is accepted and recorded on the row                                                                                       | UI + API + DB |
| **Soft** `not_onboarded`: accepted, recorded, and **resolved** once the student onboards                                                                                        | UI + API + DB |
| **Soft** `preceptor_unavailable` via "assign and mark available": the override flips the preceptor's availability for that day (side-effect branch)                             | UI + API + DB |
| **Soft** `preceptor_capacity` via "double-book → raise the limit" (gap #1 closed): `bump_preceptor_capacity` raises `max_students` and both students land on the day            | UI + API + DB |
| **Soft** `preceptor_capacity` via "move the other student off" (gap #1 closed): `remove_conflicting_assignment` frees the slot; the occupant's row is gone, the limit unchanged | UI + API + DB |
| **Hard block**: a student double-book is blocked in the picker **and** rejected by the API                                                                                      | UI + API      |
| Bypass: un-onboarded student flagged by default, stamped when bypassed, resolved on onboarding                                                                                  | UI + API + DB |
| Bypass: an unknown or hard bypass code is rejected (P5-b)                                                                                                                       | API           |
| Schedule health is **one number** across API, calendar pill, per-type panel, and dashboard — and moves together when a finding is added/fixed                                   | UI + API      |
| Validation payload equality: identical schedules yield equal Stage 1 payloads across tiers                                                                                      | API           |

**All three override side-effects now have browser coverage:**
`mark_preceptor_available` (J3.3), `bump_preceptor_capacity` and
`remove_conflicting_assignment` (J3.10). The service + integration layer
(`assignment-overrides.test.ts`, `assignment-apis.test.ts`) still backs them at
the unit level.

**Gaps / not covered (browser layer):** concurrent overrides on the same day by
two users (concurrency is covered for create, J7.5, not for override).

---

## 9. Calendar workspace & blackout dates

**Journeys:** J4.1 (`calendar-workspace.spec.ts`), J4.2 (`blackout-dates.spec.ts`)

| Scenario                                                                                                                     | Layers        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Views (list/calendar), **display-only** filters, day/chip clicks (open the dialog), and month/range edges                    | UI + URL      |
| Calendar URL round-trips (view + filters survive reload) — regressions P4-a (cross-schedule leakage) / P4-b (out-of-range)   | UI + URL      |
| Blackout dates: create (rendered distinctly in the grid), conflict-delete, duplicate rejected, out-of-range rejected, delete | UI + API + DB |

**Related:** blackouts are **schedule-scoped** (P4-d) and a duplicate no longer
500s (P4-e) — both asserted in J4.2.

**Gaps / not covered:** recurring/multi-day blackout ranges (single-day is the
covered path); blackout reasons surfaced on the calendar hover; week/day view if
they exist beyond list/month.

---

## 10. Schedule health & dashboard

**Journeys:** J4.4 (`schedule-health.spec.ts`), J4.5 (`dashboard.spec.ts`)

| Scenario                                                                                                              | Layers        |
| --------------------------------------------------------------------------------------------------------------------- | ------------- |
| Health total agrees across every surface and moves together on add/fix (see §8)                                       | UI + API      |
| Dashboard readiness checklist links to fixes, ticks as done, and flags that availability needs materialisation (R3.6) | UI + API      |
| Dashboard student status moves none → partial → full and names the at-risk student                                    | UI + API + DB |

**Gaps / not covered:** dashboard behaviour with zero entities (empty-state of
the dashboard specifically — general empty states are §16); export/print of the
readiness report if it exists.

---

## 11. Export

**Journeys:** J4.3 (`export.spec.ts`)

| Scenario                                                                                                                          | Layers                       |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Unfiltered export is the source of truth; preceptor and date filters honoured; empty sheet for a no-match filter; bad id rejected | API (xlsx bytes parsed) + DB |

**Related:** export column correctness (P4-f) is asserted here and in the
calendar/export service unit tests.

**Gaps / not covered:** CSV/PDF formats if they exist (xlsx is the covered
format); export of a _generated_ schedule with source/lock columns (columns are
unit-tested; the filtered browser download path covers hand-built rows).

---

## 12. Auto-generation (Stage 2 engine)

**Journeys:** J5.1 (`first-run.spec.ts`), J5.2 (`regenerate.spec.ts`), J5.4 (`fallbacks.spec.ts`), J5.5 (`config.spec.ts`), J5.6 (`teams.spec.ts`), J5.7 (`results.spec.ts`)

| Scenario                                                                                          | Layers        |
| ------------------------------------------------------------------------------------------------- | ------------- |
| First full run: generate Full → placed, credited, Auto-marked, exported, **idempotent** on re-run | UI + API + DB |
| Regenerate **Full** preserves locked rows by id and replaces the unlocked ones                    | UI + API + DB |
| Regenerate **Completion** preserves existing ids and fills only the new student                   | UI + API + DB |
| Fallbacks: a backup covers the primary gap, and a review day is approved                          | UI + API + DB |
| Config → behaviour: global outpatient defaults persist and reject invalid input                   | UI + API      |
| Config: a preceptor's daily **capacity** is respected by generation                               | UI + API + DB |
| Config: a non-entitled user cannot write the global defaults (403)                                | API           |
| Teams: formation rules, CRUD, and team-based generation                                           | UI + API + DB |
| Results & diagnostics: scarcity is reported **truthfully** and shrinks when capacity is raised    | UI + API      |

**Related:** the volume tripwire (60 students × 6 preceptors × 12 weeks
generates, renders, filters, exports, counts) is J7.6.

**Gaps / not covered:** partial-generation resumption after an interrupted run;
generation across a schedule whose date range changed mid-flight; a
generation-run **history** view beyond the latest run's diagnostics; cancelling
an in-progress generation.

---

## 13. Tier gating & entitlements

**Journeys:** J1.4 (`shell-and-gating.spec.ts`), J6.2 (`gating.spec.ts`), J2.4 (tab gating)

| Scenario                                                                                                                 | Layers        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Entitled shell shows Auto-Generate and reaches the hub; basic shell hides Stage 2 and blocks its pages but keeps Stage 1 | UI            |
| Basic tier: Stage 2 nav, routes **and write APIs** are all gated (P6-a: gated write → 403, not 500)                      | UI + API      |
| Basic tier: **no over-gating** — all of Stage 1 works                                                                    | UI + API + DB |
| Granting the entitlement mid-session reveals the nav                                                                     | UI + DB       |
| Clerkship detail: entitled sees Stage 2 tabs; basic sees only Stage 1 tabs                                               | UI            |

**Gaps / not covered:** _revoking_ the entitlement mid-session (grant is covered;
J7.1 covers revoke end-to-end in the long arc, but not a focused nav-hides-again
assertion); per-feature entitlement flags if the tier is more granular than
basic/entitled.

---

## 14. Multi-tenant isolation

**Journeys:** J1.3 (`schedule-scoping.spec.ts`), J6.5 (`tenant-isolation.spec.ts`)

| Scenario                                                                                    | Layers   |
| ------------------------------------------------------------------------------------------- | -------- |
| Cross-tenant activation of another user's schedule is refused (404)                         | API      |
| Tenant A's generation and writes never touch B; B cannot reach A's entities (F-02/03/04/27) | API + DB |

**Gaps / not covered:** shared-org / multi-user-per-tenant permission tiers if
they exist (the model tested is one tenant = one owner); cross-tenant export
attempts.

---

## 15. Cross-cutting long arcs & robustness

**Journeys:** J7.1 (`semester.spec.ts`), J7.2 (`shared-entities.spec.ts`), J7.3 (`time-boundaries.spec.ts`), J7.4 (`dependency-chain.spec.ts`), J7.5 (`two-tabs.spec.ts`), J7.6 (`volume.spec.ts`), J7.7 (`config-edits.spec.ts`), plus the `@smoke` arc (`phase-7/smoke.spec.ts`)

| Scenario                                                                                                                                                                             | Layers        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| A semester, two tiers: a hand-built world survives generation, bypass, revoke and export                                                                                             | UI + API + DB |
| Shared entities across schedules: **global** capacity, shared-entity warning, cross-schedule ripple, isolated delete (D7-3/D7-4)                                                     | UI + API + DB |
| Time boundaries: past is credited and preserved; `past_date` warns; today marker is correct                                                                                          | UI + API + DB |
| Dependency-deletion chain: every entity blocked while dependents exist, resolves bottom-up, no orphans (D7-2)                                                                        | UI + API + DB |
| Two tabs, one schedule: concurrent create is hard-blocked without a duplicate; generation is seen after refresh                                                                      | UI + API + DB |
| Volume: 60×6×12 generates, renders, filters, exports and counts correctly (F-30)                                                                                                     | UI + API + DB |
| **Config edits under existing assignments** (J7.7, gap #3 closed): elective-minimum change re-baselines tracking; site re-parent keeps rows; schedule shrink flags out-of-range days | UI + API + DB |
| Smoke: the essential register → build → generate → export arc in one pass                                                                                                            | UI + API + DB |

**Gaps / not covered:** browser back/forward across a long edit session;
offline/network-drop recovery; server-restart mid-session state; very large
blackout sets' effect on generation time.

---

## 16. UI infrastructure & error surfacing

**Journeys:** J1.4 (`shell-and-gating.spec.ts`), J1.5 (`guard-and-errors.spec.ts`), J2.5 (`drill-through-and-lists.spec.ts`), P3-b (`entity-tab-deeplink.spec.ts`)

| Scenario                                                                      | Layers   |
| ----------------------------------------------------------------------------- | -------- |
| A fresh account reaches every Stage 1 surface with a schedule already created | UI       |
| Empty lists explain themselves and lead to creation                           | UI       |
| An unknown entity id renders a not-found state, not a crash                   | UI       |
| A server-rejected schedule edit shows the error in the dialog, not an alert   | UI       |
| A duplicate-name entity error is shown inline on its form                     | UI       |
| Navigating away from an unsaved form is **guarded** (P1-e, R10.3)             | UI       |
| Every detail page has a breadcrumb back to its list                           | UI       |
| A `?tab=` URL opens that tab on the student page (deep-link restore)          | UI + URL |

**Gaps / not covered:** toast/notification dismissal behaviour; keyboard
navigation / focus management / a11y assertions (roles are used as locators but
not audited as an a11y checkpoint); mobile/responsive layout; browser-level
form autofill.

---

## Where the biggest gaps are (summary for triage)

The three highest-ranked gaps from the first pass are now **closed** with browser
journeys (J3.10, J2.7, J7.7 — 6 new test cases):

1. ~~**Override side-effects through the browser**~~ (§8) — **closed.** All three
   side effects (`mark_preceptor_available`, `bump_preceptor_capacity`,
   `remove_conflicting_assignment`) are now driven through the dialog (J3.3, J3.10).
2. ~~**Availability at the per-date grain**~~ (§4) — **closed.** J2.7 flips one
   materialised date to unavailable via an individual override and deletes it back.
3. ~~**Editing config that assignments already depend on**~~ (§6, §2, §3) —
   **closed.** J7.7 covers elective-minimum change, site re-parent, and
   schedule-window shrink, each under an existing dependent assignment.

Remaining, ranked by how likely a real user hits them:

4. **Entitlement revoke as a focused UI assertion** (§13) — covered inside the
   J7.1 long arc but not as a standalone "nav hides again" check.
5. **Alternate export formats and generated-row export columns through the
   browser** (§11) — xlsx + hand-built rows are covered; the rest is unit-tested.
6. **Accessibility / responsive / keyboard** (§16) — not asserted anywhere.
7. **Concurrent overrides on the same day by two users** (§8) — create-time
   concurrency is covered (J7.5); override-time is not.

None of these are silent regressions in _covered_ behaviour — they're areas the
journey suite doesn't reach yet. Everything listed in a coverage table above is
green on a fresh seed.
