# Design Review — Current App vs. Spec

**Date:** 2026-07-20
**Scope:** evaluation of the implemented app (`src/`) against `docs/spec/PRODUCT_SPEC.md`. Each finding links to the plan step that fixes it (`docs/spec/plan/`).

## Summary

The backend is substantially ahead of the frontend: a sophisticated constraint engine, violation tracking, smart regeneration, and a 40-table schema exist, but the core Stage 1 experience (manual scheduling + validation + clear navigation) is incomplete and inconsistent. The app currently reads as an *auto-generation tool with manual patching*, while the product goal is a *manual scheduling tool with optional auto-generation*.

## A. Interaction-pattern inconsistencies (spec §6)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| A1 | Create/edit patterns differ per entity: preceptor create = full-page wizard but preceptor **edit** = modal, and availability is edited via modal from the list *and* via a separate full page (`/preceptors/[id]/availability`). | `(app)/preceptors/+page.svelte:236-265`, `preceptors/new`, `preceptors/[id]/availability` | Step 07 |
| A2 | Students: create = page, edit = inline tab on detail; `/students/[id]/edit` is a stub that client-redirects. | `students/[id]/edit/+page.svelte` | Step 06 |
| A3 | Clerkships: create = hand-rolled modal (raw divs, not the dialog component); edit = full config page. | `(app)/clerkships/+page.svelte:111-120` | Step 08 |
| A4 | Sites use full pages (`/sites/new`, `/sites/[id]/edit`), health systems use a form toggle + **browser `alert()`/`confirm()`** for delete. | `(app)/health-systems/+page.svelte:16-60` | Step 05 |
| A5 | Three different delete-confirmation patterns: shadcn dialogs (students/preceptors/clerkships), browser confirm (health systems), inline "Delete? Yes/No" buttons (schedules). | `(app)/schedules/+page.svelte:154-193` | Steps 01, 05 |
| A6 | Modals are hand-rolled (`fixed inset-0 z-50 bg-black/50` divs) in several places rather than the shared dialog component — inconsistent behavior (escape/focus/scroll). | `clerkships/[id]/config/+page.svelte:607-640`, `preceptors/+page.svelte` | Step 01 |
| A7 | `alert()` also used for export failure on the calendar. | `(app)/calendar/+page.svelte:272` | Step 11 |

## B. Navigation & information architecture

| # | Finding | Evidence | Fix |
|---|---|---|---|
| B1 | **Dead link:** `/schedules` "Edit" button navigates to `/schedules/[id]/edit`, which does not exist (404). | `(app)/schedules/+page.svelte:143`; no such route dir | Step 05 |
| B2 | `/schedule/results` (violation stats, suggestions) is orphaned — not in the sidebar, nothing links to it. All the diagnostic backend work is invisible. | route exists; nav in `(app)/+layout.svelte:24-33` has no entry | Step 13 |
| B3 | Blackout dates have no nav presence; they're a collapsible panel inside the calendar page only. | `calendar/+page.svelte:26-33` | Steps 04, 11 |
| B4 | Teams live under `/preceptors/teams` with `?fromClerkship=` query-param back-links — a brittle patch over the U13 dead-end. Teams are also presented as mandatory ("every preceptor must belong to a team") though they only matter for auto-generation. | `preceptors/+page.svelte:17-30,146-153,213-215` | Steps 08, 13 |
| B5 | Concept naming still split: sidebar says "Schedule Periods" and "Schedule Calendar"; `/schedules` page says "Schedules"; results page says "scheduling period"; two "active" badges ("Active" vs "Server Active") on the schedules list confuse the single-active-schedule model. | `schedules/+page.svelte:105-114` | Steps 04, 05 |
| B6 | Setup order guidance (U12) still missing: dashboard has a minimal "Getting Started" card only when counts are zero; no checklist, no deep links to what's missing, no readiness concept (F8). | `dashboard/+page.svelte:213-231` | Steps 10, 12 |
| B7 | Student detail duplicates itself: a "Calendar" tab showing a 10-row preview plus a separate `/students/[id]/schedule` page, with two "View Full Schedule" buttons. Drill-through is absent: preceptor/clerkship names in assignment rows are plain text, not links. | `students/[id]/+page.svelte:255-331` | Step 06 |

## C. Stage 1 functional gaps

