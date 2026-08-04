# Step 20 — Calendar Page: Default View, Readable Days, Unified Dialogs, Schedule Health

## Objective
Make `/calendar` the real working surface: opens as a calendar, days are readable, assignment create/edit use the step-18 dialog, and schedule health (including overrides) is reviewable without going to the dashboard.

## Context (verified in code)
1. `/calendar/+page.svelte:64` — `let viewMode = $state<'list' | 'calendar'>('list')`. It **opens in list mode**.
2. **The "Int" bug.** `schedule-calendar-grid.svelte:121` renders `assignment.clerkshipAbbrev || assignment.clerkshipName.slice(0, 3)` — "Internal Medicine" → **"Int"**. The full detail exists only in the `title` tooltip (line 117).
3. Day clicks open a bespoke edit modal rather than the assignment dialog, so the calendar cannot offer the cascading/availability behaviour the user wants.
4. The page fetches `/api/schedules/validation` and keeps only `violationCount` (line ~150); nothing renders a breakdown, and overrides are not surfaced anywhere.

## Prerequisites
Steps 15, 17, 18.

## Scope
**In:** `/calendar` view default, day cell rendering, dialog wiring, health panel.
**Out:** the dialog internals (18); dashboard (unchanged).

## Implementation

1. **Default to calendar.** `viewMode` initial value `'calendar'`, persisted in the URL (`?view=`) so a chosen view survives reload and sharing.
2. **Readable day cells.** Replace the 3-char abbreviation with **student · clerkship · preceptor**. At normal density show student name and clerkship, with the preceptor on a second line; degrade gracefully as cells narrow (never fall back to a meaningless truncation like "Int"). Keep a full tooltip. Where a day has more assignments than fit, show "+N more" opening a day drawer listing all of them. Respect the schedule range from step 15 — out-of-range days render inert.
3. **Create via the unified dialog.** Clicking an empty day opens the step-18 dialog with **date pre-filled and locked**, and — because this is the schedule-wide surface — the **student dropdown present** (the only difference from the student page's instance).
4. **Edit via the unified dialog.** Clicking an existing assignment opens the same dialog in `mode="edit"` scoped to that single day. Retire the bespoke edit modal path once migrated.
5. **Schedule health panel.** A collapsible panel (or side drawer) on `/calendar` rendering `/api/schedules/validation`: counts by severity, grouped by code, each row linking to the offending date/student and opening the edit dialog. This is the same data the dashboard shows — extract a shared component rather than duplicating the rendering.
6. **Overrides section.** Within the health panel, a distinct **"Overrides"** list from `GET /api/schedules/overrides` (step 17): who/what/when, which codes were accepted, and the note. Each row links to the assignment's edit dialog so the user can revisit or undo it. This satisfies "keep track of overrides and confirm they're still correct".
7. Refresh both panels after any create/edit/delete so health reflects the current state without a manual reload.

## Testing
- **Component:** day cell renders student, clerkship and preceptor for a normal day; "+N more" appears past the fit limit; out-of-range days inert.
- **Unit:** health panel groups violations by code with correct counts; override rows map codes to human labels.
- **E2E:**
  1. Open `/calendar` → **calendar view by default**; a seeded day shows student, clerkship and preceptor (**asserting the text is not the bare "Int" abbreviation** — regression for the report).
  2. Click an empty day → dialog opens with date locked and a student selector present → create → the day reflects it.
  3. Click an existing assignment → edit dialog for that day → change preceptor → cell updates.
  4. Create an assignment accepting an override → the Overrides list shows it with the accepted code → clicking the row opens the edit dialog.
  5. Introduce a soft violation → health panel count increases; resolve it → count drops without a manual refresh.
  6. `?view=list` still renders the list view.

## Acceptance criteria
- [ ] `/calendar` opens as a calendar and day cells identify student, clerkship and preceptor.
- [ ] Create and edit both use the step-18 dialog; no bespoke assignment modal remains.
- [ ] Schedule health and the override log are reviewable from `/calendar` and link back to the assignment.
- [ ] Definition of done per GUIDELINES.md.
