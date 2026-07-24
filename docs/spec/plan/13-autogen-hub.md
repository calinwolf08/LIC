# Step 13 — Auto-Generation Hub (Stage 2, gated)

## Objective
Consolidate every Stage 2 surface into one entitlement-gated area at `/generate`: run/regenerate, results & diagnostics, teams & backups, and global engine defaults — finally exposing the diagnostic backend (violation stats, suggestions, smart regeneration) that already exists.

## Context
DESIGN_REVIEW B2/B4/D2–D5 and `docs/scheduling/current-state-analysis.md`: the engine supports violation tracking, smart regeneration (`regenerateFromDate`, `strategy`, `preview`), and completion mode, but the UI either hides or scatters them. Steps 03/08/11 removed scattered entry points; this step builds their proper home.

## Prerequisites
Steps 03, 08, 10. Steps 04 created the `/generate` nav stub.

## Scope
**In:** `/generate` area UI, wiring existing engine APIs, honoring `locked` assignments. **Out:** engine algorithm changes (except the lock constraint), billing.

## Implementation

All routes below live under `(app)/generate/` with a `+layout.server.ts` calling `requireAutogen` (server-enforced for the whole area). Sub-navigation via `EntityTabs` or a small side nav: **Run · Results · Teams · Settings**.

1. **Run (`/generate`)**: readiness panel (entitled checklist items from step 10 + engine-specific checks); generation form replacing the old `RegenerateDialog`: mode cards **Full** ("replace all unlocked future assignments") / **Smart** (date cutoff picker, "preserve everything before this date and credit it toward requirements") / **Completion** ("only fill gaps; change nothing that exists"); strategy radio minimal-change vs full-reoptimize with one-line explanations; advanced accordion for constraint bypass (kept, clearly marked "Advanced — may produce invalid schedules; results are flagged"). **Preview** button (uses the API's `preview: true`) showing impact (preserved/regenerated/expected improvement) before **Apply**. Progress state while running; on completion navigate to Results.
2. **Results (`/generate/results`)**: move + absorb the orphaned `/schedule/results` page (redirect exists from step 04): stats card, unmet requirements table (rows → student pages), clerkship breakdown, **ViolationStatsCard** and **SuggestionsPanel** always rendered when data exists; suggestion actions deep-link (e.g., "Increase Dr. Smith's capacity" → that preceptor's page or the relevant setting). Persist the last run's summary so the page isn't empty after navigation (simplest: store last generation result JSON on the schedule row or a `generation_runs` table — implementer's choice, document it).
3. **Teams (`/generate/teams`)**: relocate `/preceptors/teams/*` pages here (list/new/[id]), restyled with shared primitives, breadcrumbs within the hub; clerkship Auto-scheduling tab (step 08) links here. Copy explains teams in engine terms ("Generation assigns students to preceptor teams; a preceptor without a team is only used as backup").
4. **Settings (`/generate/settings`)**: global inpatient/outpatient/elective defaults (the `GlobalDefaultsForm` removed from Clerkships in step 08), with the same clarity pass as step 08 (grouped, help text, explicit units).
5. **Lock honoring**: the engine must treat `locked=1` assignments as immovable (skip in deletion phases, count toward requirements — reuse the regeneration credit path). Add this as a constraint/filter in the generation service; full/smart/completion modes all respect locks. Generated assignments get `source='generated'`.
6. Delete now-dead code: old `RegenerateDialog` usages, `/schedule/results` route, `/preceptors/teams` routes (redirects), the temporary links left by steps 08/11.

## Testing
- Unit: lock honoring in each mode (locked past, locked future, locked conflicting with new plan → preserved and reported); results persistence round-trip.
- API: whole `/generate` layout 403s for non-entitled (e2e: direct URL access redirects/errors politely); generation endpoints regression from step 03.
- E2E (entitled user, seeded data): run Preview then Apply in smart mode → results page shows stats + violations + suggestions; a locked assignment survives full regeneration; suggestion link navigates; teams CRUD works at the new location; non-entitled user never sees the nav item and gets blocked on direct access.

## Acceptance criteria
- [ ] All Stage 2 functionality lives under `/generate`; nothing generation-related remains in Stage 1 surfaces (D2–D5, B2, B4 closed).
- [ ] Violation stats + suggestions visible after every generation run (G3).
- [ ] Locked assignments always preserved (G6/F6).
- [ ] Definition of done per GUIDELINES.md.