| # | Finding | Evidence | Fix |
|---|---|---|---|
| C1 | **No manual assignment creation.** There is no POST endpoint at `/api/schedules/assignments` (only `[id]` PATCH/DELETE, `reassign`, `swap`) and no create UI. The only way to put assignments on the calendar is the generation engine — the core Stage 1 workflow is missing. The dev plan exists (`docs/plans/manual-assignment-creation.md`) but was never implemented. | `src/routes/api/schedules/assignments/` has no `+server.ts` | Step 09 |
| C2 | No standalone validation: conflict/violation detection runs only inside generation. A manually edited schedule is never re-checked; the calendar shows no conflict markers. | engine services under `features/scheduling/` | Step 10 |
| C3 | Requirement status is percent-complete only; no completed/scheduled/unscheduled split by today's date (spec R2.3/R7.1). Student progress tab says "Generate a schedule to see clerkship progress" — Stage 1 users may never generate. | `students/[id]/+page.svelte:229-243` | Steps 06, 10 |
| C4 | No locked/preset assignments (F6): schema has `status` on assignments but no lock concept honored by the engine or UI. | `ScheduleAssignments` type | Step 09 |
| C5 | No preceptor availability calendar visualization (F5); availability is pattern rows only. | `pattern-availability-builder.svelte` | Step 07 |
| C6 | Unsaved-changes warning (U9) not implemented anywhere. | — | Step 01 (utility), applied in 05–09 |
| C7 | Calendar can't create anything; day click only opens the first existing assignment. | `calendar/+page.svelte:355-359` | Steps 09, 11 |

## D. Stage 2 gating gaps

| # | Finding | Evidence | Fix |
|---|---|---|---|
| D1 | No entitlement concept at all: any logged-in user can generate/regenerate, bypass constraints, and see engine config. | `regenerate-dialog.svelte` exposes constraint-bypass checkboxes on the main calendar | Step 03 |
| D2 | Clerkship config mixes Stage 1 data (name/type/required days/sites) with pure engine config (assignment strategy, health-system rule, capacity, blocks, team min/max, fallbacks) in one page — the exact "options with no clear meaning" the user flagged. Three strategy options (`team_continuity`, `continuous_single`, `continuous_team`) share one identical description — redundant to the user. "Max Students Per Day/Year" doesn't say per-what (preceptor? clerkship?). | `clerkships/[id]/config/+page.svelte:380-546` | Steps 08, 13 |
| D3 | "Default Scheduling Rules" (global inpatient/outpatient/elective defaults) is a tab on the Clerkships list — engine config in a core page. | `clerkships/+page.svelte:106-108` | Steps 08, 13 |
| D4 | Generation/regeneration UI (with smart modes, completion mode, strategies) sits on the main calendar toolbar — Stage 2 surface in the Stage 1 workspace. | `calendar/+page.svelte:220-233` | Steps 11, 13 |
| D5 | Violation stats / suggestions backend output ignored except on the orphaned results page. | `docs/scheduling/current-state-analysis.md` (confirmed still true) | Step 13 |

## E. Platform / production-readiness gaps

| # | Finding | Fix |
|---|---|---|
| E1 | Tests are engine-heavy (30 of 67 unit test files in `scheduling/`), thin on UI-adjacent services and page flows; e2e suite exists but logs in repo root suggest instability; no CI-enforced e2e for core journeys. | Steps under-test rule in GUIDELINES + Step 14 |
| E2 | `window.location.reload()` used for state refresh (student onboarding toggle). | Step 06 |
| E3 | Welcome flow relies on `localStorage` flag + schedule named "My Schedule" heuristic. | Step 12 |
| E4 | Schema drift: 25 incremental migrations with dead concepts (dropped specialty, old availability model, `preceptor_site_clerkships`), junction tables for a "shared entities" model that adds copy-on-conflict complexity of questionable value for a single-admin product. Data does not need preserving — a consolidated baseline is cheap now. | Step 02 |
| E5 | Repo hygiene: test logs (`e2e-*.log`, `*-results*.md`), `sqlite.db`, and ad-hoc status reports committed at root; stale docs contradict each other (README says "9.7% complete"). | Step 02 (cleanup), spec docs supersede |

## Verdict

Priorities, in order: (1) establish the interaction grammar and shared primitives so later steps land consistently; (2) reset the schema + seed + entitlements; (3) gate Stage 2; (4) rebuild navigation; (5) standardize entity modules; (6) ship manual scheduling + standalone validation (the actual product core); (7) consolidate Stage 2 into its own hub; (8) production hardening. This ordering is encoded in `docs/spec/plan/00-OVERVIEW.md`.
