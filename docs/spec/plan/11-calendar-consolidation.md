# Step 11 — Calendar Consolidation

## Objective
Make `/calendar` the polished Stage 1 scheduling workspace: full-range views, clear filters, violation markers, blackout management, click-to-create, export — with all generation controls removed (they move to the Stage 2 hub).

## Context
DESIGN_REVIEW A7, B3, C7, D4. The calendar exposes the regenerate dialog (with constraint-bypass internals) to everyone, day clicks only open the first assignment, filters were patched with explanatory text rather than designed, and blackout management is a hidden collapsible.

## Prerequisites
Steps 09 (assignment dialogs), 10 (validation data), 03 (gating). Step 01 primitives.

## Scope
**In:** `/calendar` page + shared `schedule-calendar-grid` component upgrades (also consumed by student/preceptor pages). **Out:** generation UI (step 13 relocates it; this step deletes it from here).

## Implementation

1. **Layout**: `PageHeader` ("Calendar", active schedule name + range, actions: Export, Manage blackout dates). View toggle Month grid | List. Default range = schedule range (keep current behavior), month pager + "Full schedule" reset.
2. **Filter bar**: labeled "Filters" with student/preceptor/clerkship selects + date range; active-filter chips with clear; per U16 keep the note that filters affect display and export only. Persist filters in URL query params (shareable/back-button-safe; e.g., `/calendar?student=<id>` — student/preceptor pages may deep-link here).
3. **Day cells** (grid component): assignment chips colored by clerkship with student initials; **violation marker** (red corner badge) on days with violations from `validateSchedule`, tooltip listing them; blackout days shaded with label; today outlined. Day click → day panel/dialog listing that day's assignments (edit via step 09 modal) + "Add assignment" (pre-filled date). Empty day click → create dialog directly.
4. **List view**: grouped by date, rows: student (link), clerkship (link), preceptor (link), site, lock icon, violation icons; row click edits.
5. **Blackout dates**: move from inline collapsible to a dialog/side-sheet opened by the header action ("Manage blackout dates") reusing `BlackoutDateManager`; blackout conflict flow (existing `blackout-date-conflict-dialog`) preserved. Also linked from the setup checklist.
6. **Export**: keep Excel export honoring filters; failure → toast (done in step 01, verify).
7. **Delete generation UI from this page**: Regenerate button/dialog imports removed entirely (dialog component moves to the step 13 hub; leave the component file in place, unimported, if 13 hasn't run — note it in the commit). Entitled users get a single link in the header: "Auto-generate…" → `/generate` (hidden for non-entitled).
8. **Validation refresh**: after any assignment create/edit/delete, refetch validation + events together; loading skeletons instead of blank flashes.

## Testing
- Unit: any new grid-view helpers (chip grouping, marker aggregation) — pure functions.
- E2E: default range = schedule range; filter by student then export (URL params set; export request carries filters); empty-day click opens pre-filled create dialog; seeded violation shows red marker with tooltip text; blackout manager opens from header and adding a blackout shades the day; non-entitled sees no generate anything (regression); entitled sees "Auto-generate…" link only.
- Visual sanity: month with 0 assignments renders EmptyState guidance ("Click any day to add an assignment").

## Acceptance criteria
- [ ] Calendar supports the full manual loop: see → filter → create → edit → validate → export, with no generation internals visible (R8.1–R8.5).
- [ ] Violation markers driven by step 10 data.
- [ ] Blackouts manageable from the calendar header (B3 closed).
- [ ] Definition of done per GUIDELINES.md.
