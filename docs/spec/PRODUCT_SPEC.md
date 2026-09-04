# LIC Scheduling App — Consolidated Product Specification

**Date:** 2026-07-20
**Status:** Authoritative. Supersedes `MVP_REQUIREMENTS.md` and the scattered design docs under `docs/` where they conflict.
**Sources consolidated:** `MVP_REQUIREMENTS.md`, `USER_FEEDBACK_ANALYSIS.md`, `docs/schedule-first-architecture.md`, `docs/dev-plan-configurable-scheduling/*`, `docs/dev-plans-phase2/*`, `docs/scheduling/*`, `docs/plans/*`, commit history (113 commits through `75b6b95`).

---

## 1. Product Vision

The LIC Scheduling App helps medical school administrators manage schedules for students in Longitudinal Integrated Clerkship (LIC) programs: which student is with which preceptor, at which site, for which clerkship, on which days — and whether that schedule satisfies each student's graduation requirements.

The product has **two stages**, delivered as two tiers:

### Stage 1 — Core Scheduling Tool (all users)
A manual scheduling and validation tool. Users:
- Manage the roster: students, preceptors, clerkships, sites, health systems.
- Define requirements: required days per clerkship per student, blackout dates, preceptor availability.
- **Build and adjust schedules manually**: create, edit, move, swap, and delete individual assignments.
- **Validate continuously**: the app detects conflicts (double-booking, unavailable preceptor, blackout date, capacity) and tracks requirement completion per student, split by date into *completed*, *scheduled*, and *unscheduled*.
- Navigate fluidly between overall calendar, per-student, and per-preceptor views, and drill into any related entity in one click.
- Export schedules to Excel.

Stage 1 must be fully usable **without ever running the auto-generation engine**. It is the primary focus of current development.

### Stage 2 — Auto-Generation (paid/authorized tier)
The constraint-based scheduling engine that generates or completes schedules automatically. It is **fully gated by user authorization** (entitlement flag on the user/organization). Includes:
- One-click generation, smart regeneration (preserve past assignments), completion mode.
- Violation statistics, blocking-constraint analysis, fix suggestions.
- Advanced per-clerkship configuration: assignment strategies, team formation, fallback preceptors, capacity rules, block-based scheduling, health-system continuity.

Users without the entitlement never see Stage 2 configuration or actions. Stage 1 concepts must never depend on Stage 2 concepts (e.g., a preceptor must be schedulable manually without belonging to a team).

---

## 2. Users

**Primary user:** medical school LIC program administrator/coordinator. Non-technical. Manages ~5–50 students, ~10–100 preceptors, ~5–15 clerkships per academic year. There are no student or preceptor logins.

**Success criteria:**
- A new user can complete setup and produce a valid schedule with **little or no assistance** — the UI itself explains order of operations, required data, and errors.
- The user can always answer: *"Is student X on track? What's missing? What do I need to fix?"* in ≤ 2 clicks from anywhere.
- No dead ends: every workflow returns the user to where they started or somewhere sensible.

---

## 3. Domain Model

```
User (admin) ──owns──► Schedule (scheduling_periods: name, start_date, end_date; one "active" per user)
                          │  entities are linked to schedules via junction tables and
                          │  may be shared across a user's schedules
                          ▼
   ┌──────────────┬──────────────┬───────────────┬──────────────┐
   │ Students     │ Preceptors   │ Clerkships    │ Sites        │
   │              │  └ Availability│  └ Required days│  └ Health System
   │  └ Onboarding│     patterns │  └ Allowed sites │
   │    (per HS)  │  └ Sites     │  └ Electives   │
   └──────────────┴──────────────┴───────────────┴──────────────┘
                          │
                          ▼
              Assignments (student + preceptor + clerkship + site? + date, status, locked?)
              Blackout dates (per schedule)
              [Stage 2 only] Teams, fallbacks, capacity rules, clerkship scheduling
              configurations, global inpatient/outpatient/elective defaults
```

