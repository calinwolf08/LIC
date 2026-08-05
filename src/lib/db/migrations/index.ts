/**
 * Migration provider — dialect-scoped history plus a shared, portable future.
 *
 * The 27-migration SQLite history cannot replay on Postgres: 003 defaults a
 * column to `datetime('now')`, and 014/015 do the SQLite 12-step table rebuild
 * behind `PRAGMA foreign_keys = OFF`. So each engine owns its own history and
 * everything after it is written once, portably:
 *
 *   migrations/sqlite/    001..027      the original history, byte-for-byte
 *   migrations/postgres/  001_baseline  the same final schema, created directly
 *   migrations/shared/    100+          every future migration, both engines
 *
 * Kysely's `FileMigrationProvider` keys migrations on the file name minus its
 * extension, NOT on the path, so moving 001..027 into `sqlite/` left the names
 * recorded in `kysely_migration` unchanged — existing databases keep working.
 *
 * ADDING A THIRD ENGINE: create `migrations/<engine>/001_baseline.ts` and add
 * one entry to `dialectFolders` below. It inherits every shared migration for
 * free. Nothing else changes.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileMigrationProvider, Migrator, PostgresAdapter, SqliteAdapter } from 'kysely';
import type { Kysely, Migration, MigrationProvider } from 'kysely';
import { resolveDbConfig } from '../config';
import type { DbDialectName } from '../dialects/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Where each engine's own history lives, relative to this file.
 *
 * These folders hold migrations and NOTHING else. That matters: the provider
 * imports every `.ts`/`.js` it finds, and this file, `run.ts` and `helpers.ts`
 * used to sit in the scanned folder — which meant `run.ts`'s top-level `main()`
 * was imported and executed by the provider, running the whole migration set a
 * second time.
 */
const dialectFolders: Record<string, string> = {
	sqlite: 'sqlite',
	postgres: 'postgres',
};

/**
 * Portable migrations applied by every engine, numbered from 100 so they always
 * sort after any engine's own history (Kysely orders migrations by name).
 */
const SHARED_FOLDER = 'shared';

/**
 * Which migration history a live connection needs.
 *
 * Asked of the connection itself rather than of the environment, because the
 * two can legitimately disagree: the Postgres test lane drives PGlite through a
 * Kysely instance while `DATABASE_DIALECT` still says sqlite. Kysely's own
 * dialect adapter is the ground truth for which SQL family is on the other end
 * — and `kysely-pglite` reuses `PostgresAdapter`, so PGlite is detected as
 * Postgres, which is exactly right.
 */
function detectDialect(db: Kysely<unknown>): DbDialectName | undefined {
	const adapter = db.getExecutor().adapter;
	if (adapter instanceof SqliteAdapter) return 'sqlite';
	if (adapter instanceof PostgresAdapter) return 'postgres';
	return undefined;
}

/**
 * Concatenates several migration folders into one ordered set.
 *
 * Names must be unique across folders: a duplicate would mean two different
 * migrations sharing one row in `kysely_migration`, so it is a hard error
 * rather than a silent last-one-wins.
 */
class CompositeMigrationProvider implements MigrationProvider {
	readonly #folders: readonly string[];

	constructor(folders: readonly string[]) {
		this.#folders = folders;
	}

	async getMigrations(): Promise<Record<string, Migration>> {
		const merged: Record<string, Migration> = {};

		for (const folder of this.#folders) {
			const migrations = await new FileMigrationProvider({
				fs,
				path,
				migrationFolder: folder,
			}).getMigrations();

			for (const [name, migration] of Object.entries(migrations)) {
				if (name in merged) {
					throw new Error(
						`Duplicate migration name '${name}' in ${folder}. Migration names must be ` +
							'unique across the dialect and shared folders — they are the primary key ' +
							'of the kysely_migration table.'
					);
				}
				merged[name] = migration;
			}
		}

		// Kysely sorts by name itself, but returning a sorted object keeps
		// `getMigrations()` debuggable and makes the order obvious in tests.
		return Object.fromEntries(
			Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))
		);
	}
}

/**
 * Build the migration provider for one engine.
 *
 * @param dialect - engine name; defaults to the one resolved from the environment
 * @throws when the engine has no migration folder registered, because running
 *         the wrong engine's history would half-build a schema
 */
export function getMigrationProvider(
	dialect: DbDialectName = resolveDbConfig(process.env).dialect
): MigrationProvider {
	const folder = dialectFolders[dialect];
	if (!folder) {
		throw new Error(
			`No migrations for database dialect '${dialect}'. Add ` +
				`src/lib/db/migrations/${dialect}/001_baseline.ts and register the folder in ` +
				'src/lib/db/migrations/index.ts.'
		);
	}

	return new CompositeMigrationProvider([
		path.join(__dirname, folder),
		path.join(__dirname, SHARED_FOLDER),
	]);
}

export interface MigrateOptions {
	/**
	 * Force a specific engine's history. Only needed when the connection's own
	 * dialect cannot be detected; normally leave this alone.
	 */
	readonly dialect?: DbDialectName;
}

/**
 * Run all pending migrations.
 *
 * Signature unchanged from the SQLite-only version — every call site
 * (`db:setup`, `db:migrate`, the test helpers, the e2e setup) still calls it as
 * `migrateToLatest(db)` and gets the right history for whatever `db` is.
 *
 * @param db - Kysely database instance
 * @param options - optional engine override
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are
// schema-agnostic; `Kysely<unknown>` would reject every concrete instance.
export async function migrateToLatest(db: Kysely<any>, options: MigrateOptions = {}): Promise<void> {
	const dialect = options.dialect ?? detectDialect(db) ?? resolveDbConfig(process.env).dialect;

	const migrator = new Migrator({
		db,
		provider: getMigrationProvider(dialect),
	});

	const { error, results } = await migrator.migrateToLatest();

	results?.forEach((it) => {
		if (it.status === 'Success') {
			console.log(`✅ Migration "${it.migrationName}" was executed successfully`);
		} else if (it.status === 'Error') {
			console.error(`❌ Failed to execute migration "${it.migrationName}"`);
		}
	});

	if (error) {
		console.error('❌ Failed to migrate');
		// Throw rather than process.exit so tests can catch it and a caller can
		// decide; the CLI entry points (run.ts, setup-db.ts) already exit non-zero
		// on a rejected promise.
		throw error instanceof Error ? error : new Error(String(error));
	}

	console.log('✅ All migrations completed successfully');
}
