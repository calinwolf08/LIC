# Tier parity and manual/generated interoperability

Two requirements drive this document:

1. **Interoperability.** A generated schedule must be an ordinary schedule. Once generation has run, every assignment it created must be viewable, editable, movable, reassignable, swappable and deletable through exactly the same routes, dialogs and validation grammar the user would have used had they typed it in by hand — and the next generation run must respect what the user did.
2. **Concept parity.** Every scheduling concept a Stage 1 user can _configure_ must be a concept they can _use_ and _see tracked_; and every concept the engine relies on must mean the same thing on both sides. A Stage 2 user has both feature sets at once on one dataset, so the two must compose rather than contradict.

Findings are numbered `P-nn` and are indexed in `02-findings-and-bugs.md §F`. Those marked **Verified** were reproduced against the real route handlers on an in-memory migrated database (probe since deleted).

---

## 1. Concept parity matrix

| Concept                                            | Stage 1 can configure?           | Stage 1 can assign/track?         | Engine uses it?                                             | Same meaning both sides? |
| -------------------------------------------------- | -------------------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------------ |
| Student, preceptor, clerkship, site, health system | Yes                              | Yes                               | Yes                                                         | Yes                      |
| Required days per clerkship                        | Yes                              | Yes (requirement strip)           | Yes                                                         | Yes                      |
| Blackout dates                                     | Yes                              | Yes                               | Yes                                                         | Yes                      |
| Preceptor availability (explicit rows)             | Yes                              | Yes (warn + override)             | Yes (hard filter)                                           | **No — P-05**            |
| Availability _patterns_                            | Yes                              | Only through materialised rows    | No                                                          | **No — F-18/F-29**       |
| Preceptor `max_students`                           | Yes                              | Yes (per day)                     | Per day in strategies, **per year** in the capacity checker | **No — F-07**            |
| Capacity rules (`preceptor_capacity_rules`)        | No UI (Stage 2 only)             | Not surfaced                      | Yes                                                         | **No — P-06**            |
| Allowed sites per clerkship                        | Yes                              | Yes (`site_not_allowed`)          | Ignored                                                     | **No — F-05**            |
| Onboarding per health system                       | Yes                              | Yes (`not_onboarded`)             | Ignored                                                     | **No — F-05**            |
| **Electives** (`clerkship_electives`)              | **Yes — ungated tab**            | **No — P-01**                     | Yes (required only)                                         | **No — P-01**            |
| Elective preceptor pools / sites                   | Yes (ungated API + UI)           | Not enforceable                   | Pools yes, sites no                                         | **No — P-01/P-04**       |
| **Preceptor teams**                                | Stage 2 UI only; **ungated API** | Surfaced as eligibility _reasons_ | Sole eligibility source                                     | **Inverted — P-02**      |
| Locked assignments                                 | Stage 2 only (checkbox hidden)   | Editable by Stage 1 users         | Preserved, not credited                                     | Partly — P-08            |
| Overrides (`override_codes`)                       | Yes on create                    | **Not on edit — P-03**            | Never written                                               | **No — P-03/F-11**       |
| `source` (manual vs generated)                     | n/a                              | **Invisible everywhere — P-07**   | Set on write only                                           | n/a                      |
| Health-system / site / team continuity             | Stage 2 settings                 | Not surfaced                      | Configured, unused                                          | **No — F-20**            |

The pattern: **Stage 1 owns the data, Stage 2 owns the rules, and the two disagree about what the data means.** Fixing generation (documents 02–04) closes the right-hand column; this document closes the two left-hand ones.

---

## 2. Interoperability findings (generated rows through manual routes)

### P-01 · S1 · Electives exist for configuration only — no assignment path, no tracking

**Verified.** `POST /api/schedules/assignments` with `elective_id` in the body returns **201 and stores `elective_id = null`** — Zod strips the unknown key silently. There is no `elective_id` in `createAssignmentSchema`, `updateAssignmentSchema`, the bulk schema, `createManualAssignment()`, the assignment dialog, the calendar service's select list, the student schedule view, or the Excel export. Only the engine ever sets it (and the generate route drops it, F-14).

