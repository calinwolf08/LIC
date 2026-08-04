# Step 27 — Tenant Isolation: Every Mutation Ownership-Guarded

## Objective
A user must not be able to change or delete anything they do not own. Reads are step 26; this step
closes the write side, which is the more damaging half.

## Context (verified in code)
`grep`ing the entity mutation routes for `getActiveScheduleId` or any `schedule_*` junction returns
**zero matches** for all of:

```
src/routes/api/students/[id]/+server.ts
src/routes/api/preceptors/[id]/+server.ts
src/routes/api/clerkships/[id]/+server.ts
src/routes/api/sites/[id]/+server.ts
src/routes/api/health-systems/[id]/+server.ts
```

So `PATCH`/`DELETE` operate on any row by id, for any authenticated caller. The same question must
be asked of assignment routes (`/api/schedules/assignments/[id]`, `…/reassign`, `…/swap`,
`/api/schedules/assignments/side-effects`), the preceptor sub-resources
(`…/[id]/availability`, `…/patterns*`), `/api/student-onboarding`,
`/api/scheduling-periods/[id]` (+ `/activate`, `/duplicate`, `/entities`) and the
scheduling-config routes — audit them all, don't assume.

## Prerequisites
Step 26 (shared `requireActiveScheduleId` helper and the two-tenant fixture).

## Scope
**In:** every write path (POST that targets an existing row, PATCH, DELETE) across the API.
**Out:** read paths (step 26).

## Implementation

1. **One guard, used everywhere.** In `src/lib/api/schedule-context.ts` add:
   ```ts
   assertEntityInSchedule(db, scheduleId, kind, entityId): Promise<void>
   ```
   where `kind` is `'student' | 'preceptor' | 'clerkship' | 'site' | 'health_system' | 'team'`. It
   checks the matching `schedule_*` junction and throws `NotFoundError` (→ **404**) when absent.
   404 rather than 403 deliberately: 403 confirms the row exists.
2. **Apply it as the first statement after validation** in every mutating handler for the five
   entity types above. Assignments need the transitive rule: an assignment is owned iff its
   `student_id` is in `schedule_students` for the caller's schedule (there is no `schedule_id`
   column). Preceptor availability/patterns are owned iff the preceptor is in
   `schedule_preceptors`. Onboarding rows are owned iff the student is in `schedule_students`.
3. **Schedules themselves** are owned directly: `scheduling_periods.user_id = session.user.id`.
   Guard `PATCH`/`DELETE`/`activate`/`duplicate`/`entities` on that column. Note step 15 already
   fixed `user_id` being written on create — verify it is set for every creation path before relying
   on it.
4. **`side_effects` need the same guard.** `applyOverrideSideEffects` can bump a preceptor's
   capacity, write availability, or delete another assignment — each target must be ownership-checked
   before the transaction runs, or the override flow becomes a way around the guards.
5. **Audit sweep, recorded in the PR:**
   ```
   grep -rln "export const \(PATCH\|DELETE\|PUT\)" src/routes/api | sort
   ```
   For each file, note which guard applies (entity junction / student-transitive / schedule owner /
   none-needed-because-global-config). Anything left unguarded must be justified in writing.

## Testing
- **API integration, using the step-26 two-tenant fixture — for every mutating endpoint:**
  - as A, `PATCH` B's entity → **404**, and B's row is **unchanged** (re-read and compare, don't
    just trust the status code);
  - as A, `DELETE` B's entity → **404**, and B's row still exists;
  - as A, the same operation on A's own entity → succeeds (guards must not over-block).
  Table-drive this so adding an endpoint without a case is obvious.
- **Assignment-specific:** as A, attempt to delete/reassign/swap an assignment belonging to B's
  student → 404, row intact. As A, submit `side_effects` targeting B's preceptor
  (`bump_preceptor_capacity`, `mark_preceptor_available`) or B's assignment
  (`remove_conflicting_assignment`) → rejected, and B's `max_students`, availability rows and
  assignments are all unchanged.
- **Schedules:** as A, `PATCH`/`DELETE`/`activate` B's schedule → 404, unchanged.
- **E2E:** extend `tenant-isolation.spec.ts` — signed in as A, issue `page.request.patch`/`delete`
  against B's entity ids and assert 404 plus, afterwards, that B can still sign in and see their
  data intact.

## Acceptance criteria
- [ ] Every mutating endpoint verifies ownership before touching a row.
- [ ] Cross-tenant writes return 404 and leave the target byte-identical.
- [ ] Override `side_effects` cannot reach another tenant's data.
- [ ] Own-data operations still work (no over-blocking), proven by the positive cases.
- [ ] The endpoint audit is recorded, with a written justification for anything intentionally
      unguarded.
- [ ] Definition of done per GUIDELINES.md.
