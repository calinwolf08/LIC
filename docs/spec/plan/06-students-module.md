# Step 06 — Students Module Rework

## Objective
Make the student detail page the per-student scheduling hub: requirement status as of today (completed / scheduled / unscheduled), full schedule with in-place editing, and one-click drill-through to related entities.

## Context
DESIGN_REVIEW A2, B7, C3, E2. Today the detail page duplicates a calendar preview and a separate schedule page, progress requires generation to have run, assignment rows aren't links, and onboarding toggles reload the whole window.

## Prerequisites
Steps 01, 04. Best after steps 09 (assignment dialogs) and 10 (status engine); if 10 hasn't landed, consume the `RequirementStatus` contract from `10-validation-engine.md` behind a service stub and leave a `TODO(step-10)`.

## Scope
**In:** `/students` list, `/students/[id]` detail (absorbing `/students/[id]/schedule`), `/students/new`. **Out:** the validation engine itself (10), assignment dialog internals (09).

## Implementation

1. **List `/students`**: columns Name (link), Email, Requirements (e.g., `62% · 12d unscheduled`, colored by status), Conflicts (red badge with count if any), Scheduling status (Fully/Partially/Unscheduled). Data from the step 10 status service (one batch endpoint — do not fetch per row). Row actions: Delete (ConfirmDialog; blocked with explanation while assignments exist, offering "view schedule" link).
2. **Detail `/students/[id]`** — `PageHeader` (breadcrumb Students / name) + `EntityTabs`:
   - **Overview** (default): requirement summary cards (total required / completed to date / scheduled / unscheduled) + per-clerkship progress rows: clerkship name (→ link to clerkship detail), segmented progress bar (green completed, blue scheduled, gray unscheduled), day counts, and — when unscheduled > 0 — an "Add days" button that opens the step 09 create-assignment dialog pre-filtered to this student+clerkship. Conflict list for this student (each → opens the day/assignment).
   - **Schedule**: full calendar + list of the student's assignments (reuse the shared calendar grid component). Every row: date, clerkship (link), preceptor (link), site (link), status/lock icon, edit/delete via step 09 dialogs. "Add assignment" button. This tab **replaces** `/students/[id]/schedule` — delete that route and redirect it here (`?tab=schedule`); also delete the old preview "Calendar" tab.
   - **Details**: inline edit form (existing `StudentForm` + unsaved-changes guard) + created/updated metadata.
   - **Onboarding**: existing health-system onboarding checklist; replace `window.location.reload()` with `invalidateAll()`; toast on toggle.
3. **`/students/new`**: keep full page; after create, go to the new student's detail.
4. Remove `/students/[id]/edit` redirect stub route entirely (nothing links to it after this step).
5. Empty/edge states: student with no assignments (EmptyState + "Add assignment"); no active clerkships (link to Clerkships).

## Testing
- Unit: any list-status mapping helpers (status → label/color), service for batch student status (if added here rather than step 10).
- API: batch status endpoint scoped to active schedule (if added here).
- E2E: list shows status columns from seed data; open a seeded student → overview shows correct completed/scheduled/unscheduled split for the seed's "partially scheduled with past+future assignments" student; click clerkship link → clerkship page; add days from a deficit row (dialog pre-filled); edit details with unsaved-changes warning; onboarding toggle updates without full reload; `/students/[id]/schedule` redirects.

## Acceptance criteria
- [ ] From a student page: full schedule visible; requirement status split by today's date; every related entity reachable in one click; schedule modifiable in place (R2.3 fully met).
- [ ] Routes `/students/[id]/schedule` and `/students/[id]/edit` gone (redirect / removed).
- [ ] No `window.location.reload()` in the module.
- [ ] Definition of done per GUIDELINES.md.
