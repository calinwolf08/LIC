#!/usr/bin/env tsx

/**
 * E2E Test Database Setup Script
 *
 * Creates the test database with auth tables and runs migrations.
 * Run with: DATABASE_PATH=./test-sqlite.db npx tsx e2e/setup-test-db.ts
 */

import { createDB } from '../src/lib/db/connection';
import { migrateToLatest } from '../src/lib/db/migrations';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = process.env.DATABASE_PATH || './test-sqlite.db';

/**
 * Create better-auth tables if they don't exist
 * This is required because better-auth tables are normally created lazily
 * but our migrations (023) reference the user table
 */
async function createAuthTables(db: Kysely<any>): Promise<void> {
	// Create user table
	await db.schema
		.createTable('user')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('emailVerified', 'integer', (col) => col.defaultTo(0))
		.addColumn('image', 'text')
		.addColumn('active_schedule_id', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create session table
	await db.schema
		.createTable('session')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('token', 'text', (col) => col.notNull().unique())
		.addColumn('ipAddress', 'text')
		.addColumn('userAgent', 'text')
		.addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create account table
	await db.schema
		.createTable('account')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('accountId', 'text', (col) => col.notNull())
		.addColumn('providerId', 'text', (col) => col.notNull())
		.addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
		.addColumn('accessToken', 'text')
		.addColumn('refreshToken', 'text')
		.addColumn('idToken', 'text')
		.addColumn('accessTokenExpiresAt', 'text')
		.addColumn('refreshTokenExpiresAt', 'text')
		.addColumn('scope', 'text')
		.addColumn('password', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create verification table
	await db.schema
		.createTable('verification')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('identifier', 'text', (col) => col.notNull())
		.addColumn('value', 'text', (col) => col.notNull())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
}

async function main() {
	console.log('Setting up test database...');

	// Delete existing test database if it exists
	if (existsSync(TEST_DB_PATH)) {
		unlinkSync(TEST_DB_PATH);
		console.log('Deleted existing test database');
	}

	// Create new database connection
	const db = createDB(TEST_DB_PATH);

	try {
		// Create auth tables first (they're required for migration 023)
		await createAuthTables(db);
		console.log('Created auth tables');

		// Run migrations
		await migrateToLatest(db);
		console.log('Test database setup complete');
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Test database setup failed:', error);
	process.exit(1);
});
