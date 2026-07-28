# Step 30 — Calendar Rendering: Student Identity, Per-Student Colour, Clerkship Link

## Objective
On the schedule-wide calendar, every assignment should say **who** it is for, colour should identify
the student at a glance, and the list view's clerkship should be a link like the other entities.

## Context (verified in code)
- `(app)/calendar/+page.svelte:688` passes **`mode="student"`** to `ScheduleCalendarGrid`. In that
  mode `primaryLabel` returns `clerkshipName` and `secondaryLabel` returns `preceptorName`
  (`schedule-calendar-grid.svelte:49-58`) — the student is dropped. The grid's *default* branch
  already renders `"<student> · <clerkship>"`, so the label logic is fine; the caller passes the
  wrong mode.
- Cell colour is `assignment.color`, set in the page's mapping (line ~402) from `event.color`, which
  `calendar-service.getCalendarEvents` derives via `getClerkshipColor(specialty)` — i.e. colour
  encodes clerkship. On the student page that is useful; schedule-wide it should encode student.
- List view renders the clerkship as a bare `<span>` (`+page.svelte:726`) while student and
  preceptor are links.

## Prerequisites
Step 26 (the calendar must be showing only the caller's data before its rendering is tuned).

## Scope
**In:** the schedule-wide calendar's cell content, colour semantics, and list-view links.
**Out:** the student/preceptor calendars, which keep their current, correct semantics.

## Implementation

1. **Use the right mode.** Pass `mode="schedule"` (or omit, if the default is schedule-wide) from
   `/calendar`. Confirm the grid's mode union has a distinct schedule-wide value rather than
   overloading `'student'`; add it if missing. Cells then read `student · clerkship` with the
   preceptor as the secondary line.
2. **Colour by student, schedule-wide.** Add a `colorBy: 'clerkship' | 'student'` input to the grid
   (default `'clerkship'` to preserve the student/preceptor pages). `/calendar` passes `'student'`.
   Implement `getStudentColor(studentId)` next to `getClerkshipColor`, reusing the same stable
   hash-to-palette approach so a given student keeps one colour across renders and sessions.
   Prefer hashing the **id** rather than the name, so renaming a student doesn't recolour them.
3. **Legend / disambiguation.** With ~10+ students the palette repeats; keep the name in the cell
   (colour is an accelerator, never the only identifier) and keep the full
   `student · clerkship · preceptor` tooltip.
4. **Link the clerkship in list view**, matching the student/preceptor treatment
   (`/clerkships/{clerkship_id}`). Confirm the list payload carries `clerkship_id`; add it to the
   enriched assignment shape if not.
5. While here, verify the day-cell "+N more" drawer also shows student names — it inherits the same
   label helpers, so it should follow automatically once the mode is right.

## Testing
- **Component (grid):** in schedule mode a cell renders student, clerkship and preceptor; in student
  mode it still renders clerkship + preceptor (no regression); `colorBy: 'student'` assigns two
  assignments for the same student the same colour and two different students different colours;
  the same student's colour is stable across re-renders.
- **Unit:** `getStudentColor` is deterministic per id and distributed across the palette.
- **E2E:** on `/calendar`, a seeded day cell contains the student's name (assert the exact seeded
  name, not just "not 'Int'"); two assignments for the same student share a colour attribute while
  a different student's differs; in list view the clerkship is a link that navigates to
  `/clerkships/[id]`; the student page's calendar still shows clerkship + preceptor.

## Acceptance criteria
- [ ] Schedule-wide calendar cells identify the student.
- [ ] Colour identifies the student schedule-wide, and clerkship on the student/preceptor views.
- [ ] Clerkship is a link in list view, like student and preceptor.
- [ ] Student and preceptor calendars are unchanged.
- [ ] Definition of done per GUIDELINES.md.