Consequences:

- A Stage 1 user can create electives, attach preceptors and sites to them (all ungated), and then **cannot record a single elective day**. `minimum_days` is unenforceable and invisible outside the engine.
- **Verified (Q7):** requirement tracking counts an elective day as an ordinary clerkship day — `required: 10, scheduled: 1, unscheduled: 9` for a clerkship whose 10 days include a 3-day required elective. Nobody can answer "has this student done their required elective?" in either tier.
- A generated elective day that the user deletes cannot be recreated by hand; the elective silently degrades into a plain clerkship day.

**Fix.** Add `elective_id` to the create/bulk/update schemas and to `createManualAssignment`; add an optional "Elective" picker to the assignment dialog (shown only when the chosen clerkship has electives), filtered to `elective_preceptors`/`elective_sites`; extend `requirement-status`/`requirement-preview` with per-elective counts (`required (elective) / completed / scheduled`) and render them in the student requirement strip and clerkship progress; include the elective name in the calendar row, student schedule and export. Reject an unknown `elective_id`, and reject one that does not belong to the chosen clerkship, with 400 rather than silently dropping it.

### P-03 · S1 · Create and edit use different validators, so an overridden or generated day cannot be moved

**Verified.** `PATCH …/assignments/{id}` moving a day onto a date where the preceptor is explicitly unavailable, with `force=true` **and** `override_codes: ['preceptor_unavailable']` in the body → **400 "Validation failed"**, nothing stored. Reassigning to a preceptor already at `max_students` → `valid: false`, `errors: ["Preceptor has reached maximum student capacity for this date"]`, no override path.

The create path (`POST`) uses `validateAssignmentCandidate()` — structured hard/soft codes, an override conversation in the dialog, and `override_codes` persisted on the row. The edit paths (`PATCH` → `updateAssignment()`, `reassign`, `swap`) use the older `validateAssignment()` in `assignment-service.ts`, which returns strings, treats capacity/availability/blackout as **hard** failures, has **no** override vocabulary, and checks neither site restrictions, nor onboarding, nor the schedule range. `?force=true` on PATCH means only "allow modifying a past date". `updateAssignmentSchema` has no `override_codes`/`override_note` fields, so the dialog's edit branch cannot send what it collected.

Consequences: the exact situations generation is expected to produce — a bypassed capacity day, a day the coordinator knowingly kept on an unavailable preceptor — become **immovable**. The user must delete and recreate, losing the row's history, lock and overrides. Conversely, an edit can move a row into a state (site not allowed for the clerkship, outside the schedule range, student not onboarded) that create would have refused, and no override is recorded, so the health panel reports a violation nobody accepted.

**Fix.** One validator for every mutation. `updateAssignment`, `reassignToPreceptor` and `swapAssignments` call `validateAssignmentCandidate` with `excludeId`, return `{hard, soft}` in the same envelope as create (422 with codes), accept `override_codes`/`override_note`, and persist accepted codes. Delete `validateAssignment()` from `assignment-service.ts`. Keep `force` meaning only "I accept every soft code", and make `past_date` one of them.

### P-04 · S2/S1 · Reassign and swap ignore every relational rule

**Verified.** Reassigning an elective day to a preceptor **outside that elective's pool** succeeds (`valid: true`) and keeps `elective_id`, leaving a row that neither tier could have created. The same holds for moving a day to a preceptor not on the clerkship's team, or to a preceptor whose site the clerkship does not allow — `validateAssignment` checks none of them. Swap has the same hole in both directions.

**Fix.** Folded into P-03: the shared validator adds the eligibility predicate (`03-design-recommendations.md §6`) as a soft code (`preceptor_not_eligible`), so a deliberate exception is possible and recorded, while an accident is caught.

### P-07 · S2 · `source`, `locked`, `elective_id` and `override_codes` are invisible in every read model

The calendar service selects `id, student_id, preceptor_id, clerkship_id, date, status, created_at, updated_at` plus names; the student schedule view and the Excel export reference none of `source`, `locked`, `elective_id`, `override_codes`. So after a run the user cannot see which days the engine created, which are locked, which carry an accepted override, or which belong to an elective — and cannot filter by any of them.

