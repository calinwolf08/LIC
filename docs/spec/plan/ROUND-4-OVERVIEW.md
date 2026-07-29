# Round 4 — API Authentication, Remaining Isolation Gaps & Test/UX Debt (Steps 34–40)

Round 3 (steps 25–33) closed the Stage-1 tenant boundary. Round 4 addresses what that work
surfaced but did not cover, plus the test and UX debt it deliberately deferred.

Read `GUIDELINES.md` first — it binds every step. `HANDOFF.md` carries the operational notes
(build/seed loop, tenant-boundary helpers, seeded schedule shape). This document is self-contained:
each step below has its own context, implementation notes and test requirements.

> **Admin/ops tooling is explicitly out of scope for this round** and will be planned separately.
> **Legacy `site_id IS NULL` backfill is also out of scope** — the database will be reset rather
> than migrated. The *seed* must be updated to match the post-Round-3 rules (step 36).

## Read this first: step 34 is a live security hole

Round 3 assumed every API route already required a session and only the *tenant* check was missing.
**That assumption was wrong.** `src/hooks.server.ts` resolves the session into `event.locals` but
**never rejects an unauthenticated request** — there is no global guard on `/api/*`. Each route is
individually responsible, and **14 route files with mutating handlers never reference `locals` at
all**. Those endpoints accept `POST`/`PUT`/`PATCH`/`DELETE` from anyone who can reach the server.

Step 34 is therefore not "hardening" — it is closing an unauthenticated write surface. Do it first
and do not batch it with anything else.

## Execution order

```
34 (API auth baseline — unauthenticated writes)   ← ship first, alone
   │
35 (tenant-scope Stage-2 config + student-schedule leak)
   │
   ├─> 36 (seed refresh: assignments with sites, Tenant B parity)
   │      │
   │      ├─> 37 (component tests: picker + calendar grid)
   │      └─> 38 (e2e login hydration + flake elimination)
   │
   ├─> 39 (empty / no-active-schedule states)
   └─> 40 (calendar colour scale + health panel IA)
```

| Step | Title | Depends on | Priority |
|---|---|---|---|
| 34 | API authentication baseline | — | **Critical (security)** |
| 35 | Tenant-scope Stage-2 config routes + student-schedule leak | 34 | **High (privacy)** |
| 36 | Seed refresh for post-Round-3 rules | 35 | High (unblocks 37/38) |
| 37 | Component tests: date picker + calendar grid | 36 | Medium |
| 38 | E2E login hydration signal + flake elimination | 36 | Medium |
| 39 | Empty and no-active-schedule states | 35 | Medium |
| 40 | Calendar colour scale + health panel information architecture | — | Low |

## Root causes (verified in code, this session)

1. **No global API authentication.** `src/hooks.server.ts:8-46` resolves `auth.api.getSession(...)`
   into `event.locals.session` and always calls `resolve(event)`. Nothing returns 401. Routes that
   never read `locals` are open. **Step 34.**
2. **An `E2E_TESTING` bypass ships in the production bundle.** `hooks.server.ts:11-20` and
   `src/routes/(app)/+layout.server.ts:12` skip auth entirely when `process.env.E2E_TESTING === 'true'`,
   and read entitlements from `E2E_ENTITLEMENTS`. A stray env var in production disables auth
   app-wide. **Step 34.**
3. **Round 3 guarded Stage-1 routes only.** Every `scheduling-config/*` route has **zero** tenant
   guards; nine of them additionally have no `requireAutogen`. **Step 35.**
4. **`getStudentScheduleData` leaks the student record.** `schedule-views-service.ts:49-53` selects
   `id, name, email` by `studentId` with **no** schedule join before scoping the rest of the payload,
   so `/api/students/[id]/schedule` returns another tenant's student name and email. **Step 35.**
5. **The seed predates the required-site rule.** The admin seed creates **no assignments at all**
   (only Tenant B gets one), so the calendar, schedule-health, and override surfaces are empty on a
   fresh seed and cannot be exercised by hand or by e2e. **Step 36.**
