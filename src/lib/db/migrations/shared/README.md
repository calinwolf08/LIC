# Shared migrations (100+)

Every migration written from now on goes **here**, not in `../sqlite/` or
`../postgres/`. Files in this folder run on **every** engine, in name order,
after that engine's own history — which is why they are numbered from `100`
(the dialect histories are all below 100).

`../sqlite/` and `../postgres/` are frozen history. Do not add to them, and do
not edit them: their file names are the primary key of the `kysely_migration`
table in every database that has already run them.

## Rules for a shared migration

0. **Import ONLY from `'kysely'`.** Kysely's `FileMigrationProvider` loads
   migration files by absolute path, and a migration's relative cross-tree
   imports do not resolve under every runner (Vitest's module runner cannot,
   even though production `tsx` can). So a migration must not import from
   `../helpers`, `../../dialects/...` or anywhere else — inline what you need
   (see below). This is why `postgres/001_baseline.ts` inlines its guards.
1. **Use the dialect-agnostic schema builder.** `db.schema.createTable(...)`,
   `.alterTable(...)`, `.createIndex(...)` compile correctly on both engines.
2. **Never use `PRAGMA`, `sqlite_master` or `pragma_table_info`.** None of them
   exist on Postgres. Inline these introspection guards, which work on every
   engine:

   ```ts
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   async function columnExists(db: Kysely<any>, table: string, column: string) {
     const tables = await db.introspection.getTables();
     return tables.find((t) => t.name === table)?.columns.some((c) => c.name === column) ?? false;
   }

   if (!(await columnExists(db, 'students', 'cohort'))) { … }
   ```

3. **No raw SQL defaults that only one engine understands.** `CURRENT_TIMESTAMP`
   and `datetime('now')` both yield a *timestamp*, not text, and the app stores
   ISO-8601 **text**. If a migration needs a "now" default, detect the engine
   from the connection (import only from `'kysely'`) and pick the matching SQL:

   ```ts
   import { sql, PostgresAdapter } from 'kysely';

   const isPg = db.getExecutor().adapter instanceof PostgresAdapter;
   const nowText = isPg
     ? sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`
     : sql`CURRENT_TIMESTAMP`;
   ```

4. **Booleans stay `integer` holding 0/1** on every engine. The app compares
   with `=== 1` in ~19 places and `src/lib/db/types.ts` is generated from the
   SQLite schema; a real Postgres `boolean` returns `true`/`false` and breaks
   both. Same for timestamps: `text`, never `timestamptz`.

5. **Make it idempotent** (`ifNotExists`, or a `tableExists`/`columnExists`
   guard). Deploys re-run `db:setup` on every release.

The equivalence test in `../migrations.equivalence.test.ts` runs the whole set
on SQLite and on PGlite and diffs the resulting schemas, so a migration that
only works on one engine fails CI.