**Fix.** Add the four columns to the calendar/student/preceptor read models and the export; render a subtle "Auto" badge on generated days, the existing lock icon, and the override chip the health panel already knows how to draw. This is also what makes "regenerate only the days I did not touch" explainable later.

### P-08 · S3 · Lock semantics are undocumented and asymmetric

**Verified.** A **non-entitled** user can PATCH a locked, generated assignment and move it (200, date changed); only the `locked` flag itself is protected from them (the toggle is ignored without `autogen`). That is defensible — _locked_ means "auto-generation must not touch this", not "read-only" — but it is written down nowhere, no test asserts it, and the UI shows no lock state outside the dialog (P-07). Decide, document in the spec, and test both halves: generation never moves a locked row; a human always can.

### P-09 · S2 · Generation silently loses to manual rows

`bulkCreateAssignments` drops any candidate whose `(student, date)` slot is already occupied — which is exactly how locked and manual rows survive a run — but nothing reports it. The user sees "generated N assignments" with no mention that M were skipped because their own assignments occupied those days, and the unmet-requirement list does not account for them (compounded by F-06). Report skipped candidates per student with the blocking assignment id.

### P-10 · S3 · Two write paths for the same table

Generation writes rows through `bulkCreateAssignments` (route) or `commitAssignments` (engine); manual creation writes through `createManualAssignment`. The three set different column subsets (`site_id`, `elective_id`, `source`, `override_codes`, `updated_at` — see F-14). Any future column will be forgotten by at least one. Collapse to a single `insertAssignments(trx, rows)` used by all three, with the row type requiring every column.

---

## 3. Parity findings (Stage 1 concept coverage)

### P-02 · S1 · Team semantics are inverted between the tiers

- `assignment-eligibility.ts` (Stage 1 dialog): a preceptor on **no** team is eligible for **every** clerkship — "no rows means nothing has been said", by explicit design.
- `StrategyContextBuilder` (engine): the **only** candidates are preceptors on a team for that clerkship; a preceptor on no team is eligible for **nothing** (F-19).

So the same roster means "everyone can teach this" to the dialog and "nobody can teach this" to the engine. A Stage 1 user who builds a full manual schedule and then buys Stage 2 gets "No preceptors available" for every student, with no explanation, until they discover Teams. Meanwhile the Stage 1 dialog already shows team jargon in its refusal reasons ("Not on a team for Pediatrics"), which the spec forbids on Stage 1 surfaces (GUIDELINES: "no engine jargon in Stage 1"), and the page that would let them fix it is gated.

**Fix (recommended).** Make teams an _optimisation_, not a precondition: when a clerkship has no team, the engine falls back to preceptors with availability at an allowed site (the same predicate the dialog uses). Keep team management in Stage 2. Reword Stage 1 eligibility reasons in Stage 1 vocabulary ("Not set up to teach Pediatrics"), and let the entitled build of the dialog add "(no team for this clerkship)". Whatever is decided, the predicate must live in one function used by the dialog, the engine, the fallback resolver and the readiness checklist.

### P-05 · S3 · "No availability row" means opposite things

Stage 1: no row ⇒ assignable (soft warning only when a row says `is_available = 0`), so a preceptor is schedulable with just a name (spec R3.5). Engine: no row ⇒ never scheduled. Both are reasonable; together they mean the manual schedule can contain days the engine will never reproduce and never defends. Document the rule, surface it in the readiness checklist ("N preceptors have no availability — auto-generation will skip them"), and make the day-state picker say the same thing it already computes (`unset`).

### P-06 · S3 · Capacity rules are Stage 2-only but govern Stage 1 warnings

`preceptor_capacity_rules` has no Stage 1 UI, yet after Stage 2 writes one it silently changes what the engine allows — while Stage 1's capacity warning still uses `preceptors.max_students` (`assignment-validation.ts`). An entitled user therefore sees two different capacities for the same preceptor depending on which screen they are on. Fold into the single capacity resolver (`03 §5`) and show the effective number on the preceptor page for both tiers ("Up to 2 students/day").

