/**
 * Create the better-auth tables if they do not already exist.
 *
 * better-auth (with the better-sqlite3 adapter) does NOT create its tables at
 * runtime — they must be created ahead of time. The app's Kysely migrations
 * also assume the `user` table exists (migration 023 references it), so these
 * tables must be in place before (or alongside) `migrateToLatest`.
 *
 * This is the single source of truth for the auth schema, shared by the e2e
 * setup and the production `db:setup` bootstrap. Every statement uses
 * `ifNotExists`, so it is safe to run on every deploy.
 *
 * The columns mirror better-auth's default email/password schema. Two
 * app-specific columns on `user` (active_schedule_id, entitlements) are added by
 * migrations 023–026 rather than here, and those migrations guard on existence,
 * so ordering does not matter.
 */

import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function ensureAuthTables(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('user')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('emailVerified', 'integer', (col) => col.defaultTo(0))
		.addColumn('image', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

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
