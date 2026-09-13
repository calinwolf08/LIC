# E2E Phase 8 — findings (hardening & CI gates)

Phase 8 turns the journey suite into enforced CI gates and a self-maintaining
traceability map. It is CI/tooling work rather than new journeys.

## What landed

### 1. CI restructure (plan §10.1)

`.github/workflows/ci.yml` splits the old single `E2E Tests` job into:

- **`e2e-smoke`** — runs `npm run test:e2e:smoke` (the `@smoke` journeys), the
  fast PR-blocking gate.
- **`e2e-full`** — a 3-way sharded matrix (`--shard=i/3`) running
  `npm run test:e2e:full` (every journey except `@long`); the merge gate.
- **`e2e-long`** — the `@long` arcs, gated on `github.event_name == 'schedule'`
  (a nightly `cron: '0 7 * * *'` trigger added to `on:`).
- **`e2e-guards`** — runs `npm run coverage:check`, which fails if any
  `test.only` / `test.skip` / `test.fixme` exists under `e2e/journeys/phase-*`
  **or** if `e2e/COVERAGE.md` is stale relative to the specs' annotations.

All jobs install only `chromium` (`playwright install --with-deps chromium`) and
upload the Playwright report on failure. New package scripts:
`test:e2e:smoke` / `test:e2e:full` / `test:e2e:long` (all scoped to the
`journeys` project), `test:coverage`, `coverage:map`, `coverage:check`.

### 2. Coverage floors on the scheduling paths (plan §10.2)

`vite.config.ts` gains **glob-scoped** v8 coverage thresholds so only the
scheduling algorithm paths are gated (the rest of the app is not):

| Glob                                      | lines | functions | branches |
| ----------------------------------------- | ----- | --------- | -------- |
| `src/lib/features/scheduling/**`          | 78    | 85        | 76       |
| `src/lib/features/scheduling/services/**` | 85    | 90        | 80       |

Measured coverage from the unit/integration suite today is higher
(`scheduling/**` ≈ L82 / B83 / F91; `scheduling/services/**` ≈ L90 / B87 / F96),
so the floors lock in current coverage with headroom and catch regressions.
`test-coverage.yml` now runs `npm run test:coverage` (which exits non-zero on a
threshold breach) after installing the browser, making the coverage job a real
gate rather than a report-only upload.

**P8-a — the coverage run timed out `auth.signup` under instrumentation _(fixed)_.**
`npx vitest run --coverage` failed two tests (`better-auth sign-up … signs the
new user back in`, sqlite + postgres) purely by timeout: argon2 password hashing
runs ~6 s under v8 instrumentation, past the default 5 s test timeout (the tests
are fast in an uninstrumented run). No coverage summary was emitted while the run
failed, so no baseline could be taken. Fixed by giving that one test a 30 s
timeout (`it(..., { timeout: 30000 }, …)`), harmless to a normal run. With it, the
coverage run is stable and the thresholds pass.

**Deferred — the plan's aspirational 95/90/95.** The unit/integration suite alone
does not reach 95/90/95 on the scheduling paths: several files here are exercised
only through the e2e journeys (e.g. `export-service.ts`, `suggestion-generator.ts`
read as 0% in a unit-coverage run) and the engine's branch coverage sits in the
low 70s. Closing that gap means either instrumenting the e2e run or adding
targeted unit tests for those files; tracked as follow-up. The floors above are
the enforced, regression-proof gate in the meantime.

### 3. Traceability map (plan §10.3)

`e2e/scripts/generate-coverage.ts` generates `e2e/COVERAGE.md` from the specs:

- journey ids from each `describe('J…')` title,
- tags from the describe's `tag:` array,
- requirements/findings from `// @coverage @req(R6.3)` / `@finding(P7-a)`
  annotation comments now present in every phase-1–7 journey spec.

It emits: a summary (45 spec files, 43 journeys, tag histogram), a journey-by-phase
table, a **requirement → journeys** table (49 requirements mapped), a
**finding/decision → journeys** table (25 findings/decisions mapped), and a guard
section. `--check` mode (used by CI) fails when the committed map is stale or a
focused/skipped test exists, so the map cannot rot. The §11 matrix in the plan is
the seed; `e2e/COVERAGE.md` is now the generated source of truth.

