# Step 29 — Date-Picker Clarity & Required Site

## Objective
Make it obvious which days a preceptor already has taken, and which of the days you have *selected*
are conflicting. Make the site a required part of an assignment.

## Context (verified in code)
In `assignment-date-picker.svelte`:

- The selected branch wins over every conflict branch:
  ```
  96  if (!inRange(date))            → muted
  98  if (selected.includes(date))   → 'bg-primary text-primary-foreground'   ← returns first
  99  if (day?.studentBusy)          → red
  102 preceptorBookings.length > 0   → 'bg-slate-200'
  ```
  So picking an already-taken day paints it solid primary and the conflict colour disappears — the
  reported "fills in black which makes it unclear which day is overlapping".
- A preceptor's taken days carry only `bg-slate-200` plus the occupying student's **first name**
  rendered in the cell (lines 116-120). Grey-plus-a-name is too quiet for "this day is spoken for".

For the site: `canSubmit` (`assignment-dialog.svelte:393-401`) requires student, clerkship,
preceptor and dates — **not** site. Site also drives real behaviour: `preceptor_availability` is
site-scoped and the `mark_preceptor_available` side effect needs a `site_id`, which is why the
unavailable-day override currently degrades to "pick a site to also update availability".

## Prerequisites
Step 26; step 28 is a natural pair (both touch the picker/dialog) but not a hard dependency.

## Scope
**In:** day-cell visual language, legend, and making site required.
**Out:** the override conversations themselves (already shipped).

## Implementation

1. **Selection must compose with state, not replace it.** Restructure `dayClass` so the *state*
   determines the fill and the *selection* adds an unmistakable overlay — e.g. keep the state colour
   and add `ring-2 ring-primary ring-offset-1` plus a checkmark for selected. A day that is both
   selected and conflicting must read as "selected **and** a problem" at a glance.
2. **Distinguish the three cases explicitly**, with distinct colour + iconography (not colour
   alone — accessibility):
   - **Taken by another student** (preceptor booked, capacity still available) — amber, with a
     small person/lock glyph and the occupying student(s) in the tooltip.
   - **Full** (`preceptorAtCapacity`) — stronger amber/orange with a "full" marker.
   - **This student is busy** (`studentBusy`) — red, hard conflict, not selectable-without-warning.
   Keep the name text, but make it secondary to the colour/glyph rather than the only signal.
3. **Selected-and-conflicting deserves its own affordance.** Under the grid, list the selected days
   that carry a conflict (date + reason), so a multi-day selection doesn't hide one bad day among
   twenty. `data-testid="selected-conflicts"`.
4. **Update the legend** (currently three entries) to cover every state actually rendered:
   available, unavailable, taken, full, student busy, blackout, out of range, selected.
5. **Require the site.**
   - Add `!!site` to `canSubmit`, and mark the field required in the label.
   - Server-side: make `site_id` required in the create/bulk assignment schemas — a client-only rule
     is not a rule (GUIDELINES). Keep it optional on the *edit* payload only if an existing row may
     legitimately have none; if so, backfill or require it on save and say which in the PR.
   - **Check the data first:** if existing assignments have `site_id IS NULL`, decide explicitly
     between a backfill migration and tolerating null on edit. Do not let the UI require something
     the stored data violates.
   - With site always present, simplify the unavailable-day override: it can always offer
     "Assign and mark available" rather than the "pick a site first" degraded path.

## Testing
- **Component (picker):** for each state, the rendered class/`data-state` is the expected one; a day
  that is *both* selected and booked keeps its conflict colour **and** gains the selected ring
  (assert both, since this is the reported bug); the legend lists every state the grid can render.
- **Component:** `selected-conflicts` lists exactly the conflicting members of a multi-day
  selection, with reasons.
- **Unit/API:** creating an assignment without `site_id` is rejected (400) with a field-level
  message; with a site it succeeds.
- **E2E:** open the dialog, select a day already taken by another student → the cell is visibly
  flagged (assert `data-state` and that it is *not* the plain selected state) and appears in the
  conflict list; Create is disabled until a site is chosen; choosing a site enables it; the
  unavailable-day override offers "Assign and mark available" without the site caveat.

## Acceptance criteria
- [ ] A selected day never loses its conflict indication.
- [ ] Taken / full / student-busy are visually distinct and legended, not colour-only.
- [ ] Conflicting days within a selection are listed explicitly.
- [ ] Site is required client- and server-side, with the existing-data question settled deliberately.
- [ ] Definition of done per GUIDELINES.md.
