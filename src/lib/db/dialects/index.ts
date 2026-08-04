/**
 * Dialect registry.
 *
 * ADDING A THIRD ENGINE (e.g. MySQL):
 *   1. Add `./mysql.ts` exporting a `DialectAdapter` (copy `./postgres.ts`;
 *      Kysely already ships MysqlDialect/MssqlDialect).
 *   2. Add one entry to `adapters` below.
 *   3. Add its config interface to the `DbConfig` union in `./types.ts`.
 * No call site changes: config resolution, `createDB()`, `db:setup` and
 * `db:migrate` all go through this map. Declaring `urlSchemes` on the new
 * adapter is enough to make DATABASE_URL inference work for it too.
 */

import { postgresAdapter } from './postgres';
import { sqliteAdapter } from './sqlite';
import type { DbDialectName, DialectAdapter } from './types';

const adapters: Record<string, DialectAdapter> = {
	[sqliteAdapter.name]: sqliteAdapter,
	[postgresAdapter.name]: postgresAdapter,
};

/** Registered engine names, sorted for stable error messages and logs. */
export function listDialectNames(): string[] {
	return Object.keys(adapters).sort();
}

export function isSupportedDialect(name: string): boolean {
	return Object.prototype.hasOwnProperty.call(adapters, name);
}

/**
 * Look up an engine by name.
 *
 * @throws with the list of supported names, because the usual cause is a typo
 *         in DATABASE_DIALECT and the fix is unguessable without that list.
 */
export function getDialectAdapter(name: DbDialectName): DialectAdapter {
	const adapter = adapters[name];
	if (!adapter) {
		throw new Error(
			`Unknown database dialect '${name}'. Supported dialects: ${listDialectNames().join(', ')}. ` +
				'Set DATABASE_DIALECT to one of those, or add an adapter in src/lib/db/dialects/.'
		);
	}
	return adapter;
}

/**
 * Find the engine that owns a URL scheme (e.g. 'postgresql'), or undefined when
 * no registered engine claims it.
 */
export function findDialectAdapterForUrlScheme(scheme: string): DialectAdapter | undefined {
	const normalized = scheme.toLowerCase();
	return Object.values(adapters).find((adapter) => adapter.urlSchemes?.includes(normalized));
}

export { postgresAdapter, sqliteAdapter };
export type {
	DbConfig,
	DbConfigBase,
	DbDialectName,
	DbEnv,
	DdlTypeMap,
	DialectAdapter,
	PostgresDbConfig,
	SqliteDbConfig,
} from './types';
