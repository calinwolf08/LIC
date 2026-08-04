/**
 * PostgreSQL engine (node-postgres) — the production target.
 */

import { PostgresDialect } from 'kysely';
import type { Dialect } from 'kysely';
import type { DbConfig, DbEnv, DdlTypeMap, DialectAdapter, PostgresDbConfig } from './types';

const columnTypes: DdlTypeMap = {
	text: 'text',
	integer: 'integer',
	bigint: 'bigint',
	real: 'double precision',
	// 0/1 in an integer column, exactly like SQLite. A real `boolean` would come
	// back as true/false and break the `=== 1` comparisons across the app.
	boolean: 'integer',
	// ISO-8601 strings, exactly like SQLite. `timestamptz` would return Date
	// objects and break string comparison/sorting.
	timestamp: 'text',
	json: 'jsonb',
	blob: 'bytea',
};

function asPostgresConfig(config: DbConfig): PostgresDbConfig {
	if (config.dialect !== 'postgres') {
		throw new Error(`The postgres adapter cannot handle a '${config.dialect}' config.`);
	}
	return config;
}

export const postgresAdapter: DialectAdapter = {
	name: 'postgres',
	label: 'PostgreSQL',
	columnTypes,
	urlSchemes: ['postgres', 'postgresql'],

	configFromEnv(env: DbEnv): PostgresDbConfig {
		const connectionString = env.DATABASE_URL?.trim();
		if (!connectionString) {
			throw new Error(
				'DATABASE_URL is required when the database dialect is "postgres". ' +
					'Set DATABASE_URL to a connection string such as ' +
					'postgres://user:password@host:5432/database.'
			);
		}
		return { dialect: 'postgres', connectionString };
	},

	configFromUrl(url: string): PostgresDbConfig {
		return { dialect: 'postgres', connectionString: url };
	},

	describeTarget(config: DbConfig): string {
		return redactConnectionString(asPostgresConfig(config).connectionString);
	},

	createDialect(config: DbConfig): Dialect {
		const { connectionString } = asPostgresConfig(config);

		return new PostgresDialect({
			// A factory, not a Pool: Kysely calls it once, when the first query
			// runs. That keeps `pg` (and any connection attempt) off the import
			// path of every process that merely touches the db module — which
			// matters because the default engine is SQLite.
			pool: async () => {
				const { default: pg } = await import('pg');
				return new pg.Pool({ connectionString });
			},
		});
	},
};

/**
 * Strip credentials from a connection string so it can safely be logged.
 * Falls back to a constant when the string is not parseable as a URL, because
 * a malformed URL must never leak a password into the logs.
 */
function redactConnectionString(connectionString: string): string {
	try {
		const url = new URL(connectionString);
		// No host means URL fell back to an opaque path, which can still contain
		// the credentials — refuse to print anything derived from it.
		if (!url.host) return '<connection string>';

		const database = url.pathname.replace(/^\//, '');
		return `${url.host}${database ? `/${database}` : ''}`;
	} catch {
		return '<connection string>';
	}
}
