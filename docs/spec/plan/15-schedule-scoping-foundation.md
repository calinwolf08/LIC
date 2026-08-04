# Step 15 — Schedule Scoping Correctness & Range Foundation

## Objective
Fix the root cause behind "full-year calendar", "capacity months outside my range", and stale schedule names: schedule resolution is inconsistent across the codebase, and one path silently falls back to a whole calendar year.

## Context (verified in code)
There are **two competing definitions of "the active schedule"**:

| Path | Mechanism | Files |
|---|---|---|
| Correct (per-user) | `getActiveScheduleId(userId)` reads `user.active_schedule_id` | `src/lib/api/schedule-context.ts` + all `/api/students`, `/api/preceptors`, `/api/schedules/*` routes |
| Broken (global) | `getActiveSchedulingPeriod(db)` reads `scheduling_periods.is_active = 1` | `src/lib/features/scheduling/services/scheduling-period-service.ts:~82`, used by `schedule-views-service.ts`, `/api/schedules/generate`, `/api/scheduling-periods/active` |

Consequences, all reported by the user:
1. `createDefaultScheduleForUser` (`src/lib/auth.ts:~40`) inserts new users' schedules with `is_active = 0`. So for a **fresh signup, `getActiveSchedulingPeriod()` returns `null`**, and `schedule-views-service.ts` falls back to `getDefaultStartDate()`/`getDefaultEndDate()` — **`YYYY-01-01` to `YYYY-12-31`** (`schedule-views-service.ts:632-640`). That is the "full year calendar instead of my Jul 1 – Aug 30 range" and the "Capacity Overview shows months outside the schedule" bug. The month loop itself (`getMonthsBetween(startDate, endDate)`) is correct — it is fed the wrong range.
2. Worse: if *any* row has `is_active = 1` (the seed sets this), a fresh user's preceptor/student views render **another tenant's date range**. This is a cross-user leak and must be treated as a correctness bug, not cosmetic.
3. The sidebar schedule dropdown (`schedule-selector.svelte`) loads schedules once in `onMount` into a module-level store and is never invalidated, so renaming a schedule on `/schedules` does not update the dropdown until a hard refresh.

Also note for later steps: **`schedule_assignments` has no `schedule_id` column** (`migrations/001_initial_schema.ts:150`, confirmed in `src/lib/db/types.ts:267`). Assignments are scoped only transitively through `schedule_students`. Do **not** attempt to add it in this step; later steps must scope assignment queries via the student/preceptor membership junctions.

## Prerequisites
None. **This step blocks 16–21** — do it first.

## Scope
**In:** schedule resolution helpers, removal of the year fallback, range plumbing into view services, schedule-store invalidation.
**Out:** any visual redesign of calendars (steps 16, 19, 20).

## Implementation

1. **Single source of truth.** In `src/lib/api/schedule-context.ts` add:
   - `getActiveScheduleForUser(db, userId): Promise<Selectable<SchedulingPeriods> | null>` — resolves `user.active_schedule_id` → the period row.
   - `getScheduleRange(db, scheduleId): Promise<{ start: string; end: string }>` — throws `NotFoundError` if the schedule is missing.
2. **Deprecate the global lookup.** Keep `getActiveSchedulingPeriod(db)` only where a genuinely global notion is required (there is none today). Mark it `@deprecated` and migrate all callers:
   - `schedule-views-service.ts`: change `getStudentScheduleData`, `getPreceptorScheduleData` (and any sibling) to take an explicit **`scheduleId` parameter** rather than resolving internally. Callers (API routes) pass `await getActiveScheduleId(userId)`.
   - `/api/schedules/generate/+server.ts` and `/api/scheduling-periods/active/+server.ts`: resolve per-user.
3. **Delete the year fallback.** Remove `getDefaultStartDate`/`getDefaultEndDate` from `schedule-views-service.ts`. When there is no active schedule, the service returns `null` and the route returns a domain error the UI renders as the existing `EmptyState` ("No active schedule") — never a fabricated range.
4. **Range-bounded calendar construction.** In the same service, ensure the calendar month array is built from `[schedule.start_date, schedule.end_date]` only: the first and last month are partial (leading/trailing days rendered as out-of-range blanks, not clickable). Add `isInRange` to the day model consumed by `schedule-calendar-grid.svelte`.
5. **Fix dropdown staleness.** In `src/lib/stores/schedule-store.ts` export `refreshSchedules()`. Call it after every schedule mutation on `/schedules` (`saveEdit`, `confirmDelete`, `setActiveSchedule`) and after the create wizard succeeds. Simplest correct approach: have `schedule-selector.svelte` derive from `$page.data` where possible, or call `refreshSchedules()` from an `$effect` keyed on `$page.data.activeScheduleId`. The dropdown must reflect a rename **without a page refresh**.
6. **Consistency audit.** Grep for `is_active` and confirm no read path decides "which schedule am I in" from it. Leave the column in place (the generator still uses it) but it must not drive scoping.

## Testing
- **Unit:** `getScheduleRange` returns exact stored dates; `getStudentScheduleData`/`getPreceptorScheduleData` with a Jul 1 – Aug 30 schedule produce **exactly 2 month buckets**, first/last partial, and never a January bucket; with no active schedule they return `null` (no fabricated year).
- **Unit (regression for the leak):** user A active on schedule S1 (Jul–Aug), user B's schedule S2 flagged `is_active = 1` — A's views must use S1's range.
- **API:** `/api/preceptors/[id]/schedule` and `/api/students/[id]/schedule` respect the caller's schedule; unauthenticated → 401.
- **E2E:** sign up fresh → set schedule range to a 2-month window → preceptor availability tab shows only those 2 months; rename the schedule on `/schedules` → **sidebar dropdown updates without refresh**.

## Acceptance criteria
- [ ] No code path resolves the working schedule from the global `is_active` flag.
- [ ] No calendar or capacity view can render a month outside the active schedule's range.
- [ ] A fresh signup with a custom range sees exactly that range everywhere.
- [ ] Schedule rename/delete/activate updates the sidebar dropdown without a page refresh.
- [ ] Definition of done per GUIDELINES.md.
