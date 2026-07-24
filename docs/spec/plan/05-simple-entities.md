# Step 05 — Standardize Simple Entity Modules (Schedules, Locations)

## Objective
Bring schedules, health systems, and sites fully onto the interaction grammar; fix the `/schedules/[id]/edit` dead link and the confusing dual "active" badges.

## Context
DESIGN_REVIEW A4, A5, B1, B5. Sites use full pages while health systems use an inline form toggle plus (pre-step-01) browser confirms; the Schedules "Edit" button 404s; the schedules list shows both "Active" and "Server Active" badges.

## Prerequisites
Steps 01, 04.

## Scope
**In:** `/schedules` (list + edit), `/locations` (health systems + sites). **Out:** blackout dates (step 11), entity pages for students/preceptors/clerkships (06–08).

## Implementation

### Schedules
1. `/schedules` list: keep card/table list with per-schedule entity counts. Actions: **Set active**, **Edit**, **Duplicate**, **Delete** (ConfirmDialog; deletion explains what is removed — junction links and assignments — per `schedule-first-architecture.md` "Schedule Deletion Behavior"; a simple version listing counts is sufficient, per-entity checkboxes are out of scope).
2. **Fix edit**: schedules are simple (name, start, end) → edit in a **dialog** on the list page (spec grammar: simple entity). Remove the dead `/schedules/[id]/edit` navigation. Changing dates of a schedule that has assignments outside the new range shows a warning listing the count of out-of-range assignments (they are kept; validation in step 10 will flag them).
3. **One "active" concept**: the user's active schedule only. Remove the `is_active`/"Server Active" badge from the UI; if `scheduling_periods.is_active` is no longer read anywhere after this, drop it from the schema (allowed; coordinate with the step 02 baseline if both are in flight).
4. `/schedules/new`: keep as full page (it may grow the duplicate-from-existing options); ensure `?source=` duplicate flow works and is covered by a test.

### Locations (`/locations`)
5. Build the tabbed page (Health systems | Sites) started in step 04, using `EntityTabs`, one table each with search.
6. **Health systems**: create/edit via dialog (simple entity: name + contact fields). Keep detail page `/health-systems/[id]` (shows its sites, preceptors) reachable by clicking the name; add breadcrumb back to Locations.
7. **Sites**: create/edit via dialog (name, health system select, address). Retire `/sites/new` and `/sites/[id]/edit` full pages with redirects to `/locations?tab=sites` (open dialog via query param `?edit=<id>` is acceptable). Keep/redirect `/sites/[id]` detail as a simple detail view or fold into the health-system detail — pick one, ensure no dangling links (grep for `href="/sites/`).
8. Hierarchy explainer retained: short copy on the Sites tab ("Each clinical location is its own site; sites belong to a health system.").
9. Both tabs: `EmptyState` with creation guidance; delete via `ConfirmDialog` with dependency details (reuse `/api/*/dependencies` endpoints).

## Testing
- API: schedules PATCH (name/dates) endpoint exists and is schedule-owner-scoped; date-shrink returns out-of-range assignment count in response.
- Unit: schedule service update/duplicate/delete; site/health-system service CRUD with dependency blocking.
- E2E: edit a schedule name and dates from the list (no 404); duplicate a schedule; delete blocked/allowed paths for health system with/without sites; create site inline from Sites tab; only one "Active" badge visible.

## Acceptance criteria
- [ ] No route or link to `/schedules/[id]/edit`, `/sites/new`, `/sites/[id]/edit` remains (redirects in place).
- [ ] Schedules list shows exactly one active indicator; edit works via dialog.
- [ ] `/locations` fully manages both entity types per the interaction grammar.
- [ ] Definition of done per GUIDELINES.md.
