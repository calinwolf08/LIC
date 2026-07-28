# Step 31 — Entity List Row Navigation & Manage Button Consistency

## Objective
Clicking a row should open the entity everywhere, as it already does on Locations, and the Manage
button should look the same on every list.

## Context (verified in code)
- `health-system-table.svelte` has `handleRowClick` wired to the `<tr>` (lines 114, 175), with the
  actions cell calling `e.stopPropagation()` so buttons still work.
- `student-list.svelte`, `preceptor-list.svelte` and `clerkship-list.svelte` have **no** row click
  handler — only the name link and the Manage button.
- Button variants diverge: `student-list.svelte:125` uses `variant="ghost"`; preceptor list is also
  ghost; the clerkship list uses `variant="default"` (the solid/black one). The user wants the
  clerkship treatment everywhere.

## Prerequisites
None — independent of the rest of Round 3.

## Scope
**In:** row-click navigation and Manage button styling on the student, preceptor and clerkship
lists (and the sites list, for symmetry). **Out:** table redesign.

## Implementation

1. **Row click.** Follow the Locations pattern exactly rather than inventing a second one:
   - `onclick` on the `<tr>` navigating to the entity's detail route, plus `cursor-pointer` and a
     hover style.
   - The actions cell stops propagation so Manage/Delete don't double-fire.
   - **Accessibility:** a clickable row is not keyboard-reachable by default. Keep the entity-name
     link as the primary control (it already exists and is focusable), give the row
     `role="row"`-appropriate semantics, and do **not** remove the name link. If Locations' existing
     row handler lacks keyboard support, fix it there too rather than propagating the gap — note
     this in the PR.
2. **Manage button.** Standardise on `variant="default"` (solid) across students, preceptors,
   clerkships, sites and health systems, keeping `size="sm"`. Delete stays `variant="destructive"`.
   If two solid buttons per row reads heavy, that's a design call to make once, consistently — not
   per list.
3. **Sweep for stragglers:** `grep -rn "Manage" src/lib/features/*/components/*list*.svelte
   src/lib/features/*/components/*table*.svelte` and confirm every occurrence uses the same
   size/variant.

## Testing
- **E2E (extend `entity-consistency.spec.ts`):** on `/students`, `/preceptors` and `/clerkships`,
  clicking a row (not the button) navigates to that entity's detail page; clicking Delete in the row
  opens the delete dialog and does **not** navigate (proves `stopPropagation` works); the Manage
  button carries the same variant class on all lists.
- **Component:** row click invokes navigation with the right id; the actions cell swallows the
  click.
- Re-run the existing Locations journey to confirm the shared pattern still behaves.

## Acceptance criteria
- [ ] Rows are clickable on students, preceptors, clerkships (and sites), matching Locations.
- [ ] Row-level buttons still work and do not trigger navigation.
- [ ] Manage is visually identical across every entity list.
- [ ] Keyboard access to the entity is preserved (name link intact).
- [ ] Definition of done per GUIDELINES.md.
