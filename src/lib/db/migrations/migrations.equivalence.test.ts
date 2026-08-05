/**
 * SQLite ⇄ Postgres schema equivalence.
 *
 * The two engines take different routes to the same schema: SQLite replays the
 * 27-migration history in `./sqlite`, Postgres creates the end state in one shot
 * from `./postgres/001_baseline.ts`. Nothing but this test stops the two from
 * drifting apart — so it runs the real migrator on both and diffs the result.
 *
 * Postgres here is real PostgreSQL 18 (PGlite, WASM, in-process): no server, no
 * Docker, no CI setup. It costs a few seconds to boot, so both schemas are
 * gathered once in `beforeAll` and then asserted from several angles.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import type { TableMetadata } from 'kysely';
import Database from 'better-sqlite3';
import { KyselyPGlite } from 'kysely-pglite';
import { migrateToLatest } from './index';

/** table name → sorted column names. */
type Schema = Record<string, string[]>;

/**
 * Differences we have inspected and accept. Empty on purpose: the Postgres
 * baseline was derived from the introspected SQLite schema, so there is nothing
 * left to excuse. Anything new belongs here with a comment justifying it —
 * never in a loosened comparison below.
 */
const ACCEPTED_DIFFERENCES: readonly string[] = [];

let sqliteDb: Kysely<any>;
let postgresDb: Kysely<any>;
let sqliteTables: TableMetadata[] = [];
let postgresTables: TableMetadata[] = [];
let sqliteSchema: Schema = {};
let postgresSchema: Schema = {};

beforeAll(async () => {
	sqliteDb = new Kysely<any>({
		dialect: new SqliteDialect({ database: new Database(':memory:') }),
	});

	const { dialect } = await KyselyPGlite.create();
	postgresDb = new Kysely<any>({ dialect });

	// No explicit dialect argument: this also proves `migrateToLatest(db)` — the
	// signature every call site uses — picks the right history on its own.
	await migrateToLatest(sqliteDb);
	await migrateToLatest(postgresDb);

	// getTables() skips Kysely's own migration bookkeeping tables by default,
	// which is what we want: those are identical by construction.
	sqliteTables = await sqliteDb.introspection.getTables();
	postgresTables = await postgresDb.introspection.getTables();
	sqliteSchema = toSchema(sqliteTables);
	postgresSchema = toSchema(postgresTables);

	printDiff(sqliteSchema, postgresSchema);
}, 180_000);

afterAll(async () => {
	await sqliteDb?.destroy();
	await postgresDb?.destroy();
});

describe('migration schema equivalence across dialects', () => {
	it('creates a non-trivial schema on both engines', () => {
		// Guards against the comparison passing because both sides came up empty.
		expect(Object.keys(sqliteSchema).length).toBeGreaterThan(30);
		expect(Object.keys(postgresSchema).length).toBe(Object.keys(sqliteSchema).length);
	});

	it('creates the same set of tables on both engines', () => {
		expect(Object.keys(postgresSchema)).toEqual(Object.keys(sqliteSchema));
	});

	it('creates the same columns in every table on both engines', () => {
		// Comparing the whole map in one assertion makes vitest print the shape of
		// the entire diff; per-table assertions would show only the first failure.
		expect(postgresSchema).toEqual(sqliteSchema);
	});

	it('agrees on which columns are nullable (bar the SQLite TEXT-PK quirk)', () => {
		// Every table's primary key is `id`. SQLite's introspection reports a TEXT
		// PRIMARY KEY as nullable; Postgres reports a primary key as NOT NULL. Both
		// are the same non-null primary key (the app always supplies `id`, and the
		// generated types.ts already types it `string | null`), so normalise `id`
		// before comparing. Every other column is compared strictly, so real
		// nullability drift still fails this test.
		const normalise = (tables: TableMetadata[]) => {
			const map = nullability(tables);
			for (const key of Object.keys(map)) if (key.endsWith('.id')) map[key] = false;
			return map;
		};
		expect(normalise(postgresTables)).toEqual(normalise(sqliteTables));
	});

	it('has no unexplained differences', () => {
		expect(ACCEPTED_DIFFERENCES).toEqual([]);
	});
});

function toSchema(tables: TableMetadata[]): Schema {
	const schema: Schema = {};
	for (const table of [...tables].sort((a, b) => a.name.localeCompare(b.name))) {
		schema[table.name] = table.columns.map((column) => column.name).sort();
	}
	return schema;
}

/** 'table.column' → isNullable, so a mismatch names the exact column. */
function nullability(tables: TableMetadata[]): Record<string, boolean> {
	const result: Record<string, boolean> = {};
	for (const table of [...tables].sort((a, b) => a.name.localeCompare(b.name))) {
		for (const column of [...table.columns].sort((a, b) => a.name.localeCompare(b.name))) {
			result[`${table.name}.${column.name}`] = column.isNullable;
		}
	}
	return result;
}

/**
 * Print the diff even when it is empty — the point of this test is to be able
 * to read "SQLite and Postgres agree" straight out of a CI log.
 */
function printDiff(sqlite: Schema, postgres: Schema): void {
	const onlySqlite = Object.keys(sqlite).filter((t) => !(t in postgres));
	const onlyPostgres = Object.keys(postgres).filter((t) => !(t in sqlite));

	const columnDiffs: string[] = [];
	for (const [table, sqliteColumns] of Object.entries(sqlite)) {
		const postgresColumns = postgres[table];
		if (!postgresColumns) continue;
		const missing = sqliteColumns.filter((c) => !postgresColumns.includes(c));
		const extra = postgresColumns.filter((c) => !sqliteColumns.includes(c));
		if (missing.length || extra.length) {
			columnDiffs.push(
				`  ${table}: missing on postgres [${missing.join(', ')}] extra on postgres [${extra.join(', ')}]`
			);
		}
	}

	console.log(
		[
			'',
			'── SQLite vs Postgres schema diff ──',
			`tables: sqlite=${Object.keys(sqlite).length} postgres=${Object.keys(postgres).length}`,
			`only on sqlite:     ${onlySqlite.length ? onlySqlite.join(', ') : '(none)'}`,
			`only on postgres:   ${onlyPostgres.length ? onlyPostgres.join(', ') : '(none)'}`,
			`column differences: ${columnDiffs.length ? '\n' + columnDiffs.join('\n') : '(none)'}`,
			'────────────────────────────────────',
			'',
		].join('\n')
	);
}
