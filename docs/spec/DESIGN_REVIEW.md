# Design Review — Current App vs. Spec

**Date:** 2026-07-20
**Scope:** evaluation of the implemented app (`src/`) against `docs/spec/PRODUCT_SPEC.md`. Each finding links to the plan step that fixes it (`docs/spec/plan/`).

## Summary

The backend is substantially ahead of the frontend: a sophisticated constraint engine, violation tracking, smart regeneration, and a 40-table schema exist, but the core Stage 1 experience (manual scheduling + validation + clear navigation) is incomplete and inconsistent. The app currently reads as an _auto-generation tool with manual patching_, while the product goal is a _manual scheduling tool with optional auto-generation_.

## Status (implementation, Steps 01–14)

All findings below are **fixed** except where noted. Highlights by area:

- **A (interaction patterns):** A1–A7 fixed — shared dialog/ConfirmDialog/toast primitives (Step 01); preceptor & student editing consolidated onto detail pages (Steps 06/07); clerkship add is now a page (Step 08); no browser `alert/confirm` or hand-rolled modal overlays remain (except the mobile nav drawer).
- **B (navigation/IA):** B1 (dead schedule-edit link) fixed via edit dialog (Step 05); B2 (orphaned results) → `/generate/results` (Step 13); B3 (blackout nav) surfaced on the calendar (Steps 04/11); B4 (teams entanglement) → teams moved under `/generate` (Steps 08/13); B5 terminology unified (Step 04); B6 (setup guidance) → dashboard checklist (Step 12); B7 (student page duplication + drill-through) fixed (Step 06).
- **C (Stage 1 gaps):** C1 **manual assignment creation** shipped (Step 09); C2 standalone `validateSchedule` (Step 10); C3 completed/scheduled/unscheduled status (Steps 06/10); C4 locked assignments (Steps 02/09/13); C5 availability calendar (Step 07); C6 unsaved-guard primitive (Step 01; adopt opportunistically); C7 calendar click-to-create (Steps 09/11).
- **D (Stage 2 gating):** D1–D5 fixed — server-enforced entitlements (Step 03), engine config split from Stage 1 and consolidated into the gated `/generate` hub (Steps 08/13), diagnostics exposed on the results page.
- **E (platform):** E1 e2e core-journey coverage partially delivered (gating journey authored; broader journeys are CI-run — see Step 14); E2 `window.location.reload` removed; E3 localStorage welcome heuristic removed (Step 12); E4 **deferred** — additive migration 026 instead of a single consolidated baseline (data is disposable; noted in Step 02); E5 repo hygiene (sqlite untracked, root artifacts) partially done.

Deferred items (tracked, low-risk): E4 baseline-migration consolidation; calendar URL-filter persistence and blackout-as-header-dialog (Step 11); full axe/a11y automated pass (Step 14).

## A. Interaction-pattern inconsistencies (spec §6)

| #   | Finding                                                                                                                                                                                                                          | Evidence                                                                                  | Fix          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| A1  | Create/edit patterns differ per entity: preceptor create = full-page wizard but preceptor **edit** = modal, and availability is edited via modal from the list _and_ via a separate full page (`/preceptors/[id]/availability`). | `(app)/preceptors/+page.svelte:236-265`, `preceptors/new`, `preceptors/[id]/availability` | Step 07      |
| A2  | Students: create = page, edit = inline tab on detail; `/students/[id]/edit` is a stub that client-redirects.                                                                                                                     | `students/[id]/edit/+page.svelte`                                                         | Step 06      |
| A3  | Clerkships: create = hand-rolled modal (raw divs, not the dialog component); edit = full config page.                                                                                                                            | `(app)/clerkships/+page.svelte:111-120`                                                   | Step 08      |
| A4  | Sites use full pages (`/sites/new`, `/sites/[id]/edit`), health systems use a form toggle + **browser `alert()`/`confirm()`** for delete.                                                                                        | `(app)/health-systems/+page.svelte:16-60`                                                 | Step 05      |
| A5  | Three different delete-confirmation patterns: shadcn dialogs (students/preceptors/clerkships), browser confirm (health systems), inline "Delete? Yes/No" buttons (schedules).                                                    | `(app)/schedules/+page.svelte:154-193`                                                    | Steps 01, 05 |
| A6  | Modals are hand-rolled (`fixed inset-0 z-50 bg-black/50` divs) in several places rather than the shared dialog component — inconsistent behavior (escape/focus/scroll).                                                          | `clerkships/[id]/config/+page.svelte:607-640`, `preceptors/+page.svelte`                  | Step 01      |
| A7  | `alert()` also used for export failure on the calendar.                                                                                                                                                                          | `(app)/calendar/+page.svelte:272`                                                         | Step 11      |

