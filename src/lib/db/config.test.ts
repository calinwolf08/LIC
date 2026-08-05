import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SQLITE_PATH, describeDbConfig, resolveDbConfig } from './config';
import { getDialectAdapter, listDialectNames } from './dialects/index';

/**
 * These tests are the specification of the engine-selection rules. They run
 * without a database because `resolveDbConfig` is pure — every case below is a
 * plain object in, plain object out.
 */
describe('resolveDbConfig', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('1. explicit DATABASE_DIALECT wins', () => {
		it('selects sqlite and uses DATABASE_PATH', () => {
			expect(
				resolveDbConfig({ DATABASE_DIALECT: 'sqlite', DATABASE_PATH: './data/app.db' })
			).toEqual({ dialect: 'sqlite', path: './data/app.db' });
		});

		it('selects postgres and carries the connection string', () => {
			expect(
				resolveDbConfig({
					DATABASE_DIALECT: 'postgres',
					DATABASE_URL: 'postgres://u:p@db:5432/app',
				})
			).toEqual({ dialect: 'postgres', connectionString: 'postgres://u:p@db:5432/app' });
		});

		it('overrides a DATABASE_URL that points at another engine', () => {
			// Deploy platforms inject DATABASE_URL freely; the explicit setting is
			// the operator's intent and must not be second-guessed.
			expect(
				resolveDbConfig({
					DATABASE_DIALECT: 'sqlite',
					DATABASE_URL: 'postgres://u:p@db:5432/app',
					DATABASE_PATH: './sqlite.db',
				})
			).toEqual({ dialect: 'sqlite', path: './sqlite.db' });
		});

		it('is case-insensitive and ignores surrounding whitespace', () => {
			expect(
				resolveDbConfig({ DATABASE_DIALECT: '  POSTGRES ', DATABASE_URL: 'postgres://h/app' })
			).toEqual({ dialect: 'postgres', connectionString: 'postgres://h/app' });
		});

		it('treats a blank value as unset and falls through to the sqlite default', () => {
			// Container runtimes routinely pass empty strings for unset variables.
			expect(resolveDbConfig({ DATABASE_DIALECT: '   ' })).toEqual({
				dialect: 'sqlite',
				path: DEFAULT_SQLITE_PATH,
			});
		});

		it('throws for an unknown engine, listing the supported names', () => {
			expect(() => resolveDbConfig({ DATABASE_DIALECT: 'mongodb' })).toThrow(
				/Unknown database dialect 'mongodb'.*postgres, sqlite/s
			);
		});

		it('throws when postgres is chosen without DATABASE_URL', () => {
			expect(() => resolveDbConfig({ DATABASE_DIALECT: 'postgres' })).toThrow(
				/DATABASE_URL is required/
			);
		});

		it('throws when postgres is chosen with a blank DATABASE_URL', () => {
			expect(() => resolveDbConfig({ DATABASE_DIALECT: 'postgres', DATABASE_URL: '' })).toThrow(
				/DATABASE_URL is required/
			);
		});
	});

	describe('2. inference from the DATABASE_URL scheme', () => {
		it.each(['postgres://user:pw@host:5432/app', 'postgresql://user:pw@host:5432/app'])(
			'infers postgres from %s',
			(url) => {
				expect(resolveDbConfig({ DATABASE_URL: url })).toEqual({
					dialect: 'postgres',
					connectionString: url,
				});
			}
		);

		it('ignores a scheme no registered engine claims', () => {
			expect(resolveDbConfig({ DATABASE_URL: 'mysql://user:pw@host/app' })).toEqual({
				dialect: 'sqlite',
				path: DEFAULT_SQLITE_PATH,
			});
		});

		it('ignores a value that is not a URL', () => {
			expect(resolveDbConfig({ DATABASE_URL: 'not-a-url' })).toEqual({
				dialect: 'sqlite',
				path: DEFAULT_SQLITE_PATH,
			});
		});
	});

	describe('3. sqlite fallback', () => {
		it('defaults to ./sqlite.db when nothing is set', () => {
			expect(resolveDbConfig({})).toEqual({ dialect: 'sqlite', path: DEFAULT_SQLITE_PATH });
		});

		it('honours DATABASE_PATH', () => {
			expect(resolveDbConfig({ DATABASE_PATH: './test-sqlite.db' })).toEqual({
				dialect: 'sqlite',
				path: './test-sqlite.db',
			});
		});

		it('treats a blank DATABASE_PATH as unset', () => {
			expect(resolveDbConfig({ DATABASE_PATH: '' })).toEqual({
				dialect: 'sqlite',
				path: DEFAULT_SQLITE_PATH,
			});
		});
	});

	it('is pure — it never reads process.env', () => {
		vi.stubEnv('DATABASE_DIALECT', 'postgres');
		vi.stubEnv('DATABASE_URL', 'postgres://u:p@host/app');

		expect(resolveDbConfig({})).toEqual({ dialect: 'sqlite', path: DEFAULT_SQLITE_PATH });
	});
});

describe('describeDbConfig', () => {
	it('describes a sqlite target', () => {
		expect(describeDbConfig({ dialect: 'sqlite', path: './sqlite.db' })).toBe(
			'SQLite (./sqlite.db)'
		);
	});

	it('redacts postgres credentials so they never reach the logs', () => {
		const described = describeDbConfig({
			dialect: 'postgres',
			connectionString: 'postgres://admin:hunter2@db.internal:5432/app',
		});

		expect(described).toBe('PostgreSQL (db.internal:5432/app)');
	});

	it('never leaks an unparseable connection string', () => {
		expect(
			describeDbConfig({ dialect: 'postgres', connectionString: 'postgres:/broken:hunter2@' })
		).toBe('PostgreSQL (<connection string>)');
	});
});

describe('dialect registry', () => {
	it('registers both shipped engines', () => {
		expect(listDialectNames()).toEqual(['postgres', 'sqlite']);
	});

	it('throws an actionable error for an unregistered engine', () => {
		expect(() => getDialectAdapter('oracle')).toThrow(
			/Unknown database dialect 'oracle'. Supported dialects: postgres, sqlite/
		);
	});

	it('maps booleans to integer on every engine so `x === 1` keeps working', () => {
		// The app stores 0/1 and compares numerically in ~19 places; a real
		// boolean column on Postgres would return true/false and break them all.
		for (const name of listDialectNames()) {
			expect(getDialectAdapter(name).columnTypes.boolean).toBe('integer');
		}
	});
});
