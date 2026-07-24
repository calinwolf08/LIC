# Step 18 — One Assignment Dialog Everywhere (cascading, availability-aware, override flows)

## Objective
Replace the current thin dialog with a single component used identically from the student page, the calendar, and the preceptor page — cascading selections, a real date picker driven by preceptor availability, guided override conversations, and requirement feedback.

## Context (verified in code)
`create-assignment-dialog.svelte` today: four unfiltered `<select>`s, a raw date input, a "Lock this assignment" checkbox **visible to every user** (must be Stage-2 gated), and a debounced dry-run that can only say "No conflicts" / warn / block. `edit-assignment-modal.svelte` is a separate, differently-shaped component. The user's requirement is that all three entry points behave the same, differing only in which field is pre-filled and locked.

## Prerequisites
Step 17 (all data comes from its endpoints).

## Scope
**In:** one create/edit dialog component + override sub-dialogs + entitlement gating.
**Out:** page-level integration (steps 19–21) beyond exporting a ready component.

## Implementation

1. **Component `assignment-dialog.svelte`** (replaces `create-assignment-dialog.svelte`; `edit-assignment-modal.svelte` becomes a thin wrapper in `mode="edit"`).
   Props: `mode: 'create' | 'edit'`, `assignmentId?`, prefill+lock for `studentId | preceptorId | clerkshipId | siteId | date`, `dateMode?: 'single' | 'multi'`, `onSaved`.
   - **Edit mode edits exactly one day** (per the user's requirement) — the multi-date picker collapses to a single date.
2. **Cascading selects.** Any change re-queries `/options`. Ineligible entries render disabled with their reason as helper text (e.g. "Dr. Lee — not on a team for Pediatrics"), never silently removed. A selection made invalid by a later change is cleared with an inline notice.
3. **Date picker (replaces `<input type="date">`).** A month grid over the schedule range, fed by `/day-states`, with three selection modes matching the availability builder's vocabulary: **Single**, **Range** (+ weekday filter), **Individual days** (click to toggle). Each day is colour/legend coded: available · unavailable · unset · blackout · preceptor already booked (shows the occupying student) · student already busy · out of range · past. Days outside the schedule are not selectable. Selecting an unavailable/booked day is permitted but flags the day for an override conversation on submit.
4. **Requirement feedback.** Live strip under the clerkship select from `/requirement-preview`: "Assigning 3 days · 2 of 3 remaining for Pediatrics". If the selection exceeds the requirement, show an amber **"1 day more than required"** warning (soft, overridable) — this is the user's over-assignment warning.
5. **Override conversations.** On submit, group flagged days and ask once per category, each a `ConfirmDialog` with explicit choices (no `window.confirm`):
   - **Preceptor unavailable** → *Cancel* / *Assign anyway (one-time exception)* / *Assign and mark the preceptor available on these dates* (→ `mark_preceptor_available`).
   - **Preceptor already has a student** → *Cancel* / *Double-book this day* / *Move the other student off this day* (→ `remove_conflicting_assignment`, naming the student). If double-booking is chosen, ask a second question: *Allow just this exception* vs *Raise this preceptor's student limit* (→ `bump_preceptor_capacity`).
   - **Blackout / not onboarded / over-required / past date** → single accept-or-cancel.
   Accepted categories are submitted as `override_codes` (+ optional note); chosen side effects as `side_effects[]`. **Hard** conflicts (student double-booked) are never overridable — the affected days are listed and excluded.
6. **Stage-2 gating.** Render the "Lock this assignment" checkbox only when `$page.data.entitlements.includes('autogen')`. The server must also ignore `locked` from non-entitled callers — gate on both sides (GUIDELINES).
7. **Context panel.** The dialog shows a compact read-only summary of the selected student's clerkship progress and their currently assigned preceptors, so the user has that context while assigning (the deeper view lives on the student page — step 19).
8. Delete the old component only after all call sites migrate; keep the export name stable via `features/schedules/components/index.ts`.

## Testing
- **Component:** ineligible options disabled with reasons; changing preceptor clears an now-invalid site; day grid renders one cell per in-range date and none outside; past/out-of-range days unselectable; lock checkbox absent without the entitlement and present with it; requirement strip updates with selection count.
- **Unit:** the submit payload builder — selected days + accepted categories → correct `override_codes` and `side_effects`; hard-conflict days excluded from the payload.
- **E2E (new journeys):**
  1. Cascading — pick a clerkship, confirm a preceptor with no team for it is shown disabled with a reason.
  2. Availability-aware — set a preceptor available Mon/Wed only, open the dialog, confirm Tue/Thu are marked unavailable and the preceptor's existing booking shows the other student's name.
  3. Unavailable override — select an unavailable day → choose "Assign and mark available" → assignment created **and** the preceptor's availability now shows that day available.
  4. Double-book override → choose "Move the other student" → the other student's assignment is gone; repeat choosing "Raise the limit" → `max_students` incremented.
  5. Over-required warning appears when selecting more days than remain, and can be accepted.
  6. Non-entitled user sees no lock checkbox; a forged `locked: true` POST is ignored.

## Acceptance criteria
- [ ] One component serves student, calendar and preceptor entry points; edit mode edits a single day.
- [ ] Selections filter each other; invalid options are visible, disabled and explained.
- [ ] Dates reflect real preceptor availability and existing bookings; range/individual/single selection all work.
- [ ] Every override is an explicit choice, persisted, with the offered side effects applied only when chosen.
- [ ] Lock is invisible and inert without the `autogen` entitlement.
- [ ] Definition of done per GUIDELINES.md.
