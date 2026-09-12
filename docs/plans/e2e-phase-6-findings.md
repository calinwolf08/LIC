# E2E Phase 6 — findings

Findings from the Phase 6 journeys (tier parity, entitlement lifecycle, tenant
isolation under generation). All run against the seeded entitled admin and
non-entitled basic users, with a generation-ready sandbox per tenant
(`e2e/journeys/phase-5/helpers.ts`). Entitlement toggles are restored at the end
of each test.

## Product bugs (fixed this phase, with regression coverage)

### P6-a — A gated write inside a try/catch leaked as 500 instead of 403 _(fixed)_

Endpoints that call `requireAutogen` (or any SvelteKit `error(status, …)`)
*inside* their `try` block routed the thrown `HttpError` through
`handleApiError`, which did not recognise it and returned "Internal server
error" (500). So a non-entitled write to, e.g., `POST
/api/scheduling-config/electives/[id]/preceptors` was correctly blocked but
surfaced as a 500 rather than a clean 403 envelope. **Fix:** `handleApiError`
now preserves an `HttpError`'s status (via `isHttpError`), so those writes return
403. This is a central fix covering every endpoint that gates inside its
try/catch. Asserted in J6.2.

## Journeys

- **J6.1 — Generated rows are ordinary rows.** A generated assignment is moved,
  reassigned, locked and deleted; `source` stays `generated` throughout.
  Revoking `autogen` keeps the Stage 1 edits working but makes the lock toggle
  inert (server ignores `locked` without the entitlement) and `/generate` a 403;
  re-granting restores the lock (G12).
- **J6.2 — Gating table, both directions.** Basic tier: no Auto-Generate nav,
  all `/generate*` routes 403, Stage 2 write APIs (generate, global-defaults,
  capacity-rules, fallbacks, elective-preceptor writes) 403, elective-preceptor
  read 200; **no over-gating** — the same user runs all of Stage 1; a mid-session
  grant reveals the nav on the next navigation without re-login.
- **J6.3 — Parity without teams.** Team-less preceptors with materialised
  availability generate once entitled (G11 / P-02); readiness reflects
  *materialised* availability (a preceptor with none re-opens the availability
  item).
- **J6.4 — Validation payload equality.** Identically-shaped schedules across
  tiers yield equal id-free Stage 1 payloads (validation counts, calendar
  summary), and checklists that differ only by the Stage 2 item.
- **J6.5 — Tenant isolation under generation.** A flurry of tenant A writes
  (generate, team, blackout, export, regenerate) leaves tenant B's snapshot
  byte-identical; A's generated assignment 404s from B, B cannot activate A's
  schedule, and A's schedule-scoped blackout does not flag B (P4-d holding).

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — full unit/integration suite green (1722 tests).
- Phase-6 journeys (`e2e/journeys/phase-6/`) green: J6.1–J6.5.
