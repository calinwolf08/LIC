# Step 04 — Navigation & Information Architecture

## Objective
Rebuild the sidebar and route naming around the spec's mental model so users can jump between any areas in one click, with one consistent term per concept.

## Context
DESIGN_REVIEW B3/B5/B6: naming is split ("Schedule Periods" vs "Schedules" vs "scheduling period"), blackout dates have no nav presence, `/schedule/results` is orphaned, and there's no guidance on where to start.

## Prerequisites
Step 01 (PageHeader with breadcrumbs). Step 03 helps (entitlement flag for the gated nav item) but a placeholder boolean is acceptable if 03 hasn't landed.

## Scope
**In:** sidebar, route renames/redirects, terminology sweep, breadcrumbs adoption on existing detail pages. **Out:** page content redesigns (steps 05–13).

## Implementation

1. **Sidebar** (`src/routes/(app)/+layout.svelte`), in this order:
   - Dashboard (`/dashboard`)
   - Calendar (`/calendar`)
   - Students (`/students`)
   - Preceptors (`/preceptors`)
   - Clerkships (`/clerkships`)
   - Locations (`/locations`) — merged Sites & Health Systems area (step 05 builds the page; this step creates the route rendering the two existing pages as tabs and redirects `/sites` → `/locations?tab=sites`, `/health-systems` → `/locations?tab=health-systems`)
   - Schedules (`/schedules`)
   - Auto-Generate (`/generate`) — **only when entitled**; route stub created here, filled by step 13. Until step 13 lands, the stub links to the existing `/schedule/results` content.
   - Use lucide-svelte icons instead of the current inline SVG path strings.
2. **Terminology sweep** (one term per concept, spec §6): "Schedules" (nav + `/schedules` page — drop "Schedule Periods"), "Calendar" (drop "Schedule Calendar"), "scheduling period"→"schedule" in user-facing copy (grep `-ri "schedule period\|scheduling period" src --include=*.svelte`). Internal table names stay.
3. **Redirects for renamed/removed routes** using SvelteKit `redirect()` in `+page.server.ts` files (`/sites`, `/health-systems`, `/schedule/results` → `/generate/results` placeholder). Keep old deep-link URLs working (`/sites/[id]` can remain canonical until step 05 decides).
4. **Breadcrumbs**: adopt `PageHeader` with breadcrumbs on all existing detail pages (`students/[id]`, `students/[id]/schedule`, `preceptors/[id]/*`, `preceptors/teams/*`, `clerkships/[id]/config`, `sites/[id]`, `health-systems/[id]`, `schedules/new`). Content otherwise untouched.
5. **Schedule selector** stays in the sidebar; ensure its "Manage schedules" link points at `/schedules`.
6. Remove the "Getting Started" card logic from the dashboard only if step 12 has landed; otherwise leave (step 12 owns dashboard).

## Testing
- E2E: sidebar shows exactly the specified items in order for a non-entitled user (no Auto-Generate) and includes Auto-Generate for the entitled user; each item navigates to a 200 page; `/sites` and `/health-systems` redirect to `/locations` tabs; `/schedule/results` redirects for entitled users and 403/redirects-away for non-entitled.
- Unit: none beyond redirect load functions (test with SvelteKit's expected redirect throw).
- Grep assertions (manual in PR): no user-facing "Schedule Periods"/"scheduling period" strings remain.

## Acceptance criteria
- [ ] Sidebar matches the spec order, icons from lucide, active-state highlighting works for nested routes.
- [ ] All old URLs redirect; zero 404s from any in-app link (crawl all sidebar + row links in e2e).
- [ ] Every detail page has a working breadcrumb trail.
- [ ] Definition of done per GUIDELINES.md.
