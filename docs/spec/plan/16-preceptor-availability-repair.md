# Step 16 — Preceptor Availability: Crash Fix, Wizard Completion, Layout

## Objective
Make setting preceptor availability actually work. Today it crashes, the creation wizard's final step is a dead end, and the editor is buried below a full-year calendar.

## Context (verified in code)
1. **Crash.** `pattern-form.svelte:31` runs `sites.length === 1 ? sites[0].id : ''` at component init. Its caller `pattern-availability-builder.svelte:414` passes `sites={preceptor.sites}`, and the preceptor object supplied by `/preceptors/[id]` (`+page.ts` → `/api/preceptors/[id]`) does **not always include a `sites` array**. Result, exactly as reported:
   `Uncaught TypeError: can't access property "length", $$props.sites is undefined`.
2. **Wizard dead end.** `/preceptors/new` step 3 renders `PatternAvailabilityBuilder` only when `createdPreceptor.sites.length > 0`; otherwise it shows "No sites are assigned to this preceptor". `createdPreceptor.sites` is read back from `GET /api/preceptors/[id]` (`+page.svelte:~183`). The user selected a site on step 2, so either the create call is not persisting `site_ids` or the read-back does not hydrate `sites` — **determine which before fixing** (add a failing test first). Our own e2e hit the same path: the site checkbox state did not survive into step 3.
3. **Layout.** On `/preceptors/[id]` the availability tab renders the calendar card first and "Edit availability" last (`+page.svelte:~140`), so the primary action is below the fold.
4. Availability is **site-scoped**: `preceptor_availability` has a `NOT NULL site_id` (`src/lib/db/types.ts:176-184`). A preceptor with no site therefore genuinely cannot have availability — the wizard must resolve the site, not just warn.

## Prerequisites
Step 15 (so calendars/capacity are bounded to the schedule range).

## Scope
**In:** the crash, wizard step 2→3 site propagation, availability editor placement, range-bounded availability/capacity views.
**Out:** consuming availability during assignment creation (steps 17–18).

## Implementation

1. **Harden the contract.** In `pattern-form.svelte` default the prop (`sites = []`) and derive the initial site with a guard. Type it `Site[]` (not optional) and make every caller satisfy it — a defaulted prop stops the crash, but the real fix is the data.
2. **Guarantee `sites` on the preceptor payload.** `GET /api/preceptors/[id]` must always return `sites: Array<{id, name, health_system_id}>` (empty array, never `undefined`), joined via `preceptor_sites`. Do the same for the list endpoint's `site_ids`. Add a unit test asserting the key is always present.
3. **Fix wizard site persistence.** In `/preceptors/new`: confirm `createPreceptorSchema` carries `site_ids`, that `POST /api/preceptors` writes `preceptor_sites` rows, and that step 3 hydrates from that write. Also fix the step-2 UX so the chosen health system reliably filters sites and a selection is retained across the step transition.
4. **Make step 3 always usable.** If the preceptor ends up with no site, do **not** dead-end: show an inline site picker/creator in step 3 (reuse `SiteForm` in a dialog) so availability can be set without leaving the wizard. Only after a site exists render `PatternAvailabilityBuilder`. Keep an explicit "Skip for now" that returns to `/preceptors`.
5. **Reorder the availability tab.** Editor first, calendar second: `Set availability` card (pattern builder) at the top, `Availability calendar` (read-only visualisation) below it. Same treatment on the schedule tab: primary action above the calendar.
6. **Bound both calendars.** The availability calendar, the schedule-tab calendar, and `PreceptorCapacitySummary` render only months intersecting the active schedule range (step 15 supplies this). Remove any month bucket with zero in-range days.
7. **Feedback.** After saving a pattern, `toast.success` and refresh the calendar in place (no full reload).

## Testing
- **Unit:** `GET /api/preceptors/[id]` always includes `sites` (populated and empty cases); creating a preceptor with `site_ids` writes `preceptor_sites` and the read-back returns them; pattern save writes the expected `preceptor_availability` rows for weekly/block/individual patterns.
- **Component/regression:** rendering `PatternForm` with `sites` undefined **does not throw** (guards the exact reported error).
- **E2E (new journey, must fail before the fix):** create a preceptor via the wizard **with a site** → step 3 shows the availability builder (not the "no sites" warning) → add a weekly Mon/Wed pattern → land on `/preceptors` → open the preceptor → availability tab shows the editor **above** the calendar → the calendar shows only the schedule's months → the Mon/Wed days are marked available.
- **E2E:** open availability tab for a preceptor with no sites → inline site picker appears → adding a site enables the builder.

## Acceptance criteria
- [ ] "Add pattern" never throws; availability renders after saving.
- [ ] A site chosen in wizard step 2 is present in step 3; step 3 is never a dead end.
- [ ] Availability editor appears above the calendar on both relevant tabs.
- [ ] No month outside the schedule range appears in availability or capacity.
- [ ] Definition of done per GUIDELINES.md.