6. **Component-test infrastructure exists but is unused.** `vite.config.ts` defines a `client`
   Vitest project (browser/chromium, `src/**/*.svelte.{test,spec}.ts`, `vitest-setup-client.ts`) —
   there are no component tests for the two components Round 3 changed most. **Step 37.**

---

# Step 34 — API Authentication Baseline

## Objective
Every non-public API endpoint requires a valid session, enforced centrally so a new route cannot
forget. Remove the environment-variable auth bypass from the production path.

## Context (verified in code)
- `src/hooks.server.ts` never rejects: it resolves the session and calls `resolve(event)` regardless.
- These **14 route files expose a mutating handler and never reference `locals`**:
  ```
  api/blackout-dates/+server.ts
  api/blackout-dates/[id]/+server.ts
  api/blackout-dates/conflicts/+server.ts
  api/preceptors/[id]/patterns/generate/+server.ts
  api/preceptors/teams/[id]/+server.ts
  api/preceptors/teams/validate/+server.ts
  api/schedules/+server.ts
  api/scheduling-config/electives/+server.ts
  api/scheduling-config/electives/[id]/+server.ts
  api/scheduling-config/electives/[id]/preceptors/+server.ts
  api/scheduling-config/electives/[id]/sites/+server.ts
  api/scheduling-config/requirements/+server.ts
  api/scheduling-config/requirements/[id]/+server.ts
  api/scheduling-periods/+server.ts
  ```
  Example: `scheduling-config/electives/[id]/+server.ts:77` is
  `export const PATCH: RequestHandler = async ({ params, request })` — no session, no gate.
- `E2E_TESTING === 'true'` bypasses auth for all non-`/api/auth` API routes and is also read by
  `(app)/+layout.server.ts`.

## Implementation

1. **Enforce authentication in `hooks.server.ts`.** After resolving the session, if the request path
   starts with `/api/` and is **not** in an explicit public allowlist, return
   `401 {success:false,error:{message:'Authentication required'}}` — the standard envelope, not a
   bare `Response`.
   - Allowlist by exact prefix only: `/api/auth/` (better-auth owns it) plus any genuinely public
     health/version endpoint. Enumerate it in one exported constant next to the handler so the list
     is reviewable; default is **deny**.
   - Do the same for page routes if `(app)/+layout.server.ts` is the only thing protecting them —
     confirm which, and state the answer in the PR.
2. **Delete the `E2E_TESTING` bypass from `hooks.server.ts` and `(app)/+layout.server.ts`.** The e2e
   suite already signs in through the real login form (`e2e/journeys/helpers.ts`) and the API tests
   drive handlers directly with a fabricated `locals`. Any e2e that relied on the bypass must obtain
   a real session instead — `e2e/ui/preceptor-management.ui.test.ts:241` is the known caller; grep
   for others. If some suite genuinely cannot, gate the bypass behind `import.meta.env.DEV` **and**
   an explicit non-production check, and say why in the PR. Shipping it as-is is not an option.
3. **Keep per-route checks as defence in depth.** The central guard is the backstop; routes that
   need the user id still read `locals.session.user.id`. Do **not** delete existing per-route checks.
4. **Audit sweep, recorded in the PR.** Re-run the sweep and show it clean:
   ```
   for f in $(find src/routes/api -name "+server.ts" | grep -v "/auth/"); do
     grep -qE "export const (POST|PUT|PATCH|DELETE)" "$f" && ! grep -q "locals" "$f" && echo "$f"
   done
   ```
   Files may legitimately remain on that list *after* the central guard exists — the point of the
   sweep is that each remaining one is a conscious decision, not an oversight. List them with a
   one-line justification each.

## Testing
- **Unit — the hook:** a request to `/api/students` with no session returns **401**; with a session,
  passes through. `/api/auth/sign-in/email` is never blocked. A path that merely *contains* `/api/`
  later in the string (e.g. `/dashboard/api/x`) is not treated as public.
- **API integration — table-driven over every mutating endpoint:** with `locals.session = null`,
  each returns **401** and **writes nothing** (re-read the target table and compare row counts
  before/after — status alone is not proof).
- **Regression:** the same calls with a valid session still succeed (no over-blocking). Reuse the
  two-tenant fixture so the authenticated case is also tenant-correct.
