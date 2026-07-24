# Step 10 — Standalone Validation & Requirement-Status Engine

## Objective
A generation-independent service that answers, for the active schedule at any moment: *what is wrong* (violations) and *where does each student stand* (completed / scheduled / unscheduled per clerkship, as of today) — powering the student list/detail, preceptor detail, calendar markers, dashboard, and readiness checklist.

## Context
DESIGN_REVIEW C2/C3: conflict detection only runs inside generation; requirement progress is a bare percentage that assumes generation ran. Stage 1 is a *manual* tool, so validation must run against whatever assignments exist.

## Prerequisites
Steps 02, 09 (shares `assignment-validation.ts` and the `Violation` shape).

## Contract (other steps consume these — keep stable)

```ts
// src/lib/features/scheduling/services/schedule-validation.ts
validateSchedule(db, scheduleId): Promise<ScheduleValidationResult>
// { violations: ScheduleViolation[], byDate: Map<date, ScheduleViolation[]>,
//   byStudent: Map<id, ...>, byPreceptor: Map<id, ...> }
// ScheduleViolation = Violation (step 09 codes) + { assignment_id, date }

// src/lib/features/scheduling/services/requirement-status.ts
getStudentStatuses(db, scheduleId, today: string): Promise<StudentStatus[]>
// StudentStatus = { student_id, overall: Counts, per_clerkship: Array<{
//   clerkship_id, required, completed, scheduled, unscheduled }>,
//   scheduling_state: 'full'|'partial'|'none', conflict_count }
// Counts = { required, completed, scheduled, unscheduled }

// src/lib/features/scheduling/services/readiness.ts
getSetupChecklist(db, scheduleId, entitled: boolean): Promise<ChecklistItem[]>
// ChecklistItem = { id, label, done, count?, href } — href deep-links to the fixing page
```

## Implementation

1. **`validateSchedule`**: single-pass over all assignments in the schedule, reusing the per-assignment checks from step 09 but batch-loading inputs (availability maps via `resolveAvailability` from step 07 — if not yet extracted, extract here; blackout set; capacity counts per preceptor-date; clerkship-site allowlists; onboarding table). No N+1 queries. Include `outside_schedule` for assignments outside the schedule's date range (supports step 05's date-shrink case). Target < 2s at 10k assignments (add a perf test with a generated large fixture, non-blocking threshold assert or `console.time` documented).
2. **`getStudentStatuses`**: per student per clerkship: `completed` = assignments with date < today; `scheduled` = date ≥ today; `unscheduled = max(0, required − completed − scheduled)`; note over-scheduling as `scheduled > needed` is allowed but expose `over_scheduled` count. `scheduling_state`: `full` if every clerkship unscheduled = 0, `none` if zero assignments, else `partial`.
3. **`getSetupChecklist`** items (Stage 1): has ≥1 clerkship with required days > 0; has ≥1 student; has ≥1 preceptor; all preceptors have availability (count of those without); has ≥1 site & health system; schedule dates set; blackout dates reviewed (done = user has visited or added ≥1; store a `schedule.blackouts_reviewed` flag or derive — implementer's choice, document it). Entitled-only items (shown only when `entitled`): every clerkship has a team or capacity config, etc. — keep minimal, one or two items, refined in step 13.
4. **API**: `GET /api/schedules/validation` and `GET /api/schedules/status` (batch student statuses), `GET /api/schedules/checklist` — all scoped to active schedule, cached per request only (no persistence).
5. **Wire minimal consumers now** (fuller UIs come in their own steps): student list/detail if step 06 already landed (replace its stubs); calendar day markers if step 11 hasn't landed yet, skip — step 11 owns it. Replace the `students/completion-stats` endpoint usages with the new status endpoint and delete the old one if nothing else consumes it.

## Testing
- Unit (core of the step — be exhaustive): fixture schedule exercising every violation code; boundary dates (today, schedule start/end); student with no assignments; over-scheduled clerkship; onboarding missing; capacity exactly-at vs over; batch correctness vs per-assignment validator (property: `validateSchedule` finds exactly the union of per-assignment soft+hard violations).
- Perf: fixture with ~5k assignments completes `validateSchedule` + `getStudentStatuses` under 2s in CI.
- API: auth + scoping tests; response shapes.
- E2E: seeded deliberate violation (from step 02 seed) appears in `GET /api/schedules/validation` and on whichever UI consumer exists at this point.

## Acceptance criteria
- [ ] The three contract functions exist with tests proving the semantics above.
- [ ] Requirement status works with zero generation involvement.
- [ ] Old completion-stats path removed or delegating to the new service.
- [ ] Definition of done per GUIDELINES.md.
