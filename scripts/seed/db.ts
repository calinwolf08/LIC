/**
 * Database connection for seed scripts
 */

import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { DB } from '../../src/lib/db/types';

const dbPath = process.env.DATABASE_PATH || './sqlite.db';

export const db = new Kysely<DB>({
	dialect: new SqliteDialect({
		database: new Database(dbPath),
	}),
});
