# Step 14 — Production Hardening, E2E Journeys & Release Checklist

## Objective
Close the gap to production: end-to-end coverage of the core user journeys, accessibility and error-handling passes, CI gates, and a final sweep of every DESIGN_REVIEW finding.

## Context
Final step. Tests today are engine-heavy and page-flow-light (E1); several polish requirements (a11y, error consistency) span all modules and are best verified once the UI has settled.

## Prerequisites
All previous steps merged.

## Implementation

1. **Core-journey e2e suite** (`e2e/journeys/`, tagged to run in CI):
   - J1 *First run*: register → create schedule → complete every checklist item (create HS, site, clerkship, preceptor+availability, student) → manually build a full schedule for one student → dashboard shows them fully scheduled, zero violations → export Excel and assert non-empty file.
   - J2 *Daily management*: seeded user edits an assignment, resolves the seeded violation (reassign to an available preceptor), verifies markers clear on calendar + dashboard.
   - J3 *Drill-through*: student → clerkship → back; student → preceptor → its schedule → assignment edit; breadcrumbs everywhere; browser back works.
   - J4 *Gating*: basic user has no Stage 2 surface (nav, pages, APIs); entitled user runs J5.
   - J5 *Generation (entitled)*: lock one manual assignment → smart-generate with preview → apply → results diagnostics visible → locked assignment intact.
   - J6 *Schedules*: create second schedule, switch active, verify scoping (entities/calendar change), duplicate, delete.
2. **Error-handling sweep**: every fetch in `src/routes` and feature components handles failure with toast/inline error (grep for bare `catch {}` / `// Handle error` stubs — several exist, e.g., clerkship config site add/remove); API 500s return the error envelope, never HTML; a root `+error.svelte` renders a friendly error page with a "back to dashboard" link.
3. **Accessibility pass**: run axe (via `@axe-core/playwright`) on: dashboard, students list/detail, preceptor detail, calendar, clerkship detail, generate hub; fix all serious/critical findings. Keyboard-only walkthrough of J1 (dialogs trap focus, Esc closes, forms submittable).
4. **Loading/skeleton audit**: no page renders blank > 300ms on seed data; lists show skeletons or spinners consistently.
5. **CI** (`.github/workflows/ci.yml`): jobs lint → check → unit (with coverage artifact) → build → e2e journeys (seeded, chromium). All required for merge. Coverage threshold: keep current level as floor, fail on regression > 2pts (configure in vitest).
6. **Docs**: rewrite `README.md` (what the app is, two-stage model, quick start incl. seed logins, test commands, pointer to `docs/spec/`); move superseded planning docs (`docs/mvp-implementation-plan/`, `docs/dev-plans-phase2/`, `docs/dev-plan-configurable-scheduling/`, root feedback/requirements files) into `docs/archive/` with a one-line README note that `docs/spec/` is authoritative.
7. **Final review sweep**: walk `docs/spec/DESIGN_REVIEW.md` finding-by-finding; check each fixed item off in that file (add a `Status` column); anything not fixed gets an explicit "Deferred: <reason>" entry agreed in the PR.
8. **Release checklist** (`docs/spec/RELEASE.md`): env vars, build/run commands (adapter-node), DB file location/backup note, seed for demo vs empty prod start, entitlement-granting procedure (`scripts/set-entitlement.ts`), smoke-test script post-deploy.

## Testing
This step *is* testing; in addition:
- Meta-test: CI fails if journey specs are skipped (`--forbid-only`, no `.skip` in `e2e/journeys`).
- A perf smoke: seed the large fixture (step 10) and assert calendar + students list server responses < 1s each in a playwright request check.

## Acceptance criteria
- [ ] J1–J6 green in CI on a fresh checkout (`npm ci && npm run db:migrate && npm run db:seed && npm run test:e2e`).
- [ ] Zero serious/critical axe findings on audited pages.
- [ ] DESIGN_REVIEW has a status for every finding; no silent leftovers.
- [ ] README + RELEASE docs current; legacy docs archived.
- [ ] All GUIDELINES gates green.
