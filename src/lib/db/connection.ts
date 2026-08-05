import { Kysely } from 'kysely';
import type { Dialect } from 'kysely';
import { describeDbConfig, resolveDbConfig } from './config';
import { getDialectAdapter } from './dialects/index';
import type { DbConfig } from './dialects/types';
import type { DB } from './types';

/**
 * Create and configure the database instance.
 *
 * The engine comes from the dialect registry, so the same call works on SQLite
 * and PostgreSQL. Three ways to call it:
 *
 *   createDB()                  resolve the engine from process.env
 *   createDB('./sqlite.db')     SQLite at that path (the long-standing
 *                               signature, kept for the ~15 scripts, tests and
 *                               e2e helpers that pass a path)
 *   createDB({ dialect: … })    an already-resolved config
 *
 * @param target - a SQLite file path, a resolved config, or nothing
 */
export function createDB(target?: string | DbConfig): Kysely<DB> {
	const config = toConfig(target);
	const adapter = getDialectAdapter(config.dialect);

	const db = new Kysely<DB>({ dialect: adapter.createDialect(config) });

	// Optional engine setup. Fire-and-forget when async: Kysely serialises
	// queries per connection, so anything queued here still runs before the
	// first application query. Failures are logged rather than left as an
	// unhandled rejection that would take the process down.
	const created = adapter.onCreated?.(db, config);
	if (created instanceof Promise) {
		created.catch((error) => {
			console.error(`Database setup for ${adapter.label} failed:`, error);
		});
	}

	return db;
}

/**
 * Create a Kysely instance over a dialect that has already been built.
 *
 * Needed by the test lanes, which exercise the Postgres code path against an
 * in-process PGlite dialect that no adapter can construct from env vars.
 */
export function createDBFromDialect(dialect: Dialect): Kysely<DB> {
	return new Kysely<DB>({ dialect });
}

/** The configuration the singleton below is built from. */
export const activeDbConfig: DbConfig = resolveDbConfig(process.env);

/** Log-safe description of the active database, e.g. 'SQLite (./sqlite.db)'. */
export function describeActiveDb(): string {
	return describeDbConfig(activeDbConfig);
}

/**
 * Singleton database instance
 * Import this throughout the app for database operations
 * Engine and target come from the environment (see ./config.ts)
 */
export const db = createDB(activeDbConfig);

function toConfig(target?: string | DbConfig): DbConfig {
	if (typeof target === 'string') {
		// Historic signature: a bare string has always meant "SQLite file path".
		return { dialect: 'sqlite', path: target };
	}
	return target ?? resolveDbConfig(process.env);
}
