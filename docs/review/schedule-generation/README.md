# Schedule generation review (September 2026)

A full review of the Stage 2 auto-generation feature: how the algorithm works, what is wrong with it, how it should be redesigned, what the current database schema requires of it, whether access gating is sound, and how to test all of it.

| Document                                                     | What it answers                                                                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [01-algorithm-explained.md](01-algorithm-explained.md)       | How generation works today, phase by phase, file by file — including the behaviours that are wrong (cross-referenced as `F-nn`). |
| [02-findings-and-bugs.md](02-findings-and-bugs.md)           | 30 findings with severity, evidence (the critical ones reproduced by a 14-scenario live probe), root cause and fix.              |
| [03-design-recommendations.md](03-design-recommendations.md) | Target architecture: scoped snapshot → pure planner → pure generator with a single validator → one transactional apply.          |
| [04-schema-alignment.md](04-schema-alignment.md)             | Table-by-table changes so the engine respects schedule scoping, ownership, locks, overrides, sites, electives and Postgres.      |
| [05-access-gating.md](05-access-gating.md)                   | Audit of the two access levels: what is gated, what is not, and a pattern so new routes cannot forget.                           |
| [06-test-coverage-plan.md](06-test-coverage-plan.md)         | Current coverage, why green tests missed the bugs, and the unit / integration / API / e2e plan with a traceability matrix.       |
| [07-implementation-roadmap.md](07-implementation-roadmap.md) | Ordered, sized work plan; Phase 0 alone makes the feature safe.                                                                  |

## Executive summary

**Gating works; the algorithm does not.** The entitlement layer correctly blocks non-entitled users from every generation endpoint and page (verified by unit tests, an e2e journey and a live probe). But once an entitled user clicks _Generate_, the engine behaves in ways that make its output unusable in a multi-user deployment and unreliable even for a single user.

The five findings that matter most, all reproduced against the real route and engine on a migrated in-memory database:

1. **Generation is not tenant-scoped (F-02/F-03/F-04).** One user's run deletes every other user's future assignments and creates assignments for other users' students with the first user's preceptors. The deprecated `DELETE /api/schedules` lets _any_ Stage 1 user wipe every tenant's unlocked assignments.
2. **Existing days are never credited (F-01).** Smart regeneration, completion mode and locked assignments all over-schedule: 5 required + 2 kept = 7; 5 required + 3 existing = 8.
3. **The constraint system never runs (F-05).** Onboarding, allowed sites, health-system continuity and team rules are configured, tested in isolation, and ignored at generation time; `bypassedConstraints` is a no-op.
4. **Capacity is modelled three different ways (F-07).** With the Stage 1 default `max_students = 1` and no capacity rule, a single existing assignment in the year makes the engine reject every day for that preceptor — and report nothing missing (F-06).
5. **Minimal-change is a no-op and its preview is wrong (F-12).** Future rows are deleted before they are analysed; preview says "5 preservable", apply deletes 5.

The existing 764 tests are green because the route test mocks the engine and every service, and the engine suites always add generous capacity rules and start from an empty table. `06-test-coverage-plan.md` replaces that with real-handler tests, a per-finding integration suite, and five end-to-end journeys — including a brand-new-account flow from sign-up to a generated, exported schedule on both access levels.

Recommended next step: ship Phase 0 of the roadmap (scope + credit + capacity + persistence + seed, with its tests) before any other Stage 2 work, and hide the _Minimal change_ and constraint-bypass controls until Phase 2 makes them real.

## How the review was done

- Read every file under `src/lib/features/scheduling/`, the generate/execute routes, gating helpers, hook, schema types, migrations 016–027, the Postgres baseline, the spec and plan documents.
- Ran the scheduling test suites with coverage (`npx vitest run --project server … --coverage`).
- Wrote a temporary Vitest probe (`zz-review-probe.test.ts`, since removed) that mounted the real `POST /api/schedules/generate` and `DELETE /api/schedules` handlers on an in-memory migrated SQLite database with two tenants and drove fourteen scenarios; the observed numbers are quoted in `02-findings-and-bugs.md`.
- No production code was changed; this branch only adds `docs/review/schedule-generation/`.
