# Round 3 — Tenant Isolation, Assignment Correctness & Health Accuracy (Steps 25–33)

Round 2 (steps 15–24) fixed the first round of beta findings. Round 3 addresses the second round,
reported after using the app with **two real accounts**. Read `GUIDELINES.md` first — it binds every
step. `HANDOFF.md` carries the operational notes (build/seed loop, seeded schedule shape).

## Read this first: Round 3 is not cosmetic

**Steps 26 and 27 are a data-privacy defect, not a bug list item.** A signed-in user currently sees
— and can modify or delete — other users' students, preceptors, clerkships, sites, health systems
and assignments. Everything else in this round is ordinary product work and can wait; 26 and 27
cannot ship late. Do them first, in order, and do not batch them with anything else.

## Execution order

```
25 (dev commands — independent, do first to make 26/27 verifiable by hand)
   │
26 (isolation: reads) ─> 27 (isolation: mutations)     ← ship these before anything else
   │
   ├─> 28 (edit-mode validation + note copy)
   ├─> 29 (date-picker clarity + required site)
   ├─> 30 (calendar rendering)
   ├─> 31 (list navigation + button consistency)
   └─> 32 (schedule health accuracy + pagination/filter)
                                   │
                                  33 (integrated regression)
```

| Step | Title | Depends on | Priority |
|---|---|---|---|
| 25 | Dev data commands (reset one user / reset everything) | — | Do first (unblocks manual QA) |
| 26 | Tenant isolation — every read scoped to the active schedule | 25 | **Critical** |
| 27 | Tenant isolation — every mutation ownership-guarded | 26 | **Critical** |
| 28 | Edit-mode validation correctness + note copy | 26 | High |
| 29 | Date-picker clarity + required site | 26 | High |
| 30 | Calendar rendering: student identity, per-student colour, clerkship link | 26 | Medium |
| 31 | Entity list row navigation + Manage button consistency | — | Low |
| 32 | Schedule health: accurate counts, stale overrides, pagination + filter | 26 | High |
| 33 | Integrated regression | all | — |

## Root causes (verified in code)

Six findings explain the whole list. Read these before picking up any step.

1. **There is no tenant boundary on reads.** Round 2 scoped the *schedule range*, not the *entity
   sets*. Confirmed unscoped today:
   - `(app)/dashboard/+page.server.ts:42-59` — all four counts are bare
     `selectFrom('students'|'preceptors'|'clerkships'|'schedule_assignments')` with **no join** to the
     `schedule_*` junctions.
   - `(app)/locations/+page.server.ts:5-9` — `selectFrom('health_systems')` and
     `siteService.getAllSites()`, no scoping at all, and the `load` doesn't even take `locals`.
   - `(app)/calendar/+page.server.ts:43-45` — `getStudents(db)`, `getPreceptors(db)`,
     `getClerkships(db)` (the unscoped variants) feed the filter dropdowns.
   - `calendar-service.ts` `getEnrichedAssignments` — filters by date and optional ids only; never
     joins `schedule_students`. This is why other users' assignments appear on the calendar.
   Scoped variants (`getStudentsBySchedule`, `getPreceptorsBySchedule`, …) already exist from earlier
   work — the callers simply don't use them. **Step 26.**

2. **There is no ownership check on any entity mutation.** `PATCH`/`DELETE` for
   `students|preceptors|clerkships|sites|health-systems/[id]` contain **zero** references to
   `getActiveScheduleId` or any `schedule_*` junction. Any authenticated user can modify or delete
   any row by id. **Step 27.**

3. **Edit mode validates as if it were a create.** `excludeId` is supported in
   `assignment-validation.ts` (lines 139, 267, 315, 379) but **not** in `assignment-day-state.ts` or
   `requirement-preview.ts`, and the dialog never sends it. So opening an existing assignment reports
   `student_double_booked` against **itself** and counts its own day toward "more days than
   required". **Step 28.**

4. **Selection styling erases the conflict signal.** In `assignment-date-picker.svelte` the
   `selected.includes(date)` branch (line 98) returns `bg-primary` *before* the booked/busy branches
   are reached, so picking an already-taken day turns it solid dark and the warning colour is lost.
   A preceptor's taken days are also only distinguished by `bg-slate-200` plus a first name in the
   cell. **Step 29.**

5. **The schedule-wide calendar renders in student mode.** `(app)/calendar/+page.svelte:688` passes
   `mode="student"` to `ScheduleCalendarGrid`, and in that mode `primaryLabel` returns the clerkship
   and `secondaryLabel` the preceptor — the student is dropped. Cell colour is
   `getClerkshipColor(specialty)`, so colour encodes clerkship, not student. **Step 30.**

6. **Capacity violations are counted per assignment, not per over-subscribed slot.**
   `schedule-validation.ts:171-179` runs inside the per-assignment loop, so a day where two students
   share a max-1 preceptor yields **two** `preceptor_capacity` violations. Four double-booked days →
   8. Separately, `listOverrides` returns any row with non-empty `override_codes` and never
   re-evaluates them, so a `not_onboarded` exception still appears after the student is onboarded.
   **Step 32.**

## Issue → step traceability

| # | Reported issue | Step |
|---|---|---|
| 1 | Need a command to clear one test user without wiping the DB | 25 |
| 2 | Need a command to clear everything for a fresh start | 25 |
| 3 | Dashboard totals (students/preceptors/clerkships/assignments) are global | 26 |
| 4 | Locations shows other users' health systems and sites | 26 |
| 5 | Student → Progress tab shows other users' clerkships | 26 |
| 6 | Calendar shows other users' assignments | 26 |
| 7 | Can modify or delete other users' data | 27 |
| 8 | Edit assignment falsely reports "Student already has an assignment" | 28 |
| 9 | Edit assignment falsely warns "More days than required" | 28 |
| 10 | Note placeholder implies an exception is being made when none is | 28 |
| 11 | Preceptor's already-taken days are not clearly indicated | 29 |
| 12 | Selecting an already-taken day turns it black, hiding the overlap | 29 |
| 13 | Site should be required when adding an assignment | 29 |
| 14 | Calendar cells omit the student; colour should be per student | 30 |
| 15 | Calendar list view: clerkship is not a link (student/preceptor are) | 30 |
| 16 | Student/Preceptor/Clerkship list rows should be clickable like Locations | 31 |
| 17 | Manage button is black on Clerkships only; make it black everywhere | 31 |
| 18 | Resolved `not_onboarded` overrides still listed | 32 |
| 19 | Capacity conflict count doubles (8 instead of 4) | 32 |
| 20 | Conflict pill count is wrong for the same reason | 32 |
| 21 | Only capacity appears under "Conflicts by type"; others only under "Overrides" | 32 |
| 22 | Override list is unpaginated/overflowing and has no type filter | 32 |

## Standing requirements

- `GUIDELINES.md` applies: shared primitives only, no hand-rolled modals, Kysely through feature
  services, standard API envelope, server-side gating.
- **Every step ships tests.** Steps 26/27 additionally require the isolation tests described in
  their docs — those are the regression net for a privacy defect and are not optional.
- Write the failing test first for each bug fix, so the regression is provably caught.
- After any migration: `npm run db:types` and update the hand-built test schemas that create
  `schedule_assignments` (~10 of them; grep `createTable('schedule_assignments')`).
- Quality gates: `npx vitest run`, `npx svelte-check --tsconfig ./tsconfig.json`,
  `npx playwright test`, `npm run build`.
