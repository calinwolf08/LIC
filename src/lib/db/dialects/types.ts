/**
 * Database dialect abstraction — shared contract.
 *
 * The app runs on SQLite locally and in tests, and on PostgreSQL in production.
 * Everything engine-specific lives behind `DialectAdapter`, so call sites only
 * ever deal with a resolved `DbConfig` and a Kysely instance.
 *
 * Adding a third engine means writing one module that exports a `DialectAdapter`
 * and registering it in `./index.ts` — see the comment there.
 */

import type { Dialect, Kysely } from 'kysely';

/**
 * Engine identifier. The two shipped engines are named explicitly so editors
 * autocomplete them, but the type stays open (`string & {}`) because the
 * registry is extensible — a third engine must not require editing this union.
 */
export type DbDialectName = 'sqlite' | 'postgres' | (string & {});

/** Environment shape config resolution reads from. `process.env` satisfies it. */
export type DbEnv = Record<string, string | undefined>;

export interface DbConfigBase {
	readonly dialect: DbDialectName;
}

export interface SqliteDbConfig extends DbConfigBase {
	readonly dialect: 'sqlite';
	/** Path to the database file, or ':memory:'. */
	readonly path: string;
}

export interface PostgresDbConfig extends DbConfigBase {
	readonly dialect: 'postgres';
	/** Full libpq connection string, e.g. postgres://user:pass@host:5432/db */
	readonly connectionString: string;
}

/**
 * Resolved, validated database configuration.
 *
 * A third engine adds its own `…DbConfig` interface and one member to this
 * union; nothing else in the codebase needs to change, because every consumer
 * either passes the config straight to an adapter or narrows on `dialect`.
 */
export type DbConfig = SqliteDbConfig | PostgresDbConfig;

/**
 * Portable DDL column types.
 *
 * Migrations and the auth schema ask the adapter for a type instead of
 * hard-coding one, so the same DDL builds on every engine.
 *
 * Two mappings are deliberate rather than obvious:
 *   - `boolean` is an integer on BOTH engines. The app stores 0/1 and compares
 *     with `x === 1` in ~19 places; a real Postgres `boolean` would come back as
 *     `true`/`false` and silently break every one of those comparisons.
 *   - `timestamp` is text on BOTH engines. Timestamps are stored as ISO-8601
 *     strings and compared/sorted lexicographically; `timestamptz` would return
 *     `Date` objects on Postgres and break the same way.
 */
export interface DdlTypeMap {
	readonly text: string;
	readonly integer: string;
	readonly bigint: string;
	readonly real: string;
	/** 0/1 stored as an integer — see the note above before "fixing" this. */
	readonly boolean: string;
	/** ISO-8601 string — see the note above before "fixing" this. */
	readonly timestamp: string;
	readonly json: string;
	readonly blob: string;
}

/**
 * Everything the rest of the app needs to know about one database engine.
 */
export interface DialectAdapter {
	/** Registry key, e.g. 'sqlite'. Must match its key in the registry map. */
	readonly name: DbDialectName;
	/** Human-readable name for logs, e.g. 'SQLite'. */
	readonly label: string;
	/** DDL column types for this engine (consumed by migrations and auth DDL). */
	readonly columnTypes: DdlTypeMap;
	/**
	 * URL schemes that imply this engine, without the '://'. Used to infer the
	 * dialect from `DATABASE_URL` — a third engine gets inference for free by
	 * declaring its schemes here.
	 */
	readonly urlSchemes?: readonly string[];

	/**
	 * Build this engine's config from environment variables. Pure: it reads only
	 * the passed-in env, never `process.env`, so config resolution stays
	 * unit-testable. Throws a clear error when a required variable is missing.
	 */
	configFromEnv(env: DbEnv): DbConfig;

	/**
	 * Build this engine's config from a connection URL. Only needed by engines
	 * that declare `urlSchemes`.
	 */
	configFromUrl?(url: string): DbConfig;

	/** Redacted, log-safe description of what this config points at. */
	describeTarget(config: DbConfig): string;

	/** Create the Kysely dialect for this config. Must not open a connection. */
	createDialect(config: DbConfig): Dialect;

	/**
	 * Optional one-time setup run immediately after the Kysely instance exists
	 * (session settings, extensions, …). May be async; `createDB()` is
	 * synchronous, so an async hook is fire-and-forget — Kysely serialises
	 * queries per connection, so work queued here still lands before the first
	 * application query.
	 *
	 * SQLite's pragmas do NOT use this hook: they are applied eagerly on the
	 * better-sqlite3 handle inside `createDialect`, where they are guaranteed to
	 * be in effect before anything else touches the file. See ./sqlite.ts.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the hook is
	// schema-agnostic; `Kysely<unknown>` would reject every concrete instance.
	onCreated?(db: Kysely<any>, config: DbConfig): void | Promise<void>;

	/**
	 * Extra teardown beyond `db.destroy()`. Kysely's own drivers already close
	 * their pool/handle on destroy, so both shipped engines leave this unset;
	 * it exists for drivers that own resources Kysely does not know about.
	 */
	destroy?(config: DbConfig): void | Promise<void>;
}