## B. Navigation & information architecture

| #   | Finding                                                                                                                                                                                                                                                                           | Evidence                                                       | Fix          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| B1  | **Dead link:** `/schedules` "Edit" button navigates to `/schedules/[id]/edit`, which does not exist (404).                                                                                                                                                                        | `(app)/schedules/+page.svelte:143`; no such route dir          | Step 05      |
| B2  | `/schedule/results` (violation stats, suggestions) is orphaned — not in the sidebar, nothing links to it. All the diagnostic backend work is invisible.                                                                                                                           | route exists; nav in `(app)/+layout.svelte:24-33` has no entry | Step 13      |
| B3  | Blackout dates have no nav presence; they're a collapsible panel inside the calendar page only.                                                                                                                                                                                   | `calendar/+page.svelte:26-33`                                  | Steps 04, 11 |
| B4  | Teams live under `/preceptors/teams` with `?fromClerkship=` query-param back-links — a brittle patch over the U13 dead-end. Teams are also presented as mandatory ("every preceptor must belong to a team") though they only matter for auto-generation.                          | `preceptors/+page.svelte:17-30,146-153,213-215`                | Steps 08, 13 |
| B5  | Concept naming still split: sidebar says "Schedule Periods" and "Schedule Calendar"; `/schedules` page says "Schedules"; results page says "scheduling period"; two "active" badges ("Active" vs "Server Active") on the schedules list confuse the single-active-schedule model. | `schedules/+page.svelte:105-114`                               | Steps 04, 05 |
| B6  | Setup order guidance (U12) still missing: dashboard has a minimal "Getting Started" card only when counts are zero; no checklist, no deep links to what's missing, no readiness concept (F8).                                                                                     | `dashboard/+page.svelte:213-231`                               | Steps 10, 12 |
| B7  | Student detail duplicates itself: a "Calendar" tab showing a 10-row preview plus a separate `/students/[id]/schedule` page, with two "View Full Schedule" buttons. Drill-through is absent: preceptor/clerkship names in assignment rows are plain text, not links.               | `students/[id]/+page.svelte:255-331`                           | Step 06      |

## C. Stage 1 functional gaps

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                    | Fix                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| C1  | **No manual assignment creation.** There is no POST endpoint at `/api/schedules/assignments` (only `[id]` PATCH/DELETE, `reassign`, `swap`) and no create UI. The only way to put assignments on the calendar is the generation engine — the core Stage 1 workflow is missing. The dev plan exists (`docs/plans/manual-assignment-creation.md`) but was never implemented. | `src/routes/api/schedules/assignments/` has no `+server.ts` | Step 09                             |
| C2  | No standalone validation: conflict/violation detection runs only inside generation. A manually edited schedule is never re-checked; the calendar shows no conflict markers.                                                                                                                                                                                                | engine services under `features/scheduling/`                | Step 10                             |
| C3  | Requirement status is percent-complete only; no completed/scheduled/unscheduled split by today's date (spec R2.3/R7.1). Student progress tab says "Generate a schedule to see clerkship progress" — Stage 1 users may never generate.                                                                                                                                      | `students/[id]/+page.svelte:229-243`                        | Steps 06, 10                        |
| C4  | No locked/preset assignments (F6): schema has `status` on assignments but no lock concept honored by the engine or UI.                                                                                                                                                                                                                                                     | `ScheduleAssignments` type                                  | Step 09                             |
| C5  | No preceptor availability calendar visualization (F5); availability is pattern rows only.                                                                                                                                                                                                                                                                                  | `pattern-availability-builder.svelte`                       | Step 07                             |
| C6  | Unsaved-changes warning (U9) not implemented anywhere.                                                                                                                                                                                                                                                                                                                     | —                                                           | Step 01 (utility), applied in 05–09 |
| C7  | Calendar can't create anything; day click only opens the first existing assignment.                                                                                                                                                                                                                                                                                        | `calendar/+page.svelte:355-359`                             | Steps 09, 11                        |

