# Development Guidelines (apply to every step)

These rules bind all plan steps. A step is not complete if it violates them.

## Stack & code conventions

- SvelteKit 2, **Svelte 5 runes** (`$state`, `$derived`, `$props`, `$effect` — no legacy stores in new code except existing `$app/stores` page store usage).
- TypeScript strict; no `any` in new code (existing `any` may be tightened opportunistically).
- Database access via Kysely only, through service functions in `src/lib/features/<feature>/services/`. Pages/API routes never inline SQL.
- API routes return the established envelope: `{ success: true, data }` or `{ success: false, error: { message, details? } }` with appropriate HTTP status. All routes must scope queries to the authenticated user's active schedule (see `src/hooks.server.ts` and existing patterns from the multi-tenancy fix, commit `d437995`).
- Validation with Zod schemas colocated in the feature (`schemas.ts`); forms use sveltekit-superforms where a form exists.
- Feature-vertical layout: UI in `src/lib/features/<feature>/components/`, logic in `services/`, shared UI in `src/lib/components/`.
- Regenerate DB types after any migration: `npm run db:types`.

## UX conventions (from PRODUCT_SPEC §6 — enforce, don't re-decide)

- Complex entity create = full page `/{entity}/new`. Simple entity create = dialog. View/edit = detail page `/{entity}/{id}` with tabs + inline editing. No separate `/edit` routes. Assignments = dialogs.
- Use ONLY the shared primitives from step 01: `PageHeader`, `EntityTabs`, `ConfirmDialog`, `EmptyState`, `toast`, `FormShell` (unsaved-changes guard). Never hand-roll a modal overlay, never call `window.alert/confirm`, never `window.location.reload()`.
- Every entity name rendered anywhere is a link to that entity's detail page.
- Breadcrumbs on every detail page (`PageHeader` handles this).
- Status colors: green = complete/valid, amber = partial/warning, red = conflict/missing, gray = n/a.
- Copy style: sentence case, plain language, no engine jargon in Stage 1 surfaces ("Backup preceptor", not "Fallback"; "Days required", not "Requirement structure").

## Stage gating

- Stage 2 (auto-generation) code paths check entitlement **server-side** via the helper from step 03 (`requireAutogen(locals)`); UI checks `locals.user.entitlements` exposed through the root layout. Never gate by hiding UI alone.

## Testing requirements (every step)

- **Unit tests** (Vitest) for every new/changed service function and non-trivial util: happy path + error paths + edge cases named in the step. Use the in-memory/test DB helpers in `src/lib/db/test-utils.ts`.
- **API tests** for every new/changed endpoint: auth required, schedule scoping (user B cannot read user A's data), validation errors, success shape.
- **E2E (Playwright)** for the user-visible flows named in each step's "Testing" section. Reuse/extend seed scenarios (`npm run seed:scenario`) so tests are deterministic.
- Do not delete existing tests to make a step pass; update them when behavior intentionally changed and note it in the commit message.

## Definition of done (every step)

1. All acceptance criteria in the step file are met.
2. `npm run lint && npm run check && npm run test:unit -- --run && npm run build` all pass.
3. New/updated Playwright tests pass locally: `npm run test:e2e` (or the step-scoped subset if the full suite is not yet stable — state which in the commit).
4. No console errors in the browser on the touched pages (verify manually via `npm run dev`).
5. Docs updated if the step changes behavior described in `docs/spec/PRODUCT_SPEC.md` (spec wins; if you must deviate, update the spec in the same commit and say why).
6. Work committed with a descriptive message referencing the step number (e.g., `Step 06: rebuild student detail as scheduling hub`).

## Working style

- Prefer editing existing files over parallel new versions; delete superseded code in the same step (no `-old`/`-v2` files).
- If a dependency step appears unfinished, stop and report rather than re-implementing it ad hoc.
- Database data never needs preserving: when schema change is easier than data migration, recreate + reseed (`npm run db:migrate && npm run db:seed`).
