# Step 26 — Tenant Isolation: Every Read Scoped to the Active Schedule

## Objective
No route, loader, service or API may return data belonging to another user. This is a privacy
defect, not a display bug: fix it systematically and lock it with tests that fail loudly if a future
query forgets to scope.

## Context (verified in code)
Round 2 scoped the schedule *range*; it never scoped the *entity sets*. Confirmed leaks:

| Where | Problem |
|---|---|
| `(app)/dashboard/+page.server.ts:42-59` | All four totals are bare `selectFrom('students'\|'preceptors'\|'clerkships'\|'schedule_assignments')` with no junction join |
| `(app)/locations/+page.server.ts:5-9` | `selectFrom('health_systems')` + `siteService.getAllSites()`; the `load` doesn't even receive `locals` |
| `(app)/calendar/+page.server.ts:43-45` | `getStudents(db)` / `getPreceptors(db)` / `getClerkships(db)` — the unscoped variants — feed filter dropdowns |
| `calendar-service.ts` `getEnrichedAssignments` | Filters on date + optional ids only; never joins `schedule_students`, so all users' assignments render |
| Student → Progress tab | Inherits whatever the clerkship source returns; verify it uses the scoped path (`requirement-status.ts:69-73` *is* scoped — confirm the Progress tab reads from there and not a global list) |

Scoped variants already exist (`getStudentsBySchedule`, `getPreceptorsBySchedule`, …) — the callers
just don't use them.

## Prerequisites
Step 25 (so the fix can be verified by hand with two accounts).

## Scope
**In:** every read path — page loaders, API GETs, services. **Out:** mutations (step 27).

## Implementation

1. **Establish one helper and use it everywhere.** In `src/lib/api/schedule-context.ts` add
   `requireActiveScheduleId(locals): Promise<string>` that throws a typed error when there is no
   session or no active schedule. Loaders and API routes call this and pass the id down. No service
   should resolve the schedule internally.
2. **Audit every read.** Work the list mechanically rather than by memory:
   ```
   grep -rn "selectFrom('students'\|selectFrom('preceptors'\|selectFrom('clerkships'\|selectFrom('sites'\|selectFrom('health_systems'\|selectFrom('schedule_assignments'\|selectFrom('preceptor_teams'" src/routes src/lib --include=*.ts | grep -v "\.test\."
   ```
   For each hit, confirm it either (a) joins the matching `schedule_*` junction filtered by the
   caller's schedule id, or (b) is itself a junction/lookup query already constrained by one. Record
   the audit result in the PR description — reviewers need to see the sweep happened.
3. **Fix the known callers:**
   - Dashboard: count through the junctions (`schedule_students`, `schedule_preceptors`,
     `schedule_clerkships`); count assignments via `schedule_assignments` joined to
     `schedule_students` for the active schedule.
   - Locations: take `locals`, resolve the schedule, and return only health systems/sites joined
     through `schedule_health_systems` / `schedule_sites`. Replace `siteService.getAllSites()` at
     this call site with a scoped `getSitesBySchedule`.
   - Calendar page loader: swap to the `*BySchedule` variants.
   - `getEnrichedAssignments`: take a required `scheduleId` and join
     `schedule_students ss ON ss.student_id = sa.student_id AND ss.schedule_id = ?`. Update
     `/api/calendar` to resolve and pass it. (Remember: `schedule_assignments` has no `schedule_id`
     column — student membership is the only correct path.)
   - Student Progress tab: confirm its clerkship list comes from the scoped requirement-status
     service; fix the loader if it fetches a global list.
4. **Detail reads too, not just lists.** `GET /api/students/[id]`, `/preceptors/[id]`,
   `/clerkships/[id]`, `/sites/[id]`, `/health-systems/[id]` and the `[id]/schedule` variants must
   404 when the entity is not in the caller's active schedule. **Return 404, not 403** — a 403
   confirms the row exists, which is itself a disclosure.
5. **Make the boundary hard to forget.** Add
   `src/lib/features/<x>/services/…` scoped functions as the *only* exported list functions where
   practical: mark the unscoped `getStudents`/`getPreceptors`/`getClerkships`/`getAllSites` as
   `@deprecated — unscoped; use the *BySchedule variant` and leave them only for the seed/scripts.
   A reviewer grepping for the deprecated name should find no route callers.

## Testing
This is the regression net for a privacy defect; treat it as the deliverable.

- **Integration — a reusable two-tenant fixture.** Add
  `src/lib/testing/tenant-fixture.ts`: creates user A and user B, each with a schedule and its own
  student, preceptor, clerkship, site, health system and one assignment. Then, for **every** scoped
  read function, assert: called with A's schedule id it returns exactly A's rows, and **none of B's
  ids appear anywhere in the result** (assert on ids, not counts — counts pass by accident).
- **API tests:** for each list endpoint, a request authenticated as A never contains B's ids. For
  each detail endpoint, requesting B's entity id as A returns **404**.
- **Unit:** `requireActiveScheduleId` throws with no session and with no active schedule.
- **E2E (`tenant-isolation.spec.ts`):** seed/create two accounts with distinguishable names
  (`Tenant A …` / `Tenant B …`). Signed in as A, walk Dashboard, Students, Preceptors, Clerkships,
  Locations, Calendar (both views) and a student's Progress tab, asserting **`Tenant B` appears
  nowhere on any page** and that A's dashboard totals equal A's own entity counts. Deep-link to one
  of B's entity URLs and expect a not-found state.
- Keep the e2e assertion phrased as "B's marker string is absent from the page", so it catches
  leakage through any widget, not just the ones we thought to check.

## Acceptance criteria
- [ ] No read path returns another user's rows; the audit grep is clean or justified line by line.
- [ ] Dashboard totals match the signed-in user's own data.
- [ ] Calendar (grid and list), Locations, and the Progress tab show only the caller's data.
- [ ] Cross-tenant detail reads return 404, not 403.
- [ ] The two-tenant fixture covers every scoped read function, asserting on ids.
- [ ] Definition of done per GUIDELINES.md.
