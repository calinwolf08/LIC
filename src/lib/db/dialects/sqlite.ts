/**
 * SQLite engine (better-sqlite3) — the default for local development and tests.
 */

import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import type { Dialect } from 'kysely';
import type { DbConfig, DbEnv, DdlTypeMap, DialectAdapter, SqliteDbConfig } from './types';

/** Used when neither DATABASE_PATH nor an explicit path is supplied. */
export const DEFAULT_SQLITE_PATH = './sqlite.db';

const columnTypes: DdlTypeMap = {
	text: 'text',
	integer: 'integer',
	// SQLite has one integer type; 64-bit values live in the same column type.
	bigint: 'integer',
	real: 'real',
	// 0/1 in an integer column — see DdlTypeMap for why this is not a boolean.
	boolean: 'integer',
	// ISO-8601 strings — see DdlTypeMap for why this is not a date type.
	timestamp: 'text',
	json: 'text',
	blob: 'blob',
};

function asSqliteConfig(config: DbConfig): SqliteDbConfig {
	if (config.dialect !== 'sqlite') {
		throw new Error(`The sqlite adapter cannot handle a '${config.dialect}' config.`);
	}
	return config;
}

export const sqliteAdapter: DialectAdapter = {
	name: 'sqlite',
	label: 'SQLite',
	columnTypes,

	configFromEnv(env: DbEnv): SqliteDbConfig {
		return {
			dialect: 'sqlite',
			path: env.DATABASE_PATH?.trim() || DEFAULT_SQLITE_PATH,
		};
	},

	describeTarget(config: DbConfig): string {
		return asSqliteConfig(config).path;
	},

	createDialect(config: DbConfig): Dialect {
		const sqlite = new Database(asSqliteConfig(config).path);

		// Pragmas are applied here, on the raw handle, rather than in `onCreated`:
		// better-sqlite3 sets them synchronously, so they are guaranteed to be in
		// effect before the first query — and `createDB()` must stay synchronous
		// for the existing call sites that use its result immediately.

		// WAL mode for better concurrency (readers do not block the writer).
		sqlite.pragma('journal_mode = WAL');

		// Wait up to 10s for a lock instead of failing immediately.
		sqlite.pragma('busy_timeout = 10000');

		return new SqliteDialect({ database: sqlite });
	},
};
