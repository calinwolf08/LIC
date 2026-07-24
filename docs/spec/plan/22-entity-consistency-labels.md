# Step 22 — Entity Consistency: "Manage" Actions and Read-Only Overviews

## Objective
Remove the two consistency complaints: list actions labelled "View" when they are how you edit, and a Details tab whose information is invisible from the Overview.

## Context (verified in code)
- `student-list.svelte:125`, `preceptor-list.svelte:166`, `health-system-table.svelte:197` all label the primary row action **"View"**, but the destination is the detail page where editing happens.
- `/locations` is worse: `health-system-table` offers **both** "View" and "Edit", where "Edit" opens a dialog (`+page.svelte:139-146`) — two ways to edit the same record, one of them a modal that the product spec reserves for simple creates.
- On `/preceptors/[id]` and `/students/[id]`, contact/identity fields live only in the Details tab behind an editable form; the Overview shows counts but not the basic facts.

## Prerequisites
None (independent; safe to run in parallel with 19–21).

## Scope
**In:** action labels across entity lists, `/locations` edit-dialog removal, Overview read-only summaries.
**Out:** any change to what the detail pages can edit.

## Implementation

1. **Rename the primary row action to "Manage"** on every entity list — students, preceptors, clerkships (currently "Configure"), health systems, sites, teams. One verb everywhere. Keep destructive "Delete" as-is.
2. **`/locations` — single path to edit.** Drop the "Edit" dialog buttons for health systems and sites; the row's **Manage** action navigates to the detail page (`/health-systems/[id]`, `/sites/[id]`). Keep dialogs only for **creating** simple entities, per PRODUCT_SPEC §6. If `/sites/[id]` lacks an edit surface, add the Details tab there so Manage has a real destination — verify before assuming.
3. **Overview shows the facts, Details edits them.** On student, preceptor, clerkship, health system and site detail pages, add a read-only "Details" summary card to the **Overview** tab (name, email, phone, health system, sites, capacity, type, required days — whatever the entity has), each value plain text, with a single **"Edit details"** button/link that switches to the Details tab. Use a shared `DetailSummary` component (label/value pairs) in `src/lib/components/` rather than repeating markup per entity.
4. **Keep names as links** (GUIDELINES) — clicking the entity name in a list still navigates, so "Manage" is a redundant affordance, not the only one.
5. Update any e2e selectors that target "View"/"Edit"/"Configure" (our current specs use `Configure` on clerkships and `Edit` on locations — both change here).

## Testing
- **Component:** `DetailSummary` renders label/value pairs and omits empty optional fields rather than printing "—" everywhere.
- **E2E:**
  1. Every entity list exposes **Manage** (assert the absence of "View" on students/preceptors and of the row-level "Edit" on locations).
  2. From `/locations`, Manage on a health system lands on its detail page; **no edit dialog is reachable from the row**.
  3. On a student and a preceptor, Overview shows the identity fields read-only, and "Edit details" switches to the Details tab where they are editable.
  4. Existing journeys updated for the new labels still pass end-to-end.

## Acceptance criteria
- [ ] One verb — "Manage" — for opening any entity across every list.
- [ ] Exactly one way to edit an entity: its detail page. No row-level edit dialogs.
- [ ] Overview surfaces the entity's key facts read-only with a clear route to editing.
- [ ] Definition of done per GUIDELINES.md.