Key rules:
- **Schedule-first**: the user must have an active schedule; all entity lists and the calendar are scoped to it. New entities auto-associate with the active schedule.
- A student cannot have two assignments on the same date (hard conflict).
- An assignment on a date where the preceptor is unavailable, a blackout date, or beyond capacity is a **violation** — allowed to exist (user can override) but always visibly flagged.
- Requirement tracking per student per clerkship, in full days:
  - **Completed** = assigned days with date < today.
  - **Scheduled** = assigned days with date ≥ today.
  - **Unscheduled** = required_days − completed − scheduled (floor 0).
- Deleting an entity with dependent data is blocked with a clear explanation of the dependencies (never a silent failure).
- Database data does **not** need to be preserved across schema changes during this development phase; destructive migrations and reseeding are acceptable.

---

## 4. Stage 1 Functional Requirements

### 4.1 Authentication & schedules
- R1.1 Email/password auth (better-auth). Unauthenticated users see only public pages.
- R1.2 A user with no schedule is routed into schedule creation; all app pages require an active schedule.
- R1.3 Schedules: list, create, edit (name/dates), duplicate, switch active, delete (with dependency explanation). All five actions work — no dead links.

### 4.2 Students
- R2.1 CRUD with unique email; deletion blocked while assignments exist (with explanation and a path to resolve).
- R2.2 Student list shows, per student: scheduling status (fully / partially / unscheduled), requirement completion %, and a warning indicator for conflicts.
- R2.3 Student detail page is the hub for one student:
  - Requirement status per clerkship: completed / scheduled / unscheduled days, as of today.
  - Full schedule (calendar + list) with the ability to add, edit, and delete assignments **from this page**.
  - One-click drill-through to any referenced preceptor, clerkship, or site detail.
  - Health-system onboarding tracking.
  - Inline editing of student details.

