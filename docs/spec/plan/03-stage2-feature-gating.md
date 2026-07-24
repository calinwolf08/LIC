# Step 03 — Stage 2 Feature Gating

## Objective
Make auto-generation a server-enforced, entitlement-gated feature. Non-entitled users cannot invoke any generation API or see any generation UI.

## Context
Today every logged-in user can generate, regenerate, and bypass constraints (DESIGN_REVIEW D1). The spec (G1, G7) requires hard gating.

## Prerequisites
Step 02 (`user.entitlements` column, seed users with/without `autogen`).

## Scope
**In:** entitlement plumbing, API guards, coarse UI hiding of existing generation entry points. **Out:** the redesigned Stage 2 hub (step 13) and moving config UI (step 08) — here we only gate what already exists, in place.

## Implementation

1. **Server plumbing.** In `src/hooks.server.ts` (where the session is resolved), parse `user.entitlements` into `locals.entitlements: string[]`. Add `src/lib/server/entitlements.ts`:
   - `hasAutogen(locals): boolean`
   - `requireAutogen(locals): void` — throws SvelteKit `error(403, 'Auto-generation requires an upgraded plan')`.
2. **Expose to UI.** Root `+layout.server.ts` returns `entitlements` in page data; `(app)` layout makes it available (e.g., via context or `$page.data.entitlements`).
3. **Guard these API routes** with `requireAutogen` (audit `src/routes/api` for completeness — this list is from the current tree):
   - `api/schedules/generate`
   - `api/scheduling/execute`
   - `api/scheduling-config/**` (all: clerkship configs, capacity rules, electives allocation defaults, fallbacks, global defaults, requirements) — *except* any endpoint that Stage 1 pages still read; if a Stage 1 page reads one (check callers), split read vs write: reads stay open, writes gated, and note it in the step commit.
   - Do NOT gate: assignments CRUD, calendar, export, entities, blackout dates, scheduling-periods.
4. **Gate existing UI entry points** (temporary until steps 11/13 relocate them): "Regenerate Schedule" button + `RegenerateDialog` on the calendar; "Default Scheduling Rules" tab on clerkships; "Scheduling Settings" tab on clerkship config; team-management prompts that say teams are required for generation. Pattern: `{#if hasAutogen}` render, `{:else}` render nothing or a single small upsell line ("Auto-generation is available on the upgraded plan") — one line max, no dead controls.
5. **Admin toggle (dev-only):** a script `scripts/set-entitlement.ts` (`npx tsx scripts/set-entitlement.ts <email> autogen on|off`) so humans/tests can flip the flag; no in-app billing UI.

## Testing
- API tests: for each gated route, non-entitled user gets 403 with the error envelope; entitled user passes; unauthenticated gets 401/redirect. Parameterize over the route list so future routes are easy to add.
- E2E: log in as `basic@example.com` — calendar shows no Regenerate button; clerkship config shows no Scheduling Settings tab; direct POST to `/api/schedules/generate` from the test returns 403. Log in as `admin@example.com` — controls present and functional.
- Unit: `requireAutogen` / `hasAutogen` behavior incl. malformed JSON in `entitlements` (treat as `[]`).

## Acceptance criteria
- [ ] Every generation/engine-config write API rejects non-entitled users server-side (proved by tests).
- [ ] No generation UI rendered for non-entitled users anywhere in the app.
- [ ] Entitled experience unchanged functionally.
- [ ] Definition of done per GUIDELINES.md.