- **E2E:** `page.request.post('/api/blackout-dates', …)` from a **logged-out** context returns 401;
  the authenticated path still works. Add this to `tenant-isolation.spec.ts` or a new
  `api-auth.spec.ts`.
- **Proof it mattered:** run the new 401 tests against the pre-fix commit and record that they fail
  (they should return 200/201). A security test that never failed is not evidence.

## Acceptance criteria
- [ ] Unauthenticated requests to any non-allowlisted `/api/*` route return 401 and mutate nothing.
- [ ] The allowlist is explicit, small, and default-deny.
- [ ] `E2E_TESTING` no longer disables auth in a production build.
- [ ] The sweep is recorded with a justification for every remaining entry.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 35 — Tenant-Scope Stage-2 Config Routes & Close the Student-Schedule Leak

## Objective
Finish the tenant boundary: the Stage-2 configuration surface and the one confirmed Stage-1 leak
that survived Round 3.

## Context (verified in code)
- **Every** `scheduling-config/*` route has zero tenant guards. Nine also lack `requireAutogen`:
  `clerkships/[id]`, `electives/*` (6 files), `requirements/*` (2 files). The rest
  (`capacity-rules/*`, `fallbacks/*`, `global-defaults/*`) gate on `autogen` but not on tenancy —
  so two entitled users can still reach each other's configuration.
- **`getStudentScheduleData` (`schedule-views-service.ts:49-53`)** selects the student by id with no
  schedule join. `/api/students/[id]/schedule` therefore returns another tenant's student **name and
  email** even though the schedule payload itself is scoped. This is a real, if narrow, leak.

## Implementation

1. **Close the student-schedule leak first** (smallest, highest certainty). In
   `/api/students/[id]/schedule/+server.ts`, call `requireActiveScheduleId(locals)` then
   `assertEntityInSchedule(db, scheduleId, 'student', params.id)` **before** touching the service, so
   a cross-tenant id 404s. Additionally scope the student lookup inside `getStudentScheduleData`
   itself (join `schedule_students`) so the service is safe regardless of caller — belt and braces,
   because this is the second time a caller-only guard has been missed.
2. **Classify each scheduling-config resource by owner** before writing guards; record the table in
   the PR. Each is one of:
   - **Schedule-scoped** — reachable from an entity in a `schedule_*` junction
     (`electives` → `clerkship_id`; `requirements` → `clerkship_id`; `capacity-rules` →
     `preceptor_id`/`clerkship_id`; `fallbacks` → preceptor ids; `clerkships/[id]` → clerkship).
     Guard with `assertEntityInSchedule` on the parent entity.
   - **Genuinely global** — `global-defaults/*` are installation-wide defaults with no owner column.
     Leave them tenant-unguarded but keep `requireAutogen`, and **say so explicitly** in the PR with
     the reason. If they should be per-tenant, that is a schema change and belongs in its own step —
     do not smuggle it in here.
3. **Add the missing `requireAutogen`** to the nine routes that lack it *if* they are Stage-2
   surfaces. Check first: electives and requirements may legitimately be Stage-1 clerkship
   configuration. Whichever way it lands, the answer must be deliberate and stated — a route that is
   Stage 1 gets a tenant guard only; a Stage-2 route gets both.
4. **Guard order is fixed**: `requireAutogen` (if Stage 2) → `requireActiveScheduleId` →
   `assertEntityInSchedule` → validation → work. 404 for cross-tenant, never 403.

## Testing
- **API integration, two-tenant fixture, table-driven per endpoint:** as A, every `GET` against B's
  config id returns **404**; every mutating call returns **404** and B's row is byte-identical
  afterwards; the same calls against A's own ids succeed.