### 4.3 Preceptors
- R3.1 CRUD; creation collects contact info, site associations, and availability in one flow.
- R3.2 Availability: pattern-based (weekly patterns, date ranges, exceptions, notes) with a **calendar visualization** of resulting availability (feedback F5).
- R3.3 Preceptor list shows availability-configured indicator (F4) and assignment load.
- R3.4 Preceptor detail page: details, availability (view + edit), and the preceptor's schedule of assignments, with drill-through to students/clerkships.
- R3.5 A preceptor is manually schedulable with nothing but a name — availability and sites refine validation but are not prerequisites. Teams are **not** required for Stage 1 (they are a Stage 2 concept).
- R3.6 Availability default (two-tier semantics, review finding F-18). The two tiers read a missing availability row differently, by design:
  - **Stage 1 (manual scheduling)** is permissive: a preceptor with **no** `preceptor_availability` row for a date is treated as _available_ (a soft, bypassable warning may still note that availability was never configured). This is what makes R3.5 true — a preceptor is schedulable with only a name.
  - **Stage 2 (auto-generation)** is strict: the engine places a day **only** on an explicit `is_available = 1` row at an allowed site. A preceptor with no availability rows (or only pattern rows that were never materialised into `preceptor_availability`) is never auto-scheduled. Coordinators must materialise availability before generating; the setup/readiness checklist (R7.3) flags preceptors in the schedule that lack any availability row, and — for entitled users — flags any clerkship with no workable preceptor (a team member, or with no team any preceptor, that has availability at an allowed site inside the schedule's date range). Pattern rows (`preceptor_availability_patterns`) do not count toward generation unless expanded into `preceptor_availability`.

### 4.4 Clerkships
- R4.1 CRUD for core fields: name, type (inpatient/outpatient), required days, description, allowed sites, electives.
- R4.2 Every configuration option visible in Stage 1 must have a clear user-facing meaning documented in the UI (label + help text). Options that only affect auto-generation live exclusively in the gated Stage 2 configuration area.
- R4.3 Clerkship detail shows: which preceptors/sites can serve it, aggregate progress across students (how many students complete/at-risk), with drill-through.
- R4.4 Elective day accounting. An elective is **required** (`is_required = 1`) or **optional** (`is_required = 0`). A clerkship's `required_days` is the total clinical days a student must complete for that clerkship. Only **required** electives' `minimum_days` are carved out of that total; the remainder is scheduled as ordinary (non-elective) clerkship days. **Optional** electives do **not** reduce the clerkship's day count — they are additional, self-standing requirements a student may complete on top of the clerkship's days, and are never subtracted from `required_days`. Requirement tracking counts required-elective days toward each elective's `minimum_days` and the remaining clerkship days toward the clerkship; optional-elective days are tracked against that elective only and never toward the clerkship total (review finding F-09).

### 4.5 Sites & health systems
- R5.1 CRUD for health systems and sites (site belongs to one health system). Explanatory text for the hierarchy (U10).
- R5.2 Deletions blocked by dependencies with in-UI explanation (no browser `alert()`/`confirm()`).

### 4.6 Manual scheduling (the core workflow)
- R6.1 Create a single assignment (student, clerkship, preceptor, site, date) from: an empty calendar day, the student schedule page, and the preceptor schedule page. Pickers pre-filtered by context.
- R6.2 Create assignments in bulk over a date range (e.g., "Mon–Fri for 3 weeks"), skipping blackout dates/weekends optionally.
- R6.3 Real-time validation while creating/editing: hard-block student double-booking; warn (with override) on availability, blackout, capacity, site-mismatch violations.
- R6.4 Edit, reassign (change preceptor), swap (between students), move (change date), and delete assignments.
- R6.5 Assignments can be **locked** ("preset") so future auto-generation (Stage 2) must work around them (F6).

### 4.7 Validation & requirement tracking
- R7.1 A standalone validation engine (independent of generation) computes, for the active schedule: all conflicts/violations with type, entities, and date; per-student requirement status (completed/scheduled/unscheduled per clerkship).
- R7.2 Validation results surface: on the dashboard (summary), on the calendar (per-day markers), on student list/detail, on preceptor detail.
- R7.3 A **setup/readiness checklist** (U12, F8) tells the user what's missing before scheduling is meaningful (no students, clerkship without required days, preceptor without availability, etc.) — phrased for Stage 1 (manual) semantics, with Stage 2 readiness items appearing only for entitled users.

### 4.8 Calendar
- R8.1 Schedule-wide calendar with month grid and list views, defaulting to the schedule's full date range.
- R8.2 Filters (student/preceptor/clerkship/date range) clearly labeled as display filters (U15/U16).
- R8.3 Blackout date management available from the calendar; blackout days visually distinct.
- R8.4 Click a day → see/edit that day's assignments; click an empty slot → create an assignment.
- R8.5 Export to Excel honoring current filters.

### 4.9 Dashboard
- R9.1 Entity counts, student scheduling status breakdown, validation summary (top problems), and the setup checklist.
- R9.2 Quick links into each area; items in the checklist deep-link to the exact page that fixes them.

### 4.10 Cross-cutting UX requirements
- R10.1 **One interaction grammar** (see §6): consistent choice of full page vs. dialog per task type across the whole app.
- R10.2 No dead-end navigation: detail pages have breadcrumbs; cross-entity flows (e.g., clerkship → sites) return to origin.
- R10.3 Unsaved-changes warning on all multi-field forms (U9).
- R10.4 All destructive actions use the same confirmation dialog component with dependency information.
- R10.5 Empty states everywhere explain what the entity is for and how to create the first one (U4/U10/U11 style).
- R10.6 Errors are shown in-context (inline or toast); never silently swallowed; never via `alert()`.

---

## 5. Stage 2 Functional Requirements (gated)

- G1 **Entitlement**: a per-user flag (`autogen` entitlement) checked server-side on every Stage 2 API and used to hide all Stage 2 UI. Default: off.
- G2 Auto-generation hub (single page area): generate, regenerate (full / smart from date / completion mode), strategy choice (minimal-change vs full-reoptimize), preview impact before applying, constraint bypass options.
- G3 Results & diagnostics: stats, unmet requirements, violation statistics, top blocking constraints, actionable suggestions (existing backend already returns this data — expose it here).
- G4 Advanced configuration (per clerkship, with global defaults + override model): assignment strategy, block size/partial blocks, team settings, fallback settings, capacity rules, health-system continuity.
- G5 Teams & fallback preceptors management.
- G6 Generation respects locked assignments (F6) and never modifies past (completed) assignments unless explicitly told to.
- G7 Non-entitled users see, at most, a single upgrade hint — no strategy dropdowns, no "Generate" buttons, no team requirements.
- Deferred (backlog, not in current plan): half-day AM/PM scheduling (F1/F2), exam scheduling, notifications, student/preceptor portals.

---

## 6. UX Conventions (the "interaction grammar")

These rules resolve the modal-vs-page inconsistency. Every feature must follow them.

| Task | Pattern |
|---|---|
| Browse entities | List page with table, search/filter, primary "Add" button (one button, one label) |
| Create complex entity (student, preceptor, clerkship, schedule, team) | **Full page** at `/{entity}/new` (wizard if multi-step, e.g., preceptor availability) |
| Create simple entity (health system, site, blackout date) | **Dialog** from the list page |
| View/edit an entity | **Full detail page** at `/{entity}/{id}` with tabs; editing is inline on the detail page (no separate `/edit` routes) |
| Quick action on a row (delete, set active, duplicate) | Row action → shared confirmation dialog when destructive |
| Create/edit an assignment | **Dialog** (assignments are small, context-heavy objects created from calendars) |
| Cross-entity side quest (e.g., need a site while creating a preceptor) | Inline creation dialog inside the current form — never navigate away from a half-filled form |

Navigation rules:
- Sidebar order = user's mental model: Dashboard → Calendar → Students → Preceptors → Clerkships → Locations (Sites & Health Systems) → Schedules → (gated) Auto-Generate.
- Every detail page: breadcrumb to its list; every entity name shown anywhere is a link to its detail page.
- Route names match sidebar labels; one term per concept everywhere: **Schedule** (the period + its data), **Calendar** (the view), **Assignment** (one student-preceptor-day), **Requirement** (days needed per clerkship).

Visual/feedback rules:
- shadcn-svelte components only; shared `PageHeader`, `EntityTabs`, `ConfirmDialog`, `EmptyState`, toast notifications.
- Status colors: green = complete/valid, amber = partial/warning, red = conflict/missing, gray = not applicable.
- All forms: superforms + Zod, disabled submit while pending, inline field errors, unsaved-changes guard.

---

## 7. Non-Functional Requirements

- **Stack (unchanged):** SvelteKit 2 / Svelte 5 runes, SQLite + Kysely, better-auth, Tailwind 4 + shadcn-svelte, Zod + superforms, Vitest + Playwright, adapter-node.
- **Performance:** entity lists and calendar render < 1s at 50 students / 100 preceptors / 10k assignments; validation of a full schedule < 2s.
- **Quality gates:** `npm run lint`, `npm run check`, `npm run test:unit -- --run`, `npm run build` green on every merge; Playwright e2e suite green for the core journeys.
- **Multi-tenancy:** every API route scopes reads/writes to the authenticated user's active schedule; cross-user access is impossible.
- **Accessibility:** keyboard-navigable dialogs and forms, labeled inputs, visible focus, aria on tabs/menus.
- **Data:** destructive migrations allowed during this phase; a seed script produces a realistic demo dataset for development and e2e tests.
