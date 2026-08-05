/**
 * Database configuration resolution.
 *
 * Which engine the app talks to is decided by environment variables only — no
 * code change is needed to switch between SQLite and PostgreSQL:
 *
 *   DATABASE_DIALECT  explicit engine name ('sqlite' | 'postgres' | …)
 *   DATABASE_URL      connection string; its scheme infers the engine
 *   DATABASE_PATH     SQLite file path (default ./sqlite.db)
 *
 * `resolveDbConfig` is pure — it reads the env object it is handed and never
 * `process.env` — so the precedence rules are provable in unit tests without a
 * database.
 */

import {
	findDialectAdapterForUrlScheme,
	getDialectAdapter,
	listDialectNames,
} from './dialects/index';
import { DEFAULT_SQLITE_PATH } from './dialects/sqlite';
import type { DbConfig, DbEnv } from './dialects/types';

export { DEFAULT_SQLITE_PATH };
export type { DbConfig, DbEnv };

/**
 * Resolve the database configuration from environment variables.
 *
 * Precedence:
 *   1. `DATABASE_DIALECT` — explicit wins over everything; an unknown value
 *      throws rather than silently falling back to SQLite (a silent fallback in
 *      production would write to a local file nobody reads).
 *   2. `DATABASE_URL` — the scheme picks the engine (postgres://, postgresql://).
 *      A scheme no registered engine claims is ignored, not an error.
 *   3. SQLite at `DATABASE_PATH`, defaulting to ./sqlite.db.
 *
 * Blank/whitespace-only values are treated as unset, because container runtimes
 * routinely inject empty strings for unset variables.
 *
 * @throws when DATABASE_DIALECT names an unknown engine, or when the chosen
 *         engine is missing a required variable (e.g. postgres without
 *         DATABASE_URL).
 */
export function resolveDbConfig(env: DbEnv): DbConfig {
	const explicit = env.DATABASE_DIALECT?.trim();
	if (explicit) {
		// getDialectAdapter throws a message listing the supported names.
		return getDialectAdapter(explicit.toLowerCase()).configFromEnv(env);
	}

	const url = env.DATABASE_URL?.trim();
	if (url) {
		const scheme = parseUrlScheme(url);
		if (scheme) {
			const adapter = findDialectAdapterForUrlScheme(scheme);
			if (adapter?.configFromUrl) {
				return adapter.configFromUrl(url);
			}
		}
	}

	return getDialectAdapter('sqlite').configFromEnv(env);
}

/** Log-safe, one-line description of a resolved config (credentials redacted). */
export function describeDbConfig(config: DbConfig): string {
	const adapter = getDialectAdapter(config.dialect);
	return `${adapter.label} (${adapter.describeTarget(config)})`;
}

export { listDialectNames };

/** Scheme of a connection URL without '://', or undefined when it has none. */
function parseUrlScheme(url: string): string | undefined {
	const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
	return match ? match[1].toLowerCase() : undefined;
}