- **Unit — `getStudentScheduleData`:** called with tenant A's schedule id and tenant B's student id,
  returns `null` (not a payload containing B's name/email). Called with A's own student, unchanged.
- **API:** `/api/students/[id]/schedule` returns 404 for B's student id, and the response body does
  not contain B's name or email (assert on the body text, not just the status).
- **Gating regression:** extend `src/routes/api/stage2-gating.test.ts` with any route that newly
  gains `requireAutogen`, so a non-entitled caller gets 403.
- **Proof it mattered:** run the new cross-tenant config tests and the student-schedule test against
  the current commit before fixing; record the failures.

## Acceptance criteria
- [ ] No scheduling-config endpoint returns or mutates another tenant's row.
- [ ] `/api/students/[id]/schedule` no longer discloses a cross-tenant student's name/email.
- [ ] `getStudentScheduleData` is safe independent of its caller.
- [ ] Every route is classified schedule-scoped vs global, in writing, with Stage-1/Stage-2 stated.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 36 — Seed Refresh for the Post-Round-3 Rules

## Objective
Make a freshly seeded database exercise the features Round 3 changed. Today the admin account has
**no assignments**, so the calendar, schedule health, and override review are all empty on first run
— nothing to look at by hand, and nothing for e2e to assert against.

## Context (verified in code)
- `src/lib/db/scripts/seed.ts` creates health systems, sites, clerkships, 10 students, 8 preceptors
  and 4 teams — and **never inserts into `schedule_assignments`** for the admin. Only
  `seedSecondTenant` creates one (for Tenant B).
- Site is now **required** on create (`api/schedules/assignments/+server.ts`), so any seeded
  assignment must carry a `site_id` consistent with the preceptor's site links.
- The colour palette has **8** entries (`entity-colors.ts`) and the seed has **10** students, so a
  realistic seed also exercises the palette-repeat case step 40 addresses.

## Implementation

1. **Seed assignments for the admin tenant**, written directly via Kysely (not the API), each with a
   valid `site_id` drawn from the preceptor's `preceptor_sites` link so the data is self-consistent:
   - a **clean multi-day block** for one student (exercises the normal calendar and progress bars);
   - a student **partially complete** against a clerkship's `required_days` (exercises the
     requirement strip and the "days left" badge);
   - a student **fully complete** (exercises the completed state);
   - a **double-booked preceptor-day across 4 consecutive days** with `override_codes` containing
     `preceptor_capacity` (exercises step 32's "4 findings, not 8" and the grouped override row);
   - one **`not_onboarded` override that is already resolved** (the student *is* onboarded), so the
     active/resolved toggle has something to show.
   Anchor every date with `fromToday()` / the `TEST_SCHEDULE` range from `seed-schedule.ts` so the
   data always straddles today — never hard-code a calendar date.
2. **Keep it idempotent.** Follow the existing pattern: check for an existing marker row and return
   early. Re-running `npm run db:seed` must not duplicate assignments.
3. **Give Tenant B the same shape at smaller scale** — it already has one assignment; add a second
   student and one override so isolation tests have more than a single row to miss.
4. **Do not add a `site_id` backfill migration.** Out of scope by decision: the database is reset,
   not migrated.
5. **Document the seeded scenario** in `README.md` (a short list of what the demo data demonstrates)
   so a new user knows what they are looking at.

## Testing
- **Unit/integration:** after running the seed helper against a migrated in-memory DB —
  every seeded assignment has a non-null `site_id`; that site is linked to the assignment's
  preceptor via `preceptor_sites`; every assignment's student is in `schedule_students` for the
  owning schedule; running the seed twice produces identical row counts (idempotency).
- **Integration — the scenario actually demonstrates what it claims:** `validateSchedule` on the
  seeded admin schedule reports exactly **4** `preceptor_capacity` findings (not 8);
  `listOverrides` returns the capacity override as `active` and the onboarded one as `resolved`;
  `groupOverrides` collapses the 4-day capacity run into **one** row with `days: 4`.
- **E2E smoke:** on a cold seeded DB, `/calendar` renders at least one assignment cell containing a
  seeded student's name, and Schedule health shows a non-zero conflict pill.
- Re-run the full existing e2e suite — several journeys assume a *quiet* seed; any that break
  because data now exists must be made self-isolating (create their own entities) rather than
  papered over by shrinking the seed.

## Acceptance criteria
- [ ] A fresh seed produces a calendar, health panel and override list with content.
- [ ] Every seeded assignment satisfies the required-site rule and is internally consistent.
- [ ] The seed is idempotent and date-anchored to the schedule range.
- [ ] The seeded scenario is documented in `README.md`.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 37 — Component Tests: Date Picker & Calendar Grid

## Objective
Cover the *rendered* behaviour of the two components Round 3 changed most. Steps 29 and 30 shipped
with unit coverage of the pure logic and the APIs, but the visual contracts — the ones that were
actually reported as bugs — are asserted only indirectly through e2e.

## Context (verified in code)
- The `client` Vitest project already exists (`vite.config.ts`): browser environment, Playwright
  chromium provider, `include: ['src/**/*.svelte.{test,spec}.{js,ts}']`, setup
  `vitest-setup-client.ts`. **No component tests exist yet.**
- `assignment-date-picker.svelte` exposes `data-state` (`available|unavailable|unset|taken|full|busy|
  blackout|out-of-range`), `data-selected`, and `data-testid="day-<date>"` /
  `data-testid="selected-conflicts"`.
- `schedule-calendar-grid.svelte` exposes `data-testid="calendar-assignment"` and `data-color`,
  and takes `mode` and `colorBy` props.

## Implementation

1. **`assignment-date-picker.svelte.test.ts`** — mount with a hand-built `dayStates` map (no network):
   - one day per state; assert each cell's `data-state`.
   - **The reported bug, asserted directly:** a day that is both `selected` **and** booked keeps its
     conflict styling *and* gains the selection ring — assert `data-state="taken"` **and**
     `data-selected="true"` **and** that the class list still contains the amber state class. This is
     the regression that must fail if anyone reintroduces the early-return.
   - `selected-conflicts` lists exactly the conflicting members of a multi-day selection, with the
     right reason strings, and is absent when the selection is clean.
   - the legend renders an entry for every state the grid can produce (drive it from the same list).
2. **`schedule-calendar-grid.svelte.test.ts`**:
   - `mode="schedule"` renders student, clerkship and preceptor in the cell; `mode="student"` still
     renders clerkship + preceptor and omits the student (guards against regressing the student page).
   - `colorBy="student"`: two assignments for the same student share `data-color`; two different
     students differ; the value is stable across a re-render.
   - `colorBy="clerkship"` (the default) keeps the service-provided colour.
   - the `+N more` affordance appears past `fitLimit` and its drawer inherits the same labels.
3. **Wire it into the scripts.** Confirm `npm run test:unit` runs *both* Vitest projects; if it only
   runs `server`, add an explicit script (e.g. `test:unit:client`) and include it in `npm test` so
   these cannot silently stop running.

## Testing
This step *is* testing. Required evidence:
- Both component test files pass locally against the `client` project.
- Each new test **fails** when the corresponding fix is reverted — demonstrate at least for the
  selected-and-conflicting case and the `mode="schedule"` label case, since those are the two
  reported bugs.
- No increase in flakiness: run the client project twice with `--retries=0`.

## Acceptance criteria
- [ ] Picker states, the selected-and-conflicting composition, the conflict list and the legend are
      covered by mounted-component assertions.
- [ ] Grid mode and colour semantics are covered, including the student-page no-regression case.
- [ ] The client project runs as part of the normal test command.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 38 — E2E Login Hydration Signal & Flake Elimination

## Objective
Make `login()` deterministic. It is the first call in nearly every journey, so when it flakes the
whole suite is unusable — which is exactly what happened at the end of Round 3.

## Context (verified in code)
- `e2e/journeys/helpers.ts` fills the form then clicks **blind**, retrying on a timeout, because the
  submit handler only exists after hydration. Round 3 widened the retry window; that reduces the
  failure rate but does not remove the race.
- During the Round 3 e2e pass the browser sign-in stopped completing under container load while
  `POST /api/auth/sign-in/email` and every authenticated page still responded correctly to `curl` —
  i.e. the failure was purely "the click landed before the handler existed", not a product defect.
- Login page: `src/routes/(public)/login/+page.svelte`.

## Implementation

1. **Publish an explicit hydration signal.** In the login form, set a marker once the component has
   mounted and the submit handler is attached — e.g. `data-hydrated="true"` on the `<form>` (an
   `$effect`/`onMount` assignment). Prefer this over disabling the button, which changes real UX for
   the sake of tests; if the button must be disabled pre-hydration, that is a legitimate product
   improvement — make it deliberately and note it.
2. **Wait for the signal, then click once.** Rewrite `login()` to
   `await page.locator('form[data-hydrated="true"]').waitFor()` before filling and clicking. Keep a
   single bounded retry for genuine navigation failures, but the blind retry loop goes away.
3. **Apply the same pattern to the register form** if `registerNewUser()` shows the same race.
4. **Sweep for other blind-click races.** `grep` the journeys for `waitForTimeout` and for
   click-then-expect-URL patterns; replace each with a real signal (element state, response, or URL)
   per `GUIDELINES.md`. Record what you changed.

## Testing
- **E2E:** `login()` succeeds on the **first** click — assert the retry loop did not engage (e.g.
  count clicks via an instrumented helper, or assert navigation within a single short timeout).
- **Stability:** run the three cross-cutting journeys (`end-to-end`, `entity-consistency`,
  `override-lifecycle`) plus `tenant-isolation` with `--repeat-each=3 --retries=0`, from a cold
  seeded database, and record zero flakes.
- **Full suite, twice, cold, `--retries=0`** — this is the gate Round 3 could not complete in the
  degraded container, and it is the real acceptance evidence for this step.

## Acceptance criteria
- [ ] The login helper waits on an explicit hydration signal instead of retrying blind clicks.
- [ ] Full Playwright suite green from a cold seeded DB, twice, zero retries.
- [ ] Remaining `waitForTimeout` calls in journeys are removed or individually justified.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 39 — Empty and No-Active-Schedule States

## Objective
When a surface has nothing to show, say why and what to do next. Round 3's scoping work made several
loaders correctly return `[]` when there is no active schedule — and the pages now render blank.

## Context (verified in code)
- `(app)/locations/+page.server.ts` returns `{ healthSystems: [], sites: [] }` when
  `getActiveScheduleId` is null. `(app)/calendar/+page.server.ts` resolves empty filter lists the
  same way. `(app)/dashboard/+page.server.ts` reports zero counts.
- These are *correct* (never fall back to a global list) but produce an unexplained empty screen,
  which reads as breakage rather than "you have no schedule selected".
- `EmptyState` already exists as a shared primitive (`GUIDELINES.md`) — this is composition, not new
  UI vocabulary.

## Implementation

1. **Distinguish the two empty cases** — they need different copy and different actions:
   - **No active schedule:** "Select or create a schedule to get started", with a primary action into
     the schedule switcher / `Manage schedules`. Applies to dashboard, calendar, locations, students,
     preceptors, clerkships.
   - **Active schedule, no data yet:** the existing per-entity empty copy ("No students yet — add
     one"), which several lists already have. Audit and fill the gaps.
2. **Derive the distinction from the loader**, not from `items.length === 0` in the component — pass
   an explicit flag (e.g. `hasActiveSchedule`) so the component cannot guess wrong.
3. **Reuse `EmptyState`** everywhere; no bespoke markup. One shared "no active schedule" component
   used by all six surfaces, so the copy changes in one place.
4. **The dashboard is the priority** — it is the landing page and the most likely place a new or
   schedule-less user first sees blankness. Its setup checklist already exists; make sure the
   no-schedule case leads into it rather than showing zeros.

## Testing
- **Component:** with `hasActiveSchedule: false`, each surface renders the no-schedule empty state
  and its call to action; with `hasActiveSchedule: true` and no rows, it renders the per-entity empty
  copy instead; with rows, neither appears.
- **E2E:** a user whose `active_schedule_id` is null sees the no-schedule state on dashboard,
  calendar and locations, and the primary action navigates to schedule management. Build this from a
  freshly registered account (`fresh-signup.spec.ts` already has the pattern) rather than by mutating
  a seeded user.
- **Regression:** the seeded admin (who *has* a schedule and, after step 36, data) sees neither empty
  state.

## Acceptance criteria
- [ ] "No active schedule" and "no data yet" are visually and textually distinct everywhere.
- [ ] The distinction comes from the loader, not from a length check in the component.
- [ ] One shared component owns the no-schedule copy.
- [ ] Definition of done per `GUIDELINES.md`.

---

# Step 40 — Calendar Colour Scale & Health Panel Information Architecture

## Objective
Two polish items deferred from Round 3, both about legibility at realistic scale.

## Context (verified in code)
- `entity-colors.ts` has an **8-colour** palette; the seed has **10** students, so schedule-wide
  colour-by-student repeats. The student name is always rendered in the cell, so colour is never the
  only identifier (accessibility is satisfied) — but two students sharing a colour is still
  misleading at a glance.
- The health panel now explains its two sections in copy (step 32), but they remain structurally
  asymmetric: "Conflicts by type" is live validation output while "Overrides" is stored codes
  re-evaluated. Testers may still read it as one thing split oddly in two.

## Implementation

1. **Grow and disambiguate the colour scale.** Extend the palette (12–16 perceptually distinct
   entries) and, where the palette must still repeat, add a second dimension — e.g. student initials
   in a chip on the cell, so identity never depends on hue alone. Keep the hash keyed on the **id**
   so renames do not recolour, and keep the existing `getStudentColor` signature.
   - Check contrast for the text rendered on each background (the cell uses `{color}20` fill with
     `{color}` text); drop or adjust any entry that fails.
2. **Add a legend to the schedule-wide calendar** mapping colour → student, for the students visible
   in the current range. Collapse it behind a disclosure if it gets long.
3. **Health panel: decide between two options and implement one**, stating the reasoning in the PR:
   - **(a) Keep two sections**, but make the relationship explicit in the UI — e.g. show, on each
     override row, whether it is currently suppressing a conflict; or
   - **(b) Merge into a single "Issues" list** with a `type` column (`conflict` / `accepted
     exception`) and a status, filterable by both — one list, one mental model.
   Prefer (b) if user testing shows the split is still confusing; prefer (a) if the audit-trail
   framing is valued. Do not build both.
4. This step is **user-facing polish with no security or correctness impact** — if time is short it
   is the one to defer.

## Testing
- **Unit:** the expanded palette is still deterministic per id, still distributes across the whole
  palette, and every entry is a valid hex; the initials helper handles single-word, multi-word and
  empty names.
- **Component:** two students with different ids render different chips/colours; the legend lists
  exactly the students present in the rendered range.
- **Component/E2E for the health panel:** whichever option is chosen, assert the resulting structure
  — for (b), that a conflict and an accepted exception appear in one list with correct type labels
  and that each filter narrows correctly.
- **Accessibility:** a cell's identity is readable with colour removed (assert the name/initials are
  present in the DOM, not conveyed by style alone).

## Acceptance criteria
- [ ] Colour repeats are mitigated and identity never depends on hue alone.
- [ ] The schedule-wide calendar has a legend.
- [ ] The health panel's structure is settled deliberately and documented.
- [ ] Definition of done per `GUIDELINES.md`.

---

## Standing requirements (all steps)

- `GUIDELINES.md` binds: shared primitives only, no hand-rolled modals, no `window.confirm` /
  `window.location.reload()`, Kysely through feature services, standard `{success,data}` /
  `{success,error}` envelope, Stage-2 gating enforced **server-side**.
- **Write the failing test first** for every security and bug fix, and record that it fails on the
  pre-fix commit. Steps 34 and 35 are security work — an untested fix is not done.
- Tenant boundary helpers live in `src/lib/api/schedule-context.ts`; the two-tenant fixture is
  `src/lib/testing/tenant-fixture.ts`. Reuse both; do not write a second implementation.
- After any migration: `npm run db:types`, and update the hand-built test schemas that create
  `schedule_assignments` (grep `createTable('schedule_assignments')`).
- Quality gates, green before each commit: `npx vitest run`,
  `npx svelte-check --tsconfig ./tsconfig.json`, `npm run build`, and `npx playwright test` for
  steps that touch the UI.
- Commit and push each step separately, with the audit/classification tables the step asks for in
  the commit body or PR description.
