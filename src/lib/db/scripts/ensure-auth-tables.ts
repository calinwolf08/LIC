/**
 * Create the better-auth tables if they do not already exist.
 *
 * better-auth does NOT create its tables at runtime — they must be created
 * ahead of time. The app's Kysely migrations also assume the `user` table
 * exists (migration 023 references it), so these tables must be in place before
 * (or alongside) `migrateToLatest`.
 *
 * This is the single source of truth for the auth schema, shared by the e2e
 * setup and the production `db:setup` bootstrap. Every statement uses
 * `ifNotExists`, so it is safe to run on every deploy.
 *
 * The columns mirror better-auth's default email/password schema. Two
 * app-specific columns on `user` (active_schedule_id, entitlements) are added by
 * migrations 023–026 rather than here, and those migrations guard on existence,
 * so ordering does not matter.
 *
 * Column TYPES are per-engine — see `getAuthDialectProfile` below for why the
 * auth tables cannot simply reuse the app-wide text/integer convention.
 */

import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { resolveDbConfig } from '../config';
import { getDialectAdapter } from '../dialects/index';
import type { DbDialectName } from '../dialects/types';

/**
 * The dialect names better-auth's own Kysely adapter understands. This is
 * better-auth's `KyselyDatabaseType`, restated so this module does not depend on
 * a deep import into better-auth's generated .d.ts chunks.
 */
export type BetterAuthKyselyType = 'sqlite' | 'postgres' | 'mysql' | 'mssql';

/**
 * Everything the auth layer needs to know about one engine: the name better-auth
 * is told, and the DDL types that name implies.
 */
export interface AuthDialectProfile {
	/** Value passed to better-auth as `database: { db, type }`. */
	readonly kyselyType: BetterAuthKyselyType;
	/** Type for every string column. */
	readonly text: string;
	/** Type for `emailVerified`. */
	readonly boolean: string;
	/** SQL literal for a false boolean in this engine's `boolean` type. */
	readonly falseLiteral: string;
	/** Type for every timestamp column (createdAt, expiresAt, …). */
	readonly timestamp: string;
}

/**
 * Per-engine deviations from the adapter's app-wide `columnTypes` map.
 *
 * WHY these two decisions are one decision: better-auth's Kysely adapter derives
 * how it SERIALISES values from the `type` it is handed. Measured against
 * better-auth 1.3.34 (`kyselyAdapter`, `supportsBooleans`/`supportsDates`):
 *
 *   type: 'sqlite'    booleans are written as 0/1 and dates as ISO-8601 strings
 *   type: 'postgres'  booleans are written as real booleans and dates as `Date`
 *
 * So the DDL cannot be chosen independently of the `type`. Telling better-auth
 * 'postgres' while giving it the app's portable `integer`/`text` columns fails
 * on a real server — verified against PostgreSQL 18.3:
 *
 *   insert into "user" (…, "emailVerified", …) values (…, $3, …)
 *   ERROR 22P02: invalid input syntax for type integer  ($3 = false)
 *
 * …which is exactly the 500 a fresh production database returns on first
 * sign-up. Postgres therefore gets its NATIVE `boolean`/`timestamptz` for the
 * columns better-auth owns, while SQLite keeps `integer`/`text`.
 *
 * The app never reads those columns (it reads only id, email,
 * active_schedule_id and entitlements — all `text` on both engines), so
 * `src/lib/db/types.ts`, generated from SQLite, stays valid for every column the
 * application touches.
 *
 * ADDING A THIRD ENGINE: add one entry here. Omit `boolean`/`timestamp` when the
 * engine's better-auth type already coerces to the portable representation
 * (true for 'sqlite', 'mysql' and 'mssql'); the adapter's `columnTypes` map then
 * supplies them.
 */
const authProfiles: Record<
	string,
	{ kyselyType: BetterAuthKyselyType; boolean?: string; falseLiteral?: string; timestamp?: string }
