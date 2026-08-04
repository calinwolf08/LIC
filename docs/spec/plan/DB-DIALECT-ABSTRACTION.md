# Database Dialect Abstraction — SQLite (local/test) + Postgres (production)

## Objective

Run the same application on **SQLite** (fast local dev and tests, unchanged developer
experience) and **PostgreSQL** (production on Coolify), selected by environment variables, with a
seam that makes adding a **third engine** a matter of adding one file and registering it.

Non-goals: changing application/domain code, changing the test workflow, or migrating existing
production data (production is currently empty — that is the bug that started this).

## Verified findings (spikes run against this repo)

These are measured, not assumed:

| Finding | Consequence |
|---|---|
| PGlite (`@electric-sql/pglite`) runs **real PostgreSQL 18.3** in-process (WASM) and drives Kysely via `kysely-pglite` | The Postgres path is verifiable in CI/containers with **no Postgres server and no Docker** |
| An `integer` column holding 0/1 round-trips as a JS **number** on Postgres (`row.is_active === 1` is `true`) | The ~19 integer-boolean comparisons and the generated `types.ts` need **no changes** |
| `db.introspection.getTables()` returns tables+columns on **both** dialects | Portable replacement for `pragma_table_info` / `sqlite_master` idempotency guards |
| `kysely` 0.28.8 ships `postgres` + `sqlite` (+ mysql, mssql) dialects | A third engine is a dialect module, not a rewrite |
| Migrations **003** (`datetime('now')`), **014**, **015** (`PRAGMA foreign_keys` + table-rebuild) are irreducibly SQLite-specific | The 27-migration history **cannot** replay on Postgres; Postgres needs a baseline (see D4) |
| `better-auth` 1.3.34 can take a Kysely instance + dialect type | One auth code path for every engine, instead of driver-specific branches |

## Design decisions

**D1 — Dialect registry.** `src/lib/db/dialects/` holds one module per engine exposing a common
`DialectAdapter` (create Kysely dialect, engine name, DDL type mapping, connection teardown,
display label). `index.ts` registers them in a map. **Adding a third engine = add a file + one map
entry**; no call site changes.

**D2 — Environment-driven selection.** Precedence: explicit `DATABASE_DIALECT` → inferred from
`DATABASE_URL` scheme (`postgres://`/`postgresql://` → postgres) → default `sqlite` with
`DATABASE_PATH` (default `./sqlite.db`). Resolution is one pure function, unit-tested, so the rules
are provable without a database.

**D3 — Portable column types.** Keep `text` + `integer` (0/1 booleans) across engines. Verified to
behave identically, so application code, the 19 boolean comparisons, and `src/lib/db/types.ts`
stay untouched. This is the single biggest churn-avoidance decision.

**D4 — Migration strategy: keep SQLite history, baseline Postgres, share the future.**
The SQLite history stays byte-for-byte as-is (existing SQLite databases keep working). Postgres gets
a **baseline migration** that creates the equivalent final schema directly. Future migrations are
written portably **once** in a shared folder and applied by both, via a composite migration provider:

```
migrations/sqlite/    001..027   (existing history, untouched)
migrations/postgres/  001_baseline  (equivalent final schema)
migrations/shared/    100+          (all future migrations, portable, applied by both)
```

Numbering keeps ordering unambiguous (dialect history < 100 ≤ shared). This is why a third engine is
cheap: it needs one baseline, then inherits every future migration.

**D5 — Portable idempotency guards.** Shared/future migrations use a `tableExists` / `columnExists`
helper built on `db.introspection.getTables()` instead of SQLite pragmas.

**D6 — One auth code path.** `auth.ts` hands better-auth the Kysely instance + dialect type from the
registry. The signup hook's synchronous `better-sqlite3` `prepare().run()` is rewritten as async
Kysely queries so it works on every engine.

**D7 — Dialect-aware auth DDL.** `ensure-auth-tables.ts` emits per-engine types via the adapter's
type map (verified against better-auth's expectations on both engines).

**D8 — Tests: default unchanged, Postgres opt-in.** `npm run test:unit` stays SQLite in-memory and
just as fast. A **Postgres lane** runs the migration/integration suites against PGlite (no server);
`TEST_DATABASE_URL` targets a real Postgres when available.

**D9 — `db:setup` is dialect-aware and never seeds.** Production stays seed-free.

## Work packages

Ordering reflects real dependencies; WP2 and WP3 touch disjoint files and run in parallel.

| WP | Scope | Owns (files) | Model |
|---|---|---|---|
| **WP1** Foundation | Dialect registry, config resolution, `createDB`, dep placement, dialect-aware `db:setup`/`db:migrate` | `src/lib/db/dialects/**`, `db/config.ts`, `db/connection.ts`, `db/scripts/setup-db.ts`, `db/migrations/run.ts`, `package.json` | opus |
| **WP2** Migrations | Composite provider, Postgres baseline, portable guards, dialect-scoped folders | `src/lib/db/migrations/**` | opus |
| **WP3** Auth | Dual-dialect better-auth wiring, async signup hook, dialect-aware auth DDL | `src/lib/auth.ts`, `db/scripts/ensure-auth-tables.ts` | opus |
| **WP4** Tests | Keep default SQLite lane green; add PGlite Postgres lane | `db/test-utils.ts`, `e2e/test-db.ts`, `e2e/setup-test-db.ts`, `vite.config.ts`, scripts | sonnet |
| **WP5** Docs | Coolify Postgres deployment, env vars, adding a third engine | `README.md`, this plan | sonnet |

## Acceptance criteria

- [ ] `npm run test:unit` (SQLite) passes with the **same** count as today and no slower.
- [ ] The Postgres lane runs migrations + integration suites green against PGlite.
- [ ] `npm run db:setup` builds a complete schema on **both** engines from empty.
- [ ] A real better-auth sign-up succeeds on **both** engines and creates the default schedule.
- [ ] Switching engines requires **only** env vars — no code edits.
- [ ] `svelte-check`, `npm run build`, and the Playwright journeys suite stay green.
- [ ] No seed data is created by any deployment command.