## D. Stage 2 gating gaps

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                             | Fix          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| D1  | No entitlement concept at all: any logged-in user can generate/regenerate, bypass constraints, and see engine config.                                                                                                                                                                                                                                                                                                                                                            | `regenerate-dialog.svelte` exposes constraint-bypass checkboxes on the main calendar | Step 03      |
| D2  | Clerkship config mixes Stage 1 data (name/type/required days/sites) with pure engine config (assignment strategy, health-system rule, capacity, blocks, team min/max, fallbacks) in one page — the exact "options with no clear meaning" the user flagged. Three strategy options (`team_continuity`, `continuous_single`, `continuous_team`) share one identical description — redundant to the user. "Max Students Per Day/Year" doesn't say per-what (preceptor? clerkship?). | `clerkships/[id]/config/+page.svelte:380-546`                                        | Steps 08, 13 |
| D3  | "Default Scheduling Rules" (global inpatient/outpatient/elective defaults) is a tab on the Clerkships list — engine config in a core page.                                                                                                                                                                                                                                                                                                                                       | `clerkships/+page.svelte:106-108`                                                    | Steps 08, 13 |
| D4  | Generation/regeneration UI (with smart modes, completion mode, strategies) sits on the main calendar toolbar — Stage 2 surface in the Stage 1 workspace.                                                                                                                                                                                                                                                                                                                         | `calendar/+page.svelte:220-233`                                                      | Steps 11, 13 |
| D5  | Violation stats / suggestions backend output ignored except on the orphaned results page.                                                                                                                                                                                                                                                                                                                                                                                        | `docs/scheduling/current-state-analysis.md` (confirmed still true)                   | Step 13      |

## E. Platform / production-readiness gaps

| #   | Finding                                                                                                                                                                                                                                                                                                                                          | Fix                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| E1  | Tests are engine-heavy (30 of 67 unit test files in `scheduling/`), thin on UI-adjacent services and page flows; e2e suite exists but logs in repo root suggest instability; no CI-enforced e2e for core journeys.                                                                                                                               | Steps under-test rule in GUIDELINES + Step 14 |
| E2  | `window.location.reload()` used for state refresh (student onboarding toggle).                                                                                                                                                                                                                                                                   | Step 06                                       |
| E3  | Welcome flow relies on `localStorage` flag + schedule named "My Schedule" heuristic.                                                                                                                                                                                                                                                             | Step 12                                       |
| E4  | Schema drift: 25 incremental migrations with dead concepts (dropped specialty, old availability model, `preceptor_site_clerkships`), junction tables for a "shared entities" model that adds copy-on-conflict complexity of questionable value for a single-admin product. Data does not need preserving — a consolidated baseline is cheap now. | Step 02                                       |
| E5  | Repo hygiene: test logs (`e2e-*.log`, `*-results*.md`), `sqlite.db`, and ad-hoc status reports committed at root; stale docs contradict each other (README says "9.7% complete").                                                                                                                                                                | Step 02 (cleanup), spec docs supersede        |

## Verdict

Priorities, in order: (1) establish the interaction grammar and shared primitives so later steps land consistently; (2) reset the schema + seed + entitlements; (3) gate Stage 2; (4) rebuild navigation; (5) standardize entity modules; (6) ship manual scheduling + standalone validation (the actual product core); (7) consolidate Stage 2 into its own hub; (8) production hardening. This ordering is encoded in `docs/spec/plan/00-OVERVIEW.md`.

---

## Round 2 status (Steps 15–24) — post-beta fixes

Round 2 addressed the issues found during the first real use of the shipped app on a fresh
account. Every reported issue below is fixed and covered by at least one automated test.
The plan lives in `docs/spec/plan/ROUND-2-OVERVIEW.md`; `HANDOFF.md` carries the operational
notes.

**Three root causes** explained a disproportionate share of the symptoms:

1. **Two competing definitions of "active schedule."** `getActiveSchedulingPeriod()` resolved the
   working schedule from the global `scheduling_periods.is_active` flag while the rest of the app
   used the per-user `user.active_schedule_id`. New users' schedules are created with
   `is_active = 0`, so the lookup returned nothing and the view service fell back to a whole
   calendar year — producing both the "full year calendar" and "capacity months outside my range"
   reports, and risking a cross-tenant range leak. **Fixed in step 15.**