> = {
	sqlite: { kyselyType: 'sqlite' },
	postgres: {
		kyselyType: 'postgres',
		boolean: 'boolean',
		falseLiteral: 'false',
		timestamp: 'timestamptz',
	},
};

/**
 * Resolve the auth profile for an engine.
 *
 * @throws when the engine has no profile — a registered dialect without one
 *         would otherwise silently build auth tables better-auth cannot write to.
 */
export function getAuthDialectProfile(dialect: DbDialectName): AuthDialectProfile {
	const overrides = authProfiles[dialect];
	if (!overrides) {
		throw new Error(
			`No better-auth profile for database dialect '${dialect}'. ` +
				'Add one to `authProfiles` in src/lib/db/scripts/ensure-auth-tables.ts ' +
				'(it declares the better-auth adapter type and any native column types that type implies).'
		);
	}

	// Everything else comes from the dialect registry, so a new engine only has
	// to declare what better-auth forces it to deviate on.
	const { columnTypes } = getDialectAdapter(dialect);

	return {
		kyselyType: overrides.kyselyType,
		text: columnTypes.text,
		boolean: overrides.boolean ?? columnTypes.boolean,
		falseLiteral: overrides.falseLiteral ?? '0',
		timestamp: overrides.timestamp ?? columnTypes.timestamp,
	};
}

/**
 * Create the four better-auth tables, if missing, in the shape better-auth
 * expects for `dialect`.
 *
 * @param db      target database
 * @param dialect engine to emit DDL for; defaults to the one the environment
 *                selects, which is what both callers (`db:setup` and the e2e
 *                bootstrap) already build their connection from.
 */
export async function ensureAuthTables(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth tables
	// are not in the generated DB type until they exist.
	db: Kysely<any>,
	dialect: DbDialectName = resolveDbConfig(process.env).dialect
): Promise<void> {
	const t = getAuthDialectProfile(dialect);

	// `sql.raw` rather than Kysely's ColumnDataType union: the types come from the
	// dialect registry as engine-specific strings ('timestamptz', 'jsonb', …) that
	// the union does not model.
	const text = sql.raw(t.text);
	const timestamp = sql.raw(t.timestamp);
	const bool = sql.raw(t.boolean);
	const boolFalse = sql.raw(t.falseLiteral);

	await db.schema
		.createTable('user')
		.ifNotExists()
		.addColumn('id', text, (col) => col.primaryKey())
		.addColumn('name', text, (col) => col.notNull())
		.addColumn('email', text, (col) => col.notNull().unique())
		.addColumn('emailVerified', bool, (col) => col.defaultTo(boolFalse))
		.addColumn('image', text)
		.addColumn('createdAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await db.schema
		.createTable('session')
		.ifNotExists()
		.addColumn('id', text, (col) => col.primaryKey())
		.addColumn('expiresAt', timestamp, (col) => col.notNull())
		.addColumn('token', text, (col) => col.notNull().unique())
		.addColumn('ipAddress', text)
		.addColumn('userAgent', text)
		.addColumn('userId', text, (col) => col.notNull().references('user.id'))
		.addColumn('createdAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await db.schema
		.createTable('account')
		.ifNotExists()
		.addColumn('id', text, (col) => col.primaryKey())
		.addColumn('accountId', text, (col) => col.notNull())
		.addColumn('providerId', text, (col) => col.notNull())
		.addColumn('userId', text, (col) => col.notNull().references('user.id'))
		.addColumn('accessToken', text)
		.addColumn('refreshToken', text)
		.addColumn('idToken', text)
		.addColumn('accessTokenExpiresAt', timestamp)
		.addColumn('refreshTokenExpiresAt', timestamp)
		.addColumn('scope', text)
		.addColumn('password', text)
		.addColumn('createdAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await db.schema
		.createTable('verification')
		.ifNotExists()
		.addColumn('id', text, (col) => col.primaryKey())
		.addColumn('identifier', text, (col) => col.notNull())
		.addColumn('value', text, (col) => col.notNull())
		.addColumn('expiresAt', timestamp, (col) => col.notNull())
		.addColumn('createdAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', timestamp, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
}
