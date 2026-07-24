# Step 17 — Assignment Eligibility, Availability-Aware Dates & Override Model (backend)

## Objective
Build the server-side foundation the new assignment experience needs: cascading eligibility between clerkship/preceptor/site, day-level date state driven by preceptor availability and existing bookings, requirement-aware counting, and a persisted record of user overrides.

## Context (verified in code)
Today `create-assignment-dialog.svelte` loads four **unfiltered** lists (`/api/students`, `/api/preceptors`, `/api/clerkships`, `/api/sites`) and offers a bare `<input type="date">`. Nothing connects a preceptor to their availability, their sites, or the clerkships they can teach, so the user can compose combinations that are invalid and only discover it from a post-hoc warning.

The relations needed already exist: `preceptor_sites`, `clerkship_sites`, `preceptor_teams` + `preceptor_availability` (site-scoped), and `student_health_system_onboarding`. Teams carry `clerkship_id`, which is how a preceptor is associated with a clerkship.

There is **no representation of an override** — `schedule_assignments` has `locked`, `source`, `status` but nothing recording "the user knowingly double-booked here". The user wants overrides listed and reviewable, so they must be persisted.

## Prerequisites
Steps 15, 16.

## Scope
**In:** migration for override tracking, eligibility service, day-state service, requirement-count service, APIs. **Out:** all UI (step 18).

## Implementation

### Schema
1. Migration `0NN_assignment_overrides.ts`:
   - `schedule_assignments.override_codes TEXT NOT NULL DEFAULT '[]'` — JSON array of violation codes the user explicitly accepted (`preceptor_unavailable`, `preceptor_capacity`, `blackout_date`, `not_onboarded`, `over_required_days`, `past_date`).
   - `schedule_assignments.override_note TEXT NULL` — optional free text captured at override time.
   - Regenerate types (`npm run db:types`). Update every hand-built test schema that creates `schedule_assignments` (there are ~7; grep `createTable('schedule_assignments')`).

### Services (`src/lib/features/scheduling/services/`)
2. **`assignment-eligibility.ts`** — `getEligibleOptions(db, scheduleId, selection)` where `selection` is any subset of `{ studentId, clerkshipId, preceptorId, siteId }`. Returns each list annotated rather than truncated:
   ```ts
   { clerkships: Option[], preceptors: Option[], sites: Option[] }
   type Option = { id, name, eligible: boolean, reason?: string }
   ```
   Rules: preceptor ↔ clerkship via `preceptor_teams.clerkship_id`; preceptor ↔ site via `preceptor_sites`; clerkship ↔ site via `clerkship_sites`; everything restricted to entities in the active schedule. **Ineligible options are returned with `eligible: false` and a human reason, never hidden** — hiding makes the UI feel broken (GUIDELINES: mark, don't hide).
3. **`assignment-day-state.ts`** — `getDayStates(db, scheduleId, { preceptorId, studentId, siteId?, from, to })` returning one entry per date in range:
   ```ts
   { date, inRange, state: 'available'|'unavailable'|'unset'|'blackout',
     preceptorBookings: { assignmentId, studentId, studentName }[],
     preceptorAtCapacity: boolean, studentBusy: boolean, isPast: boolean }
   ```
   Sourced from `preceptor_availability` (site-scoped), `blackout_dates`, existing `schedule_assignments`, `preceptors.max_students`, and today's date. This is what lets the picker show availability **and** already-scheduled days.
4. **`requirement-preview.ts`** — `previewRequirementImpact(db, scheduleId, studentId, clerkshipId, dateCount)` → `{ required, completed, scheduled, unscheduled, selected: dateCount, resultingTotal, exceedsBy }`. Powers "you are assigning 4 of 3 remaining days".
5. **Extend `assignment-validation.ts`** with codes `over_required_days` (soft) and `past_date` (soft). Keep `student_double_booked` **hard**.
6. **Extend `assignment-service.ts`**:
   - `createManualAssignmentsBulk` accepts `dates: string[]` (explicit day list) in addition to the existing range+weekday form, plus `override_codes: string[]`, `override_note?: string`.
   - New `applyOverrideSideEffects(db, { kind, ... })` for the follow-up actions the dialog offers: `bump_preceptor_capacity` (increment `preceptors.max_students`), `mark_preceptor_available` (upsert a `preceptor_availability` row for that date/site), `remove_conflicting_assignment` (delete the other student's assignment). Each is an explicit, separately audited call — never an implicit side effect of creating an assignment.
   - `listOverrides(db, scheduleId)` → assignments with non-empty `override_codes`, joined to student/clerkship/preceptor names, for the schedule-health panel (step 20).

### API
7. `GET /api/schedules/assignments/options?studentId&clerkshipId&preceptorId&siteId` → eligibility lists.
8. `GET /api/schedules/assignments/day-states?preceptorId&studentId&siteId&from&to` → day states.
9. `GET /api/schedules/assignments/requirement-preview?studentId&clerkshipId&count` → requirement impact.
10. `POST /api/schedules/assignments` — extend to accept `dates[]`, `override_codes[]`, `override_note`, and `side_effects[]` (applied in the same transaction). Keep `dry_run`.
11. `GET /api/schedules/overrides` → `listOverrides`.
12. `DELETE /api/schedules/assignments/[id]` — accept `?force=true` to allow deleting a **past-dated** assignment; without it, past deletions return a 409 carrying the `past_date` code so the UI can offer the override.
All routes scope to the caller's active schedule and use the standard envelope.

## Testing
- **Unit — eligibility:** preceptor with no team for clerkship X → returned `eligible: false` with reason; site not in `clerkship_sites` → ineligible; entities outside the active schedule are absent entirely; empty selection returns everything eligible.
- **Unit — day states:** unavailable/unset/available classification; blackout wins over available; `preceptorBookings` lists the occupying student; `preceptorAtCapacity` respects `max_students`; `studentBusy` true where the student already has any assignment; `isPast` boundary at exactly today (today is **not** past); dates outside the schedule flagged `inRange: false`.
- **Unit — requirement preview:** exact-fit, under, and over cases; `exceedsBy` correct when already over.
- **Unit — overrides:** creating with `override_codes` persists them; `listOverrides` returns only overridden rows with names; each side effect mutates exactly its target and nothing else; a failing side effect rolls back the whole transaction.
- **Unit — past deletion:** blocked without force (409 + code), allowed with force.
- **API:** every new endpoint — happy path, missing params → 400, cross-tenant access → not returned, unauthenticated → 401.

## Acceptance criteria
- [ ] Eligibility is derivable for any partial selection and marks (not hides) invalid options with reasons.
- [ ] Every date in a range can be classified without an extra round trip per day.
- [ ] Overrides are persisted, queryable, and each optional side effect is explicit and transactional.
- [ ] Past-dated assignments are protected by default and removable with explicit force.
- [ ] Definition of done per GUIDELINES.md.
