# Test coverage plan for schedule generation

Goal: every line of generation code is exercised, every edge case named in `02-findings-and-bugs.md` has a regression test, and the full user flow — sign in, set up data, generate, inspect results, **hand-edit the result**, regenerate — is proven end to end on both entitlement levels. Coverage is not complete until the tests prove the six parity rules in `08-tier-parity-and-interop.md` §4: a generated schedule is indistinguishable from a hand-built one to every mutation route, and the validator answers identically for both tiers.

---

## 1. Where we are

Measured on `master` with `npx vitest run --project server` over the scheduling area (764 tests, 51 files, all green):

| Area                                                                                                   | Lines                | Notes                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/configurable-scheduling-engine.ts`                                                             | 77 %                 | Uncovered: the "no configuration" branch, error catch blocks, `commitAssignments` site lookup, fallback re-reporting branches.                                                          |
| `strategies/block-based.strategy.ts`                                                                   | 69 % (47 % branches) | Partial block, `preferContinuousBlocks` reuse, failure paths untested.                                                                                                                  |
| `strategies/daily-rotation.strategy.ts`                                                                | 78 %                 | Capacity-exhausted-on-date and rotation preference paths.                                                                                                                               |
| `strategies/base-strategy.ts`                                                                          | 70 %                 | Helpers `filterByHealthSystem`, `hasYearlyCapacity`, `findPreceptorAvailableForAllDates` partly.                                                                                        |
| `capacity/capacity-checker.ts`                                                                         | 72 %                 | Block capacity, yearly/default branches.                                                                                                                                                |
| `services/context-builder.ts`                                                                          | 70 %                 | Site availability / capacity / team-membership branches never built by production code.                                                                                                 |
| `constraints/*`                                                                                        | 61–100 %             | Site-capacity block checks and elective branches low; **and none of it runs in production** (F-05).                                                                                     |
| `routes/api/schedules/generate/+server.ts`                                                             | 72 %                 | Completion branch, period creation branch, error paths. Tests mock the engine, DB and every service — they assert plumbing, not behaviour.                                              |
| `routes/api/scheduling/execute/+server.ts`                                                             | 60 %                 | Only the 403 path.                                                                                                                                                                      |
| `fallback/fallback-resolver.ts`                                                                        | 7 %                  | Dead code.                                                                                                                                                                              |
| `team-formation/team-validator.ts`, `services/suggestion-generator.ts`, `features/scheduling/index.ts` | 0 %                  | Dead / unreachable.                                                                                                                                                                     |
| `services/audit-service.ts`                                                                            | 5 %                  | Logs only.                                                                                                                                                                              |
| e2e (`e2e/journeys`)                                                                                   | —                    | One spec touches generation and only asserts 403/200 on the hub. **No e2e run ever generates a schedule.** `e2e/api/**` and `e2e/ui/**` are not in the Playwright config and are stale. |

Why green tests missed S1 bugs:

- The route test mocks `ConfigurableSchedulingEngine`, `regeneration-service`, `assignment-service`, `editing-service`, `scheduling-period-service` and `$lib/db`. It cannot observe that the engine ignores the credited context, or that deletion runs before analysis.
- Engine integration suites always create `preceptor_capacity_rules` with a large yearly cap (masking F-07) and start from an empty `schedule_assignments` table (masking F-01/F-06).
- Nothing runs the engine with two tenants (F-02), with a locked row, with an optional elective, with a weekend-bounded range for block-based, or checks persisted `site_id`/`elective_id`.
- Constraint tests test constraint classes in isolation; no test asserts the engine _invokes_ them.

## 2. Test architecture

Four layers, each with a clear job. Names below are proposed files.

### 2.1 Pure unit tests (fast, no DB) — `src/lib/features/scheduling/engine/*.test.ts`

Target the post-refactor pure modules (`03-design-recommendations.md §9`). Until then, the same cases can be written against strategies with hand-built `StrategyContext`s (as `strategy-patterns.test.ts` already does).

| File                                 | Cases                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot-fixtures.ts` (helper)      | Builder for `GenerationSnapshot`: `snapshot().student('A').clerkship('IM', 5).preceptor('Dr X', { team: 'IM', availability: weekdays(...), maxStudents: 1 }).existing(...)`. Deterministic ids.                                                                                                                                                                                                                               |
| `planner.test.ts`                    | For each mode × each bucket in `03 §2.2`: past kept+credited; locked kept+credited in all modes; valid future deleted (full) / kept (minimal, completion); invalid future deleted (full, minimal) / kept (completion); cutoff = start; cutoff = end; cutoff before schedule start rejected; credit never exceeds required; elective credit separate from clerkship credit; preview and apply built from the same plan object. |
| `validator.test.ts`                  | Every `ViolationCode` produced from a snapshot: double-booked (hard), blackout, preceptor unavailable (no row / `is_available=0`), capacity per day (DB + pending), site not allowed, not onboarded, outside schedule, locked slot; each soft code bypassable via `bypassedConstraints` and recorded as `override_codes`; hard codes never bypassable; unknown bypass names rejected with 400 at the route.                   |
| `capacity-resolver.test.ts`          | Hierarchy: preceptor+clerkship+type > preceptor+clerkship > preceptor+type > preceptor > `max_students`; yearly unlimited without rule; pending occupancy counted; site capacity daily/yearly.                                                                                                                                                                                                                                |
| `config-resolver.test.ts`            | Global defaults by type; `clerkship_configurations` override each field (`override_mode = 'override'` vs `'inherit'`); elective defaults and overrides; missing default rows → hard-coded defaults; `team_continuity` accepted.                                                                                                                                                                                               |
| `strategies/team-continuity.test.ts` | Priority order; fallback-only members last; global-fallback-only last; yearly cap skip; daily cap skip across pending; partial result with reason; `fillRemainingDays` respects fallback ordering (after fix); no double-booking of the student across clerkships.                                                                                                                                                            |
| `strategies/block-based.test.ts`     | Exact blocks; partial block allowed/disallowed; `preferContinuousBlocks` reuse and switch; sliding window over weekends (F-15); daily capacity (F-16); no preceptor for a block → partial + reason (F-21).                                                                                                                                                                                                                    |
| `strategies/daily-rotation.test.ts`  | Rotation prefers different preceptor; single preceptor case; capacity exhausted mid-range; partial result.                                                                                                                                                                                                                                                                                                                    |
| `ordering.test.ts`                   | Scarcity ordering deterministic; tie-breaks; seed reproducibility.                                                                                                                                                                                                                                                                                                                                                            |
| `statistics.test.ts`                 | Counts from accepted assignments; never negative (F-13); students with zero assignments counted.                                                                                                                                                                                                                                                                                                                              |
| `unmet-requirements.test.ts`         | Computed from accepted days (F-06); rejected batch yields unmet with violation reasons; elective vs clerkship rows distinct.                                                                                                                                                                                                                                                                                                  |

### 2.2 Engine integration tests (migrated in-memory SQLite) — `src/lib/features/scheduling/integration/`

Keep the existing suites 02–15 (they are valuable regression coverage for the happy paths) and **add** a suite per finding. Each test builds data through the real service functions where possible (so schema drift breaks tests), otherwise through `src/lib/testing/integration-helpers.ts` extended with: `createTestElective`, `createOnboarding`, `createLockedAssignment`, `createAvailabilityPattern` + materialise, `createSecondTenant`.

`16-regeneration-credit.test.ts`

- required 5, 2 past → exactly 3 new, total 5 (F-01).
- required 5, 1 locked future → 4 new (F-01/locked).
- completion: required 5, 3 existing → 2 new, total 5 (F-01).
- completion: nobody has gaps → 0 new, message.
- smart with cutoff before any assignment; cutoff after all assignments.
- elective: required elective 3 days, 1 existing elective day → 2 new elective days with `elective_id`.

`17-minimal-change.test.ts`

- 5 valid future rows → all 5 preserved, 0 new (F-12).
- 2 of 5 invalid (preceptor availability removed) → 3 preserved, 2 replaced/regenerated, reasons reported.
- preview numbers equal apply numbers for the same input (F-12).

`18-constraints-enforced.test.ts` (F-05, F-20)

- not onboarded → not assigned (default) / assigned with `override_codes = ['not_onboarded']` when bypassed.
- `clerkship_sites` excludes the preceptor's site → not assigned.
- blackout inside range → date skipped.
- `is_available = 0` row → skipped; no row → skipped (document F-18 decision).
- health-system rule `enforce_same_system` keeps a student in one system across the clerkship.
- team `require_same_site` respected.
- student never double-booked across clerkships including via fallback (F-17).

`19-capacity-model.test.ts` (F-07, F-16)

- `max_students = 1`, no rule, existing assignment earlier in year → still schedulable on other days.
- `max_students = 2` → two students share a day, third does not.
- yearly rule 10 → 11th day refused with unmet reason.
- block-based respects daily capacity.
- site capacity rule daily/yearly.

`20-electives.test.ts` (F-09, F-10)

- required elective consumes its days; clerkship days = required − required-elective days.
- optional elective does **not** reduce clerkship days.
- elective uses elective strategy/config; elective preceptor pool; elective sites; fallback-only elective preceptor last.
- elective preceptors with no availability → unmet elective with reason, clerkship days still scheduled.

`21-block-based-real-calendar.test.ts` (F-15)

- weekday-only availability, range starting on a weekend, block 5 → two full weekday blocks.
- 14-day blocks with `allowPartialBlocks` false and 20 required → failure reason names the remainder.

`22-persistence.test.ts` (F-14)

- every generated row has `site_id` matching availability, `elective_id` for elective days, `source = 'generated'`, `locked = 0`, `override_codes` JSON; `updated_at` set.
- `generation_runs` row written with counts equal to the result; preview writes none.

`23-tenant-scope.test.ts` (F-02, F-03, F-04, F-27)

- two tenants with overlapping dates: A's run changes zero rows of B (count + ids), creates zero rows for B's students, never uses B's preceptors; B's future locked and unlocked rows untouched.
- a student present in two of A's schedules: generation for schedule 1 does not delete schedule 2's rows.
- `DELETE /api/schedules` (or its replacement) affects only the active schedule.
- summary for A counts only A's students.

`24-postgres-engine.test.ts` (add to `test:pg`)

- the `16`/`18`/`22` happy paths on PGlite, to catch boolean/integer drift (`04 §6`).

`25-scale.test.ts`

- 50 students × 8 clerkships × 60 preceptors × 200 days completes under a budget (assert wall time < N s and query count via a counting Kysely plugin) — protects the snapshot refactor's main win.

### 2.3 Route/API tests (real handlers, in-memory DB, no service mocks) — `src/routes/api/schedules/generate/`

Rewrite `server.test.ts` in the style of `tenant-isolation-api.test.ts` (Proxy-mocked `$lib/db`, real everything else):

- 401 without session (hook-level: extend `hooks.server.test.ts`); 403 without `autogen`; 400 when no active schedule; 400 for range outside the schedule; 400 for invalid dates / cutoff order; 400 for unknown bypass codes.
- Happy path per mode with response envelope shape: `summary`, `unmetRequirements[]` with reasons, `violations[]`, `regeneratedFrom`, `strategy`, `preserved*`, `deleted*`, `runId`.
- `preview: true` → identical plan numbers to a following apply; no DB writes (row count and `generation_runs` unchanged).
- Idempotency key: same key twice → second call returns the first run, no double delete.
- Error path: engine throws → 500 envelope, **no partial writes** (transaction rolled back).
- `GET /api/schedule/summary` (or runs endpoint) returns the last run's `violationStats`.
- `/api/scheduling/execute`: 403; ids outside the schedule → 404/400; or the route is deleted and the test asserts 404.
- Extend `stage2-gating.test.ts` with every gated route from `05-access-gating.md §1–2`, asserting the envelope, and `tenant-isolation-mutations.test.ts` with generate/clear.

### 2.4 End-to-end journeys (Playwright, `e2e/journeys/`)

Prerequisite: the seed must give `admin@example.com` data the engine can use — materialised `preceptor_availability` for the seeded patterns (F-29), a general capacity rule with a sane yearly cap (already there), and teams (already there). Keep dates anchored to today (`seed-schedule.ts`).

`autogen-first-run.spec.ts` (entitled)

1. Sign in as admin → Dashboard shows the "Configure auto-generation" item; follow it to `/generate`.
2. Readiness panel is clean; click **Generate schedule…** → choose Full → Preview → assert the impact numbers; Apply.
3. Lands on `/generate/results`: stats card shows students fully scheduled; unmet table empty or lists the seeded partially-complete student with a reason; violation card + suggestions render when present.
4. Calendar shows generated days with a distinct "generated" marker; a student page's requirement strip is 100 % for the generated clerkship; a preceptor page lists the days.
5. Schedule health panel shows **zero** new findings (proves constraints are honoured).

`autogen-regenerate.spec.ts` (entitled)

1. Starting from a generated schedule, lock one future assignment from the student page.
2. Mark a preceptor unavailable on two future days (availability page).
3. `/generate` → Smart from today, minimal-change → Preview shows "2 affected / N preserved" → Apply.
4. Assert the locked day is unchanged, the two affected days moved to another preceptor, unaffected days kept their ids (compare via `/api/students/[id]/schedule`), past days untouched.
5. Run Completion mode → "No gaps" message; add a new student → Completion → only that student receives days, existing rows unchanged.

`autogen-bypass.spec.ts` (entitled)

1. Student not onboarded at the only health system → Full run → student appears in unmet requirements with reason "not onboarded".
2. Rerun Completion with bypass "Student not onboarded" → student scheduled; the schedule-health panel lists the accepted override on those rows; override review shows them as generated.

`autogen-gating.spec.ts` (extends `gating.spec.ts`, non-entitled)

- No nav item, `/generate` → 403, `/generate/results` → 403, calendar has no Generate/Regenerate/Results buttons, assignment dialog has no Lock checkbox, `POST /api/schedules/generate` → 403 envelope, `DELETE /api/schedules` → 403 (or scoped no-op), `PUT /api/scheduling-config/global-defaults/outpatient` → 403.
- Manual scheduling still works for this user (guard against over-gating): create an assignment from the calendar.

`tenant-isolation.spec.ts` (extend existing)

- Tenant B's row count and ids before/after admin's Full run are identical (via B's authenticated API session).

`fresh-signup-to-generation.spec.ts` (entitled, brand-new account — the "real user" flow)

Register → create schedule via wizard → add health system + site → add clerkship (required days) → add two preceptors with weekly availability patterns → (Stage 2) create a team for the clerkship, set a capacity rule → add two students, onboard them → `/generate` → Generate → Results complete → export Excel contains generated rows. Same flow with the account **un**entitled stops at manual scheduling and never sees teams.

### 2.5 Component tests (Vitest browser project, existing but unused for this area)

`regenerate-dialog.svelte.test.ts` (replacing the phantom file cited in old docs): mode defaults by schedule age, cutoff bounds, bypass list only in completion mode, request body per mode, error rendering, success message per mode. `violation-stats-card.svelte.test.ts` and `suggestions-panel.svelte.test.ts`: render from a run record; suggestion links point at the preceptor/settings pages.

### 2.6 Parity and interoperability tests (the new layer)

These prove the six rules in `08-tier-parity-and-interop.md` §4. They are the tests that would have caught every `P-nn` finding, and they run on **both** entitlement levels wherever the tier is relevant.

**`src/routes/api/schedules/assignments/parity.integration.test.ts`** (real handlers, in-memory DB, Proxy-mocked `$lib/db` — the pattern from `tenant-isolation-api.test.ts`)

_Round-trip (rule 1)_

- For each generated row, build the equivalent `POST /api/schedules/assignments` payload from its own columns and assert the created row matches on `student_id, preceptor_id, clerkship_id, site_id, elective_id, date, status` (P-01, F-14).
- `POST` with an `elective_id` stores it; an `elective_id` belonging to another clerkship → 400; an unknown id → 400. Never a silent drop (P-01).
- Every generated row carries a `site_id`, so the round-trip payload is constructible at all.

_Editability of generated rows (rule 2)_

- Move (PATCH date), reassign, swap, delete, lock and unlock a generated row: each succeeds and preserves `elective_id`, `override_codes` and `source`.
- Move a generated row **carrying an accepted override** onto a day that re-triggers the same soft code → 422 with that code; the same request with `override_codes` → 200 and the code persisted (P-03). Today this is a bare 400.
- Reassign to an at-capacity preceptor → 422 `preceptor_capacity`; with the code accepted → 200 (P-03).
- Reassign an elective day outside the elective pool → 422 `preceptor_not_eligible`; accepted → 200 with the code recorded (P-04).
- Edit a generated row into a state create would refuse (site not allowed, outside range, not onboarded) → the same codes create returns (P-03).

_One validator (rule 3)_

- Table-driven: for a matrix of tuples (clean, blackout, unavailable, at-capacity, not onboarded, wrong site, double-booked, past, over-required) assert that `POST` dry-run, `PATCH` dry-run, `reassign` dry-run, `swap` dry-run, `validateSchedule` and the engine's `ProposalValidator` return the **same** code set. One helper, six callers, no exceptions.

_Tandem operation (rule 4)_

- Generate → hand-move one day, hand-add one day, lock one day → regenerate in each mode → the three user rows survive as the mode promises, no duplicate `(student, date)`, and the response reports every candidate skipped because a user row held its slot, with the blocking assignment id (P-09).
- Regenerate twice with no edits in between → identical row set (idempotence).
- A manual row that blocks a generated candidate appears in the unmet-requirement reason rather than vanishing (P-09, F-06).

_Concept completeness (rule 5)_

- Per-elective requirement counts: a 3-day required elective with 1 day assigned shows `1/3`, and the clerkship's plain days are unaffected (P-01).
- Effective capacity is the same number in the Stage 1 warning and in the engine (P-06, F-07).
- The eligibility predicate gives one answer to the dialog options endpoint, the engine snapshot and the readiness checklist for the same roster — including the "clerkship with no team" case (P-02).

_Validator equality across tiers (rule 6)_

- `GET /api/schedules/validation` returns identical payloads for an entitled and a non-entitled caller over the same data (P-06, G-10).
- Entitlement revoked mid-life: generated rows still editable, locks preserved but not toggleable, `/generate` 403 (G-10).

**Integration additions** (`src/lib/features/scheduling/integration/`)

- `26-manual-interop.test.ts`: the engine runs over a schedule that already holds manual, overridden and locked rows — occupancy respected, credit applied (F-01), skipped candidates reported, no existing row rewritten in place.
- `27-elective-parity.test.ts`: manually created elective days count as credit toward `minimum_days`; generated elective days feed the same counter; optional electives behave per the decided rule (F-09).

**E2E journeys** (`e2e/journeys/`), added to those in §2.4

- `autogen-then-edit.spec.ts` (entitled — the headline journey): generate → the calendar shows an "Auto" badge on generated days → open one in the unified dialog → move it (override conversation appears and is accepted) → reassign another → swap two → delete one → lock one → requirement strip and health panel stay consistent at each step → regenerate in completion mode → every hand edit survives and the run reports what it skipped.
- `electives-manual.spec.ts` (**non-entitled**): create an elective with a 3-day minimum → assign 2 elective days by hand through the dialog's elective picker → the student page shows `2/3` for the elective and the clerkship's plain days separately → the health panel flags nothing → the export names the elective.
- `parity-no-teams.spec.ts`: a Stage 1 user builds a schedule with preceptors on no team, then the account is granted `autogen` in the fixture → generation uses those preceptors instead of reporting "no preceptors available" (post-P-02 fix).
- `entitlement-revoked.spec.ts`: generated schedule, entitlement removed → all editing still works, `/generate` 403s, locks visible but frozen.

## 3. Scenario matrix (traceability)

| Finding                   | Unit               | Integration    | API                        | E2E                            |
| ------------------------- | ------------------ | -------------- | -------------------------- | ------------------------------ |
| F-01 credit               | planner            | 16             | mode happy paths           | regenerate, completion         |
| F-02/03/04/27 tenant      | —                  | 23             | tenant + gating            | tenant-isolation               |
| F-05/20 constraints       | validator          | 18             | —                          | first-run health panel = 0     |
| F-06 silent loss          | unmet-requirements | 19             | response shape             | results unmet reasons          |
| F-07/16 capacity          | capacity-resolver  | 19             | —                          | —                              |
| F-09/10 electives         | config-resolver    | 20             | —                          | first-run (seed has electives) |
| F-11 bypass               | validator          | 18             | 400 unknown codes          | bypass                         |
| F-12 minimal-change       | planner            | 17             | preview = apply            | regenerate                     |
| F-13 statistics           | statistics         | —              | —                          | results stats                  |
| F-14 persistence          | —                  | 22             | —                          | calendar site shown            |
| F-15/21 block             | block-based        | 21             | —                          | —                              |
| F-17 fallback double-book | team-continuity    | 18             | —                          | —                              |
| F-22 cutoff tz            | —                  | —              | default cutoff = UTC today | —                              |
| F-23 period               | —                  | —              | 400 no active schedule     | —                              |
| F-24/25 runs              | —                  | 22             | runs endpoint              | results violations             |
| F-26 CHECK                | config-resolver    | migration test | global-defaults PUT        | settings page save             |
| F-28/29 readiness/seed    | readiness          | —              | —                          | first-run                      |
| P-01 electives            | requirement counts | 27             | parity round-trip          | electives-manual               |
| P-02 teams                | eligibility        | 26             | options endpoint           | parity-no-teams                |
| P-03/04 one validator     | validator          | 26             | parity validator matrix    | autogen-then-edit              |
| P-05/06 availability/cap  | capacity-resolver  | 19             | parity rule 5              | —                              |
| P-07 read models          | —                  | 22             | calendar/export shape      | autogen-then-edit badge        |
| P-08 locks                | —                  | 26             | lock matrix                | entitlement-revoked            |
| P-09 skipped candidates   | unmet-requirements | 26             | tandem                     | autogen-then-edit              |
| P-10 write paths          | —                  | 22             | round-trip                 | —                              |
| P-12 / G-7..G-10 gating   | —                  | —              | gating table               | entitlement-revoked            |
| G-1..G-6 gating           | —                  | —              | gating table               | gating spec                    |

## 4. Coverage targets and enforcement

- Vitest `coverage.thresholds` for `src/lib/features/scheduling/**`, `src/routes/api/schedules/generate/**`, `src/routes/api/scheduling/**`: **lines 95 %, branches 90 %, functions 95 %** once dead code (`03 §8`) is deleted. Fail CI below threshold (`coverage.yml` already runs coverage; make it blocking).
- The one-validator matrix in §2.6 is a **release gate**: a mutation path that does not answer through the shared validator fails the suite by construction.
- Every `it()` name states the user-visible expectation ("student with 2 past days gets exactly 3 new days"), not the mechanism.
- `npm run test:e2e` must include the five autogen journeys; CI already runs Playwright. Move or delete `e2e/api` and `e2e/ui` so no one mistakes them for coverage.
- Add a lightweight **query-count assertion** plugin (Kysely `log` hook) used by `25-scale.test.ts` so the N+1 regression cannot come back.
- Postgres: `npm run test:pg` gains `24-postgres-engine.test.ts`.

## 5. Fixtures and seed changes required

1. `seed.ts`: after inserting patterns, call the pattern service to materialise `preceptor_availability` for the schedule range; add one required and one optional elective on a seeded clerkship with `elective_preceptors`; onboard all but one seeded student (the un-onboarded one drives the bypass journey).
2. `integration-helpers.ts`: helpers listed in §2.2; make `createTestPreceptors` **not** create a capacity rule implicitly, and add `createCapacityRule` calls only where a test is about capacity, so F-07 cannot hide again.
3. `tenant-fixture.ts`: add teams + availability + capacity for both tenants so generation can run for each.
4. A `withQueryCounter(db)` test utility.
5. `assignmentFixture(db, scheduleId)` producing the four row flavours the parity suite needs — plain manual, manual with an accepted override, generated, generated + locked — so every mutation test starts from all four without repeating setup.
6. A shared `expectSameViolationCodes(...paths)` helper backing the one-validator matrix, so a mutation path added later fails the suite until it is wired into the shared validator.