### 4. Bug backlog burn-down (plan §10.4)

Every product bug found in Phases 1–7 has a regression test and is closed within
its phase (see each phase's findings doc). The finding → journey column of
`e2e/COVERAGE.md` is the live index; the per-phase findings docs hold the
regression-test references:

| Finding                                         | Regression                           | Journey |
| ----------------------------------------------- | ------------------------------------ | ------- |
| P1-c (active-schedule write gate)               | J1.2/J1.5 + unit                     | J1.2    |
| P1-e (unsaved-changes guard)                    | J1.5                                 | J1.5    |
| P4-a/b (calendar cross-schedule / out-of-range) | J4.1                                 | J4.1    |
| P4-d/e (blackout schedule-scoping / dup 500)    | J4.2 + blackout-date-service.test    | J4.2    |
| P4-f (export columns)                           | J4.3 + calendar/export service tests | J4.3    |
| P5-a (calendar chip provenance)                 | J5.1                                 | J5.1    |
| P5-b/c (bypass code validation / dropped codes) | J5.3                                 | J5.3    |
| P5-d (generated status dropped)                 | J5.4                                 | J5.4    |
| P6-a (gated write → 500 not 403)                | J6.2                                 | J6.2    |
| P7-a (over_required_days counts elective days)  | assignment-validation.test           | J7.1    |

Nothing is deferred without a re-checking journey.

### 5. Retire (plan §10.5) — recommendation, pending approval

`e2e/helpers.ts` and `e2e/utils/` are already gone (retired in Phase 0). What
remains are **20 pre-plan legacy specs** directly under `e2e/journeys/` (the
`legacy` Playwright project, which exists to run them "until each is folded into a
phase journey"). Every one maps to a richer phase journey that supersedes it —
many are name-identical:

| Legacy spec                                            | Superseded by                                    |
| ------------------------------------------------------ | ------------------------------------------------ |
| `calendar-workspace.spec.ts`                           | J4.1                                             |
| `blackout` / `export` (in calendar-workspace)          | J4.2 / J4.3                                      |
| `locations.spec.ts`                                    | J2.1                                             |
| `clerkships.spec.ts`                                   | J2.4                                             |
| `preceptors.spec.ts`, `preceptor-availability.spec.ts` | J2.2, J3.9                                       |
| `students.spec.ts`                                     | J2.3                                             |
| `manual-scheduling.spec.ts`                            | J3.1                                             |
| `assignment-validation.spec.ts`                        | J3.3, J3.4                                       |
| `override-lifecycle.spec.ts`                           | J3.3, J3.5, J4.4                                 |
| `schedule-lifecycle.spec.ts`                           | J1.2                                             |
| `schedule-scoping.spec.ts`                             | J1.3                                             |
| `tenant-isolation.spec.ts`                             | J6.5                                             |
| `gating.spec.ts`                                       | J6.2                                             |
| `first-run.spec.ts`                                    | J5.1                                             |
| `fresh-signup.spec.ts`, `api-auth.spec.ts`             | J1.1                                             |
| `empty-states.spec.ts`                                 | J1.4                                             |
| `entity-consistency.spec.ts`                           | J2.5, J2.6                                       |
| `end-to-end.spec.ts`                                   | J7.1                                             |
| `seed-demo-smoke.spec.ts`                              | phase-0 fixtures smoke + global-setup invariants |

**Deletion was withheld** because removing 20 test files at once is an
irreversible destructive action best confirmed by a human. Recommended next step:
`git rm e2e/journeys/*.spec.ts` and drop the `legacy` project from
`playwright.config.ts` (leaving only `journeys`), then re-run the suite. The
coverage map already excludes these files (it scans `phase-*` only), so no map
churn results from the deletion.

## Gates

- `npm run check` — 0 errors.
- `npx vitest run` — 1724 passed.
- `npx vitest run --coverage` — passes the scheduling-path thresholds (exit 0).
- `npm run coverage:check` — map current, no focused/skipped tests.
- `npm run test:e2e:smoke` — 6 passed.
