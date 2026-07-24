# Step 23 — Navigation: Fold "Schedules" into the Schedule Switcher

## Objective
Remove the Calendar/Schedules ambiguity. The sidebar should have one place you *work* (Calendar) and one place you *switch or manage* the scheduling period (the switcher dropdown).

## Context (verified in code)
`src/routes/(app)/+layout.svelte:42-49` lists both `/calendar` ("Calendar") and `/schedules` ("Schedules") as top-level nav items. The names are near-synonyms for two very different things: the working grid of assignments vs. the CRUD list of scheduling periods. The switcher (`schedule-selector.svelte`) already sits above the nav and already links to `/schedules/new`, so it is the natural home for "manage".

## Prerequisites
Step 15 (the switcher must refresh correctly before it becomes the only entry point).

## Scope
**In:** sidebar nav items, switcher dropdown contents, redirects, docs.
**Out:** the `/schedules` page's own functionality (unchanged).

## Implementation

1. **Remove `{ href: '/schedules', label: 'Schedules' }`** from `allNavItems`. Nav becomes: Dashboard, Calendar, Students, Preceptors, Clerkships, Locations, (Auto-Generate when entitled).
2. **Add "Manage schedules" to the switcher dropdown** — a footer action in `schedule-selector.svelte`, visually separated from the list of selectable schedules, linking to `/schedules`. Keep the existing "New schedule" action beside it.
3. **Keep `/schedules` routable.** Do not delete or redirect the page — it is now reached from the switcher and from deep links. Ensure its breadcrumb reads sensibly when it is no longer a nav destination.
4. **Active-state check.** `isActive()` uses `currentPath.startsWith(href)`; confirm removing the item doesn't leave `/schedules/new` highlighting an unrelated entry, and that Calendar isn't marked active while on `/schedules`.
5. **Copy.** The dropdown's own label already shows the active schedule name and date range — keep that, since it is the answer to "which schedule am I editing?".
6. Update `docs/spec/PRODUCT_SPEC.md` §navigation and `04-navigation-ia.md` so the IA docs match the shipped nav.

## Testing
- **E2E:**
  1. The sidebar has **no "Schedules" item**; Dashboard, Calendar, Students, Preceptors, Clerkships, Locations are present.
  2. Opening the schedule switcher reveals "Manage schedules"; clicking it lands on `/schedules`.
  3. Navigating directly to `/schedules` still renders (deep link preserved) and no nav item is falsely highlighted.
  4. The existing schedule-lifecycle journey (create/edit/set-active/delete) still passes when driven through the new entry point.

## Acceptance criteria
- [ ] Exactly one calendar-ish item in the sidebar; schedule management lives in the switcher.
- [ ] `/schedules` remains reachable and functional.
- [ ] IA docs updated to match.
- [ ] Definition of done per GUIDELINES.md.