### P-11 · S3 · Stage 1 has no visibility of what generation would do to its work

There is no "this day was generated / this day is yours" distinction (P-07) and no preview of which of the user's own rows a run would delete (F-12 makes the existing preview wrong). Before Apply, the preview must list, per student: kept (locked/past/manual), replaced, and newly created — in the user's vocabulary.

### P-12 · S4 · Ungated Stage 2 APIs with no Stage 1 UI

`/api/preceptors/teams*` is not entitlement-gated (the UI is). A Stage 1 user can create teams by API that they cannot see or manage — and those teams then silently change dialog eligibility reasons. Either gate the routes to match the UI, or (per P-02) make teams a first-class, ungated concept. Do not leave the current in-between.

---

## 4. Rules the fixed system must satisfy

These are the acceptance statements the tests in `06-test-coverage-plan.md §2.6` assert:

1. **Round-trip.** For every generated assignment there exists a manual create request that produces a byte-identical row apart from `id`, `source` and timestamps. (Today: false — no `elective_id`, no `site_id` on generated rows.)
2. **Editability.** Every generated assignment can be moved, reassigned, swapped, locked/unlocked (entitled) and deleted through the standard endpoints, with the same override conversation as a manual row — including when it carries an accepted override.
3. **One validator.** Create, edit, reassign, swap, bulk create, generation and whole-schedule validation all answer identically for the same (student, preceptor, clerkship, site, date) tuple. A day the health panel calls clean is a day every mutation path accepts, and vice versa.
4. **Idempotent tandem operation.** Generate → hand-edit → regenerate leaves the hand edits intact (locked or otherwise preserved by the chosen mode), never duplicates a day, and reports every candidate it skipped because of a user row.
5. **Concept completeness per tier.** Any concept a tier can configure, that tier can also use and see tracked: electives assignable and counted; capacity visible; availability meaning identical; teams either usable in both tiers or invisible in both.
6. **Validator equality across tiers.** `GET /api/schedules/validation` and the health panel return identical findings for identical data regardless of the caller's entitlement — the only difference between tiers is that Stage 2 users additionally see generation-run diagnostics.

Rule 6 already holds (`validateSchedule` is ungated and entitlement-blind) and must be kept when the run record lands: put generation diagnostics in a **separate** payload rather than adding entitlement-conditional fields to the validation response.

---

## 5. Required updates to the non-generation tier

Ordered as they appear in the roadmap (`07 §Phase 1b`):

| #   | Update                                                                                                                       | Why        | Touches                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| N-1 | `elective_id` end to end: schemas, `createManualAssignment`, dialog picker, day-state/eligibility filtering by elective pool | P-01       | assignments API, assignment-service, assignment-dialog, eligibility                                  |
| N-2 | Per-elective requirement tracking and display                                                                                | P-01       | requirement-status, requirement-preview, student page, clerkship progress, export                    |
| N-3 | Single validator across create/edit/reassign/swap with override codes on every path                                          | P-03, P-04 | assignment-service, editing-service, schemas, `[id]` route, reassign/swap routes, dialog edit branch |
| N-4 | Expose `source`, `locked`, `elective_id`, `override_codes` in calendar/student/preceptor/export read models with badges      | P-07       | calendar-service, schedule-views-service, export-service, calendar UI                                |
| N-5 | Effective-capacity display and one capacity resolver shared with Stage 1 warnings                                            | P-06, F-07 | capacity resolver, preceptor page, assignment-validation                                             |
| N-6 | Stage 1 vocabulary for eligibility reasons; teams either ungated or invisible                                                | P-02, P-12 | eligibility, preceptors page, teams API                                                              |
| N-7 | Readiness checklist states the availability rule and (if teams stay required) the team rule, for both tiers                  | P-05, F-28 | readiness.ts, dashboard                                                                              |
| N-8 | Document lock semantics and enforce them in both directions                                                                  | P-08       | spec, assignment routes                                                                              |

None of these depends on the engine refactor; N-1 to N-4 are worth shipping to Stage 1 users on their own merits, and they are what make a generated schedule genuinely editable afterwards.