2. **A camelCase/snake_case mismatch** between `getStudentScheduleData` and the student schedule
   table — the blank Clerkship/Preceptor columns. **Fixed in step 19.**
3. **An unguarded `sites` prop** in `pattern-form.svelte`, plus a preceptor API shape that did not
   guarantee the field — the reported `TypeError`, and the wizard's false "no sites" message.
   **Fixed in step 16.**

| #  | Reported issue                                                                | Step   | Status  |
|----|-------------------------------------------------------------------------------|--------|---------|
| 1  | Schedule rename doesn't update the sidebar dropdown until refresh              | 15     | Fixed   |
| 2  | Preceptor wizard step 3: no way to actually set availability                   | 16     | Fixed   |
| 3  | Wizard says "no sites" though a site was chosen on the previous step           | 16     | Fixed   |
| 4  | Capacity Overview shows months outside the schedule range                      | 15, 16 | Fixed   |
| 5  | Availability/schedule tabs show a full year, not the schedule range            | 15, 16 | Fixed   |
| 6  | Must scroll to the bottom to edit availability                                 | 16     | Fixed   |
| 7  | `TypeError: can't access property "length", $$props.sites is undefined`        | 16     | Fixed   |
| 8  | Details-tab info not visible (read-only) on Overview                           | 22     | Fixed   |
| 9  | Add-assignment doesn't filter clerkship/preceptor/site to valid combinations   | 17, 18 | Fixed   |
| 10 | Dates ignore preceptor availability; don't show already-scheduled days         | 17, 18 | Fixed   |
| 11 | No range/block/individual day selection when assigning                         | 18     | Fixed   |
| 12 | No availability override prompt (+ option to update preceptor availability)    | 17, 18 | Fixed   |
| 13 | No double-book prompt (double-book / move other student; raise limit vs once)  | 17, 18 | Fixed   |
| 14 | "Lock this assignment" visible without the autogen entitlement                 | 18     | Fixed   |
| 15 | Can't see student progress + assigned preceptors while assigning               | 18, 19 | Fixed   |
| 16 | No warning when assigning more days than a clerkship requires                  | 17, 18 | Fixed   |
| 17 | No onboarding warning (linking to the Onboarding tab) on the student page      | 19     | Fixed   |
| 18 | Student schedule tab: Clerkship/Preceptor columns empty                        | 19     | Fixed   |
| 19 | Student schedule should default to calendar, with a list toggle                | 19     | Fixed   |
| 20 | Assignments can only be removed, not edited                                    | 19–21  | Fixed   |
| 21 | Past-dated assignments: need an override to remove/replace                     | 17, 19 | Fixed   |
| 22 | Lists say "View"/"Edit" — should be "Manage"; drop the locations edit dialog   | 22     | Fixed   |
| 23 | Calendar opens in list view                                                    | 20     | Fixed   |
| 24 | Calendar day cells show "Int" instead of student·clerkship·preceptor           | 20     | Fixed   |
| 25 | Calendar edit popup should be the full assignment dialog (single day)          | 20     | Fixed   |
| 26 | Calendar add-assignment = student-page dialog + a student dropdown             | 20     | Fixed   |
| 27 | Preceptor page add-assignment needs the same logic and context                 | 21     | Fixed   |
| 28 | Schedule health not visible from the calendar                                  | 20     | Fixed   |
| 29 | Overrides aren't tracked or reviewable                                         | 17, 20 | Fixed   |
| 30 | `/schedules` vs `/calendar` is confusing; move to the switcher                 | 23     | Fixed   |
| 31 | All of the above need real test coverage                                       | all    | Fixed   |

### Found and fixed while testing (not in the original report)

- **Orphaned schedules.** `createSchedulingPeriod` never persisted `user_id`, so every schedule made
  through the wizard/API was invisible in its owner's list.
- **Calendar toolbar "Add assignment" was unusable** — the dialog was opened with `lockDate` always
  true, so with no pre-filled date the user could not pick one. Now only the day-click path locks.

### Verification

- **1511 unit tests**, `svelte-check` clean, production build succeeds.
- **29 e2e journeys**, run twice from a cold seeded database with **zero retries and no flakes**;
  the new and cross-cutting journeys additionally pass under `--repeat-each=2`.
- Cross-cutting journeys: whole-app end-to-end (now creating and switching into a short schedule
  first), fresh-signup-to-first-assignment, and the override lifecycle (both side-effect branches).
