# Step 21 — Preceptor Page: Assignment Tab with Availability in View

## Objective
Bring the preceptor page to parity with the student page and calendar: the same assignment dialog, plus a workspace where the user can see the preceptor's current assignments and availability while adding new ones.

## Context (verified in code)
`/preceptors/[id]` has Overview / Availability / Schedule / Details tabs. The schedule tab has an "Add assignment" button wired to the old `create-assignment-dialog`, so it inherits every limitation fixed in steps 17–18 (no cascading, no availability-aware dates, ungated lock). The user specifically asked that this entry point behave like the others and that assignments and availability be visible together while assigning.

## Prerequisites
Steps 16, 17, 18.

## Scope
**In:** the preceptor Schedule/Assignments tab and its dialog wiring. **Out:** availability editing (step 16).

## Implementation

1. **Wire the unified dialog.** "Add assignment" opens the step-18 dialog with **preceptor pre-filled and locked**; student, clerkship, site and dates behave exactly as elsewhere. Remove the old component usage.
2. **Assignments workspace.** Rework the Schedule tab so the calendar shows, per day, the assigned student(s) **and** the preceptor's availability state in one grid (available / unavailable / booked / at-capacity), using the step-17 day states. The user should be able to open the dialog and still see this context — render the dialog beside or above the grid rather than covering it, or include the same summary inside the dialog's context panel (step 18.7).
3. **Capacity awareness.** Show `max_students` and the days currently at capacity; when the dialog's double-book override raises the limit, this view updates without a reload.
4. **Per-day editing.** Clicking an existing assignment opens the dialog in `mode="edit"` for that single day; removal follows the same past-date override rules as the student page (step 19.4).
5. **Range bounding.** The grid renders only the active schedule's months (step 15).

## Testing
- **Component:** the grid marks availability and bookings on the same day cell; at-capacity days are visually distinct.
- **E2E:**
  1. From a preceptor page, add an assignment → dialog opens with the preceptor locked and cascading options → create → the day appears on the preceptor's grid.
  2. The dialog's date grid reflects that preceptor's availability (set in step 16) — unavailable days are marked.
  3. Double-book a day and choose "raise the limit" → capacity display updates without a reload.
  4. Edit an existing assignment from the preceptor grid → changes the single day only.
  5. Attempt to remove a past-dated assignment → override required, then succeeds.

## Acceptance criteria
- [ ] The preceptor entry point uses the same dialog and rules as the student page and calendar.
- [ ] Current assignments and availability are visible together while assigning.
- [ ] Capacity and availability changes made through overrides are reflected immediately.
- [ ] Definition of done per GUIDELINES.md.
