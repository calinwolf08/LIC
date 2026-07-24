# Step 07 — Preceptors Module Rework

## Objective
Consolidate all preceptor viewing/editing onto a detail page, make availability a first-class tab with a calendar visualization (feedback F5), and remove the modal/page split.

## Context
DESIGN_REVIEW A1, C5. Create is a full-page wizard (good) but edit is a modal, availability is edited via a modal from the list *and* via `/preceptors/[id]/availability`, and there is no way to *see* resulting availability on a calendar. Teams UI is entangled with this page (handled in steps 08/13).

## Prerequisites
Steps 01, 04. Uses step 10's status service for readiness/load data (stub allowed as in step 06).

## Scope
**In:** `/preceptors` list, `/preceptors/[id]` detail, availability UX, keeping `/preceptors/new` wizard. **Out:** teams (moved by steps 08/13), the scheduling engine.

## Implementation

1. **List `/preceptors`**: single-purpose page (Teams tab removed — see steps 08/13). Columns: Name (link), Health system / Sites, Availability (configured indicator — keep F4 behavior; "None set" amber warning), Assigned days (count from active schedule), Conflicts badge. "Add preceptor" → `/preceptors/new`. Row delete via ConfirmDialog with dependency explanation. Remove the edit and availability modals — name click goes to detail.
2. **Detail `/preceptors/[id]`** — `PageHeader` + `EntityTabs`:
   - **Overview**: contact info + sites; assignment load summary (days assigned per clerkship, distinct students, links); conflicts involving this preceptor.
   - **Availability**: the existing `PatternAvailabilityBuilder` embedded as page content (not a modal), PLUS an **availability calendar**: month grid over the active schedule range where each day is colored available / unavailable / blackout, with assignment dots overlaid so the user sees free capacity at a glance. Pattern edits update the calendar immediately (client-side computation from patterns; reuse the pattern-resolution logic in `features/preceptors/services` — extract to a pure util `resolveAvailability(patterns, dateRange): Map<date, boolean>` if not already pure).
   - **Schedule**: this preceptor's assignments (list + calendar), rows linking to student/clerkship, edit/delete via step 09 dialogs, "Add assignment" pre-filtered to this preceptor. Absorbs `/preceptors/[id]/schedule` (redirect to `?tab=schedule`).
   - **Details**: inline edit form (current `PreceptorForm` content, no modal) with unsaved-changes guard; inline site creation dialog if a needed site doesn't exist (spec §6 side-quest rule, feedback F9/U9).
   - Retire `/preceptors/[id]/availability` as a standalone page (redirect to `?tab=availability`).
3. **`/preceptors/new` wizard**: keep (info → sites → availability); align its step chrome with `PageHeader`; on finish go to the new preceptor's detail. Ensure availability step is skippable with a clear warning that unscheduled preceptors show as "no availability" (U7 messaging preserved).
4. `resolveAvailability` util must handle: weekly patterns, date-range overrides, exceptions, notes passthrough; timezone-safe UTC date math (reuse `features/scheduling/utils/date-utils`).

## Testing
- Unit: `resolveAvailability` — weekly pattern, override precedence, exceptions, range boundaries, empty patterns (all-unavailable), leap-day/DST-safe date iteration.
- E2E: list → click name → detail; edit details inline (dirty-guard fires); availability tab shows calendar matching a seeded pattern (assert a known available and unavailable day); add a pattern and see the calendar change; schedule tab lists seeded assignments with working links; old `/preceptors/[id]/availability` and `/preceptors/[id]/schedule` URLs redirect.
- API: no new endpoints expected; if any added, scope + auth tests.

## Acceptance criteria
- [ ] No preceptor edit/availability modals remain on the list page.
- [ ] Availability visually verifiable on a calendar (F5 closed); indicator column retained (F4).
- [ ] Detail page provides overview / availability / schedule / details with cross-links (R3.4).
- [ ] Definition of done per GUIDELINES.md.
