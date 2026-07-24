/**
 * Migration 026: Entitlements and assignment flags
 *
 * Adds:
 * - `user.entitlements`            — JSON array of entitlement strings (Stage 2 gating).
 *                                     Only defined value today is "autogen".
 * - `schedule_assignments.locked`  — preset/locked assignments preserved by generation.
 * - `schedule_assignments.source`  — 'manual' | 'generated', how the assignment was created.
 *
 * Idempotent — safe to run multiple times.
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
	const result = await sql<{ count: number }>`
		SELECT COUNT(*) as count FROM pragma_table_info(${table})
		WHERE name = ${column}
	`.execute(db);
	return (result.rows[0]?.count ?? 0) > 0;
}

async function tableExists(db: Kysely<any>, table: string): Promise<boolean> {
	const result = await sql<{ count: number }>`
		SELECT COUNT(*) as count FROM sqlite_master
		WHERE type='table' AND name=${table}
	`.execute(db);
	return (result.rows[0]?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
	// user.entitlements — the user table is created by better-auth; it may not
	// exist yet on a fresh DB (it is created on first sign-up). Guard for that.
	if (await tableExists(db, 'user')) {
		if (!(await columnExists(db, 'user', 'entitlements'))) {
			await db.schema
				.alterTable('user')
				.addColumn('entitlements', 'text', (col) => col.notNull().defaultTo('[]'))
				.execute();
		}
	}

	// schedule_assignments.locked
	if (!(await columnExists(db, 'schedule_assignments', 'locked'))) {
		await db.schema
			.alterTable('schedule_assignments')
			.addColumn('locked', 'integer', (col) => col.notNull().defaultTo(0))
			.execute();
	}

	// schedule_assignments.source
	if (!(await columnExists(db, 'schedule_assignments', 'source'))) {
		await db.schema
			.alterTable('schedule_assignments')
			.addColumn('source', 'text', (col) => col.notNull().defaultTo('manual'))
			.execute();
	}
}

export async function down(): Promise<void> {
	// SQLite cannot easily drop columns; leave them in place on rollback.
	console.log('Note: entitlements/locked/source columns cannot be dropped in SQLite');
}
