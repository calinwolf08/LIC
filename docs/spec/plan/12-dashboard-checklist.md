# Step 12 — Dashboard & Setup Checklist

## Objective
Turn the dashboard into the answer to "what should I do next?": setup checklist (U12/F8), validation summary, student status breakdown, and at-risk list — replacing the localStorage welcome heuristic.

## Context
DESIGN_REVIEW B6, E3. Current dashboard: static counts, a conditional getting-started card, and a welcome modal triggered by `localStorage` + a schedule named "My Schedule".

## Prerequisites
Step 10 (checklist + status + validation services), step 01.

## Scope
**In:** `/dashboard`, first-run experience. **Out:** the services themselves (step 10).

## Implementation

1. **Setup checklist card** (top position until complete, collapsed into a ✓ pill once all Stage 1 items done): renders `getSetupChecklist` items with done/pending state, counts ("3 preceptors have no availability"), and each item deep-linking via its `href`. Entitled users see the extra Stage 2 items in a separate subsection "Auto-generation readiness".
2. **Schedule health card**: from `validateSchedule` — total violations by type with links (each → `/calendar` filtered/anchored appropriately, e.g., `?date=` of first offending day). Green "No conflicts" state.
3. **Student status card**: fully/partially/unscheduled counts (from `getStudentStatuses`, replacing the old stats endpoint if redundant — remove dead endpoint) + an **at-risk list**: up to 5 students with the largest unscheduled day counts, linking to their detail pages, with "View all" → `/students`.
4. **Counts row**: keep students/preceptors/clerkships/assignments counts, each card clickable to its section.
5. **Quick actions**: Add student, Add preceptor, Open calendar, Export schedule (entitled: Generate schedule → `/generate`).
6. **First-run**: delete `WelcomeScheduleModal` + localStorage logic. New-user flow = schedule creation (enforced by schedule-first routing) → dashboard where the checklist *is* the onboarding. If the active schedule still has the default name, the checklist's first item is "Name your schedule & set dates" linking to `/schedules` edit.
7. Empty states: no schedule handled by existing redirect; schedule with zero entities shows checklist prominently and hides health/status cards (nothing to compute).

## Testing
- Unit: checklist rendering logic (item states from service data), at-risk selection/sort helper.
- E2E: fresh user (register → create schedule) lands on dashboard with all checklist items pending and each link navigating correctly; seeded user sees partial checklist, violation summary matching the seeded violation, at-risk students listed and clickable; completing an item (add availability to the last preceptor) flips it to done after revisit.
- Regression: no `WelcomeScheduleModal` references; `grep -rn "schedule_configured" src` empty.

## Acceptance criteria
- [ ] A new user is guided start-to-finish by the checklist alone (R9.1/R9.2, U12/F8 closed for Stage 1).
- [ ] Every dashboard figure links to the page where the user acts on it.
- [ ] localStorage onboarding heuristic removed.
- [ ] Definition of done per GUIDELINES.md.
