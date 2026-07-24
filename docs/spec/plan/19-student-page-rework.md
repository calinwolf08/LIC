# Step 19 — Student Page: Onboarding Warning, Calendar Schedule, Editable Assignments

## Objective
Fix the broken schedule table, make the calendar the default way to see a student's schedule, allow editing (not just removing) assignments, and surface an onboarding warning where the user will actually see it.

## Context (verified in code)
1. **Empty columns — confirmed root cause.** `/students/[id]/+page.svelte:~207` renders `a.clerkship_name` and `a.preceptor_name`, but `getStudentScheduleData` returns **camelCase** `clerkshipName` / `preceptorName` (`schedule-views-service.ts:187-197`). The fields are `undefined`, so the cells render blank. A pure naming mismatch.
2. The schedule tab is a list only; there is no calendar toggle and no edit affordance — only "Remove" (`requestDelete`).
3. Deleting a past-dated assignment is currently unrestricted in the API but the user wants past data protected **with an override** (step 17 supplies `?force=true` + the 409 contract).
4. Onboarding state is already loaded (`data.onboardingStatus`, `data.healthSystems`) and the Overview tab shows a conflict banner, but nothing tells the user "this student is scheduled in a health system they haven't onboarded to".

## Prerequisites
Steps 15, 17, 18.

## Scope
**In:** `/students/[id]` tabs (Overview, Schedule, Progress, Details, Onboarding).
**Out:** the dialog itself (step 18).

## Implementation

1. **Fix the field mismatch** and add a type. Export a shared `StudentAssignment` type from the service and type the page's list against it so this class of bug becomes a compile error rather than a blank cell. Add a unit test asserting the API's assignment objects carry non-empty clerkship and preceptor names.
2. **Schedule tab — calendar by default.** Add a `Calendar | List` toggle, **defaulting to Calendar**, persisted in the URL (`?view=`). The calendar reuses `ScheduleCalendarGrid`, bounded to the schedule range (step 15), each day showing clerkship + preceptor. The list remains available and now renders its columns correctly.
3. **Edit assignments.** Clicking any assignment (calendar cell or list row) opens the step-18 dialog in `mode="edit"` for that single day, pre-filled and student-locked. Keep Remove alongside Edit.
4. **Past-date protection with override.** Removing (or moving) a past-dated assignment shows a `ConfirmDialog` explaining it already happened, with an explicit "Remove anyway" that calls the API with `force=true`. The user's scenario — a student missed a day and it must be re-added later — is then possible: remove the past day with override, then add a replacement day.
5. **Onboarding warning.** On Overview and the Schedule tab, if the student has (or is being given) assignments in a health system where `student_health_system_onboarding.is_completed !== 1`, show an amber banner: "Not onboarded at *Metro Health* — 4 scheduled days affected", with a button that switches to the **Onboarding** tab. Compute from existing loaded data; no new endpoint.
6. **Progress tab.** New tab consolidating clerkship progress (required / completed / scheduled / unscheduled per clerkship) **and the preceptors assigned to this student**, each linked. This is the "see progress and assigned preceptors while assigning" requirement; the dialog's compact panel (step 18) links here.
7. Keep Details as the only editable surface for identity fields (see step 22 for the Overview/Details split).

## Testing
- **Unit:** student schedule payload → rendered rows contain clerkship and preceptor names (regression for the mismatch); onboarding-gap computation returns the right health systems and affected day counts.
- **E2E:**
  1. Open a student with assignments → **calendar view is default**; each day shows clerkship and preceptor; switch to List → columns are populated (**fails before the fix**).
  2. Click an assignment → edit dialog opens for that day → change the preceptor → the calendar reflects it.
  3. Try to remove a past-dated assignment → blocked with an explanation → "Remove anyway" succeeds; then add a replacement day.
  4. Assign a student into a health system without onboarding → amber banner appears and its button lands on the Onboarding tab → complete onboarding → banner disappears.
  5. Progress tab lists per-clerkship counts and the assigned preceptors as links.

## Acceptance criteria
- [ ] Clerkship and preceptor names always render in the schedule list.
- [ ] Calendar is the default schedule view, with a working toggle.
- [ ] Assignments are editable per day, not only removable.
- [ ] Past assignments are protected but removable with an explicit override.
- [ ] An onboarding gap is impossible to miss and one click from the fix.
- [ ] Definition of done per GUIDELINES.md.
