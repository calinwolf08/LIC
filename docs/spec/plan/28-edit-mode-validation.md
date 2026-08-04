# Step 28 — Edit-Mode Validation Correctness & Note Copy

## Objective
Opening an existing assignment must not report the assignment as conflicting with itself, and the
note field must stop implying an exception is being made when none is.

## Context (verified in code)
`excludeId` already exists in `assignment-validation.ts` — used at lines 139 (double-book), 267,
315 (capacity) and 379 (required-days count). It is **not** supported by the two newer services the
dialog actually drives:

- `assignment-day-state.ts` — `DayStateQuery` has no `excludeId`, so the assignment being edited
  still marks its own day `studentBusy` and counts itself in `preceptorBookings` / capacity.
- `requirement-preview.ts` — `previewRequirementImpact` counts every existing assignment, so the
  edited day is double-counted against `required`, producing a false "more days than required".

The dialog never sends an exclusion either: the day-states fetch (`assignment-dialog.svelte` ~line
282) passes only `preceptorId`, `studentId`, `siteId`, `from`, `to`.

Separately, the note input hard-codes `placeholder="Why this exception is being made"`
(`assignment-dialog.svelte:783`), which is shown whenever the note field is visible — including
edits with no overrides at all.

## Prerequisites
Step 26 (so the endpoints these call are already schedule-scoped).

## Scope
**In:** `excludeId` plumbing end to end, and the note field's copy/visibility.
**Out:** picker visuals (step 29).

## Implementation

1. **`assignment-day-state.ts`:** add `excludeId?: string` to `DayStateQuery`. Exclude that
   assignment id from the queries that populate `studentBusy`, `preceptorBookings` and the
   occupancy used for `preceptorAtCapacity`. An excluded assignment must not appear in
   `preceptorBookings` either — otherwise the cell still renders "booked by <this student>".
2. **`requirement-preview.ts`:** add `excludeId?: string` to `previewRequirementImpact` and exclude
   it from the completed/scheduled counts, so an edit re-counts its own day exactly once (as part of
   `selected`, not as existing).
3. **APIs:** accept and forward `excludeId` on
   `GET /api/schedules/assignments/day-states` and `GET /api/schedules/assignments/requirement-preview`.
   Validate it as an id; ignore it when absent so create-mode behaviour is untouched.
4. **Dialog:** when `mode === 'edit'`, include `excludeId=<assignmentId>` in both fetches and in the
   dry-run validation payload (`validateAssignmentCandidate` already honours `candidate.excludeId`).
5. **Note copy.** Make the placeholder reflect reality:
   - when the submission carries at least one accepted override → `"Why this exception is being made"`;
   - otherwise → `"Optional note about this assignment"`.
   Derive it from the same state that drives the override summary, and label the field plainly
   (`Note`), not `Exception note`. If the field is only meaningful with overrides in a given
   context, hide it there rather than mislabelling it.

## Testing
- **Unit — `getDayStates`:** with `excludeId` set to an assignment on day D for that student,
  D reports `studentBusy: false`, `preceptorBookings` omits it, and `preceptorAtCapacity` drops
  when that assignment was the one filling the slot. Without `excludeId`, behaviour is unchanged
  (guard against regressing create mode).
- **Unit — `previewRequirementImpact`:** a student with `required = 2` and 2 existing days, editing
  one of them, reports `exceedsBy: 0` (not 1). Without `excludeId`, still 1.
- **Unit — validation:** editing an assignment in place produces **no** `student_double_booked`,
  while a genuine second assignment on the same day still does.
- **API:** `day-states` and `requirement-preview` honour `excludeId`; an invalid value is rejected
  (400) rather than silently ignored.
- **Component/unit:** placeholder text switches with the presence of accepted overrides.
- **E2E (extend `calendar-workspace.spec.ts` or a new `assignment-edit.spec.ts`):** create an
  assignment; reopen it from the calendar via the day cell; assert **no** "already has an
  assignment" and **no** "more days than required" appear, the note placeholder is the neutral
  copy, and saving an unchanged edit succeeds. Then, as a control, add a *second* assignment for the
  same student and day and confirm the hard conflict still blocks it.

## Acceptance criteria
- [ ] Editing an assignment never conflicts with itself (double-book, capacity, required-days).
- [ ] Create-mode validation is unchanged — proven by the control cases.
- [ ] Note copy only mentions exceptions when an override is actually being accepted.
- [ ] Definition of done per GUIDELINES.md.
