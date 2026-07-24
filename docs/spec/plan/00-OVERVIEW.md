# Implementation Plan — Overview

**Goal:** bring the LIC Scheduling App to a production-ready Stage 1 (core manual scheduling tool) with Stage 2 (auto-generation) cleanly gated behind user entitlement, per `docs/spec/PRODUCT_SPEC.md` and fixing every finding in `docs/spec/DESIGN_REVIEW.md`.

**Audience:** each step is written to be executed by an independent LLM agent with no other context. Before starting any step, the agent MUST read:
1. `docs/spec/PRODUCT_SPEC.md` (the requirements)
2. `docs/spec/plan/GUIDELINES.md` (conventions, testing rules, definition of done)
3. Its own step file

## Step sequence and dependencies

| Step | Title | Depends on | Findings fixed |
|------|-------|-----------|----------------|
| 01 | Shared UI primitives & UX conventions | — | A5, A6, C6 (utility) |
| 02 | Schema consolidation, entitlements & seed data | — | E4, E5, D1 (schema part) |
| 03 | Stage 2 feature gating | 02 | D1 |
| 04 | Navigation & information architecture | 01 | B3, B5 (nav part), B6 (nav part) |
| 05 | Standardize simple entity modules (schedules, health systems, sites) | 01, 04 | A4, A5, B1, B5 |
| 06 | Students module rework | 01, 04, (10 for live data — see step) | A2, B7, C3 (UI part), E2 |
| 07 | Preceptors module rework | 01, 04 | A1, C5 |
| 08 | Clerkships module rework | 01, 03, 04 | A3, D2, D3, B4 (partial) |
| 09 | Manual assignment creation & editing | 01, 02 | C1, C4, C7 |
| 10 | Standalone validation & requirement-status engine | 02, 09 | C2, C3 (data part) |
| 11 | Calendar consolidation | 09, 10 | A7, B3, C7, D4 |
| 12 | Dashboard & setup checklist | 10 | B6, E3 |
| 13 | Auto-generation hub (Stage 2, gated) | 03, 08, 10 | B2, B4, D2–D5 |
| 14 | Production hardening, e2e journeys & release checklist | all | E1 + final QA |

Recommended execution order: 01 → 02 → 03 → 04 → 05 → 09 → 10 → 06 → 07 → 08 → 11 → 12 → 13 → 14.
(06–08 are parallelizable after 04; 09–10 unblock the data that 06/11/12 display. If 06/07/08 run before 10, they stub the validation data behind the service interface defined in step 10's "Contract" section.)

## Global outcome requirements (the whole plan is done when…)

1. Every finding in `docs/spec/DESIGN_REVIEW.md` is fixed or explicitly deferred with a note in that file.
2. A brand-new user can: register → create a schedule → add health system, site, clerkship, preceptor (with availability), student → manually build a valid schedule on the calendar → see requirement status per student → export to Excel — entirely without auto-generation, guided by the setup checklist, with zero dead ends.
3. A user **without** the `autogen` entitlement can never reach generation UI or APIs (verified by e2e + API tests). A user **with** it has the full Stage 2 hub.
4. All quality gates green: `npm run lint`, `npm run check`, `npm run test:unit -- --run`, `npm run build`, `npm run test:e2e`.
5. The core-journey e2e suite (defined in step 14) passes in CI.

## Round 2 (steps 15–24)

Steps 01–14 are complete. Issues found during first real use of the shipped app are planned
in **`ROUND-2-OVERVIEW.md`** (steps 15–24), which carries its own dependency graph, a
root-cause briefing, and an issue→step traceability table. Start there for any post-beta work.

## Out of scope (backlog — do not implement)

Half-day/AM-PM scheduling (F1/F2), email notifications, student/preceptor portals, exam scheduling, multi-user collaboration on one schedule, payment/billing integration (entitlement is a manual flag for now).
