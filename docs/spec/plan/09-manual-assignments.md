# Step 09 — Manual Assignment Creation & Editing

## Objective
Ship the core Stage 1 workflow: create single and bulk assignments anywhere, with real-time validation, override for soft violations, and a lock flag for preset assignments (F6).

## Context
DESIGN_REVIEW C1/C4/C7 — there is currently **no way to create an assignment manually** (no POST endpoint, no UI); only edit/reassign/swap/delete of generated ones exist. `docs/plans/manual-assignment-creation.md` sketched this; this step supersedes it.

## Prerequisites
Steps 01, 02 (`locked`, `source` columns). Step 10's validator is the ideal validation source — build the validation entry point here as `validateAssignmentCandidate` in `src/lib/features/scheduling/services/assignment-validation.ts`, which step 10 will reuse/extend; coordinate signatures with `10-validation-engine.md` §Contract.

## Scope
**In:** assignment service + API (create single/bulk, update, lock), create/edit dialogs, wiring into calendar day slots (basic), student/preceptor pages hooks. **Out:** full calendar UX polish (step 11), validation of the whole schedule (step 10).

## Implementation

### Service & API
1. `src/lib/features/schedules/services/assignment-service.ts` (extend existing):
   - `createAssignment(db, scheduleId, input, { force })` — input: `student_id, preceptor_id, clerkship_id, site_id?, date, locked?`. Runs `validateAssignmentCandidate`; hard errors (student double-booked that date) always reject; soft violations (preceptor unavailable, blackout date, preceptor already has a student that day, site not allowed for clerkship, date outside schedule range, student not onboarded to the health system) reject unless `force: true`, in which case the assignment is created and the violations are returned as `warnings`. Sets `source='manual'`.
   - `createAssignmentsBulk(...)` — same input minus `date`, plus `start_date, end_date, weekdays: number[], skip_blackouts: boolean`. Expands to dates, validates each, returns per-date results; `force` applies to soft violations; hard-conflict dates are skipped and reported. Wrap in a transaction.
   - `setAssignmentLock(db, id, locked)`.
2. API:
   - `POST /api/schedules/assignments` — body supports `{ dry_run?: boolean, force?: boolean, ... }`; single or bulk (discriminate by presence of `date` vs `start_date`). `dry_run` returns validation results only. Envelope per GUIDELINES; scoped to active schedule.
   - `PATCH /api/schedules/assignments/[id]` — extend existing to accept `locked` and date changes with the same validation semantics.
3. Validation result shape (shared with step 10): `{ valid: boolean, hard: Violation[], soft: Violation[] }` where `Violation = { code, message, entity_refs }`. Codes: `student_double_booked`, `preceptor_unavailable`, `blackout_date`, `preceptor_capacity`, `site_not_allowed`, `outside_schedule`, `not_onboarded`.

### UI
4. `create-assignment-dialog.svelte` in `features/schedules/components/`: fields Student, Clerkship, Preceptor, Site (optional), Mode toggle **Single date | Date range**; range mode shows start/end + weekday checkboxes + "skip blackout dates". Props allow pre-filling and locking any field (so student page passes student, preceptor page passes preceptor, calendar passes date). Live validation via `dry_run` (debounced on field change): green "No conflicts", amber list of soft violations with a "Create anyway" path, red hard errors blocking submit. Clerkship picker shows remaining unscheduled days per option ("Pediatrics — 12 of 30 days unscheduled"). Preceptor picker marks unavailable-preceptors instead of hiding them.
5. `edit-assignment-modal.svelte`: extend with date editing (same validation), lock toggle (lock icon, tooltip "Locked assignments are preserved by auto-generation"), and consistent styling. Keep reassign/swap/delete.
6. Wire entry points: calendar empty-day "+" (minimal — polish in step 11), buttons on student overview/schedule tab (step 06) and preceptor schedule tab (step 07). If 06/07 haven't run, add the dialog to the existing `/students/[id]/schedule` and `/preceptors/[id]/schedule` pages so the feature is reachable now.

## Testing
- Unit (thorough — this is core): every violation code triggers correctly; force-create persists with warnings; bulk expansion (weekday filter, blackout skip, hard-conflict skip reporting, transaction rollback on unexpected error); lock toggle; date-change revalidation.
- API: dry_run vs real; force semantics; scoping (user B cannot create into user A's schedule); invalid ids → 400/404.
- E2E: from seeded data — create a valid assignment from a student page and see it on the calendar; attempt a double-booking (blocked with message); create over a blackout with force ("Create anyway"); bulk-create a Mon/Wed/Fri range and verify count; lock an assignment and see the icon.

## Acceptance criteria
- [ ] A user can build a complete student schedule by hand, from empty, in the UI (R6.1–R6.5).
- [ ] Hard conflicts impossible to save; soft violations require explicit override and remain visible afterwards.
- [ ] `locked`/`source` persisted correctly for future engine use.
- [ ] Definition of done per GUIDELINES.md.
