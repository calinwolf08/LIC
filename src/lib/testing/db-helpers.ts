// @ts-nocheck
/**
 * Database Test Helpers
 *
 * Utilities for creating and managing test databases
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, Students, Preceptors, Clerkships } from '$lib/db/types';
import { migrateToLatest } from '$lib/db';

export type SeedData = {
	students: Students[];
	preceptors: Preceptors[];
	clerkships: Clerkships[];
};

/**
 * Creates an in-memory test database with migrations applied
 */
export function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite
		})
	});

	return db;
}

/**
 * Initializes test database with migrations
 */
export async function initTestDb(db: Kysely<DB>): Promise<void> {
	await migrateToLatest(db);
}

/**
 * Resets the test database by deleting all data
 */
export async function resetTestDb(db: Kysely<DB>): Promise<void> {
	// Delete in correct order to handle foreign keys
	await db.deleteFrom('schedule_assignments').execute();
	await db.deleteFrom('preceptor_availability').execute();
	await db.deleteFrom('blackout_dates').execute();
	await db.deleteFrom('students').execute();
	await db.deleteFrom('preceptors').execute();
	await db.deleteFrom('clerkships').execute();
}

/**
 * Closes the database connection
 */
export async function closeTestDb(db: Kysely<DB>): Promise<void> {
	await db.destroy();
}

/**
 * Seeds the test database with fixture data
 */
export async function seedTestDb(db: Kysely<DB>, data?: Partial<SeedData>): Promise<SeedData> {
	const { createMockStudent, createMockPreceptor, createMockClerkship } = await import(
		'./fixtures'
	);

	// Use provided data or generate defaults
	const students = data?.students || [createMockStudent(), createMockStudent({ email: 'student2@example.com' })];

	const preceptors = data?.preceptors || [createMockPreceptor(), createMockPreceptor({ email: 'preceptor2@example.com' })];

	const clerkships = data?.clerkships || [createMockClerkship(), createMockClerkship({ name: 'Pediatrics' })];

	// Insert data
	const insertedStudents = await Promise.all(
		students.map((student) => db.insertInto('students').values(student).returningAll().executeTakeFirstOrThrow())
	);

	const insertedPreceptors = await Promise.all(
		preceptors.map((preceptor) =>
			db.insertInto('preceptors').values(preceptor).returningAll().executeTakeFirstOrThrow()
		)
	);

	const insertedClerkships = await Promise.all(
		clerkships.map((clerkship) =>
			db.insertInto('clerkships').values(clerkship).returningAll().executeTakeFirstOrThrow()
		)
	);

	return {
		students: insertedStudents,
		preceptors: insertedPreceptors,
		clerkships: insertedClerkships
	};
}
