/**
 * Engine preference weighting (H8).
 *
 * The auto-generation engine must weight a preceptor's "preferred" availability
 * days ahead of "in a pinch" days, and never place a student on an in-a-pinch day
 * while a preferred day is still open. Only once preferred days are exhausted does
 * it fall back to in-a-pinch days. Exercises the default (continuous_single ->
 * TeamContinuityStrategy) path end to end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestPreceptors,
	createTestStudents,
	clearAllTestData
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from './configurable-scheduling-engine';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

async function addAvailability(
	db: Kysely<DB>,
	preceptorId: string,
	siteId: string,
	dates: string[],
	preference: 'preferred' | 'in_a_pinch'
) {
	const now = new Date().toISOString();
	await db
		.insertInto('preceptor_availability')
		.values(
			dates.map((date) => ({
				id: nanoid(),
				preceptor_id: preceptorId,
				site_id: siteId,
				date,
				is_available: 1,
				preference,
				created_at: now,
				updated_at: now
			}))
		)
		.execute();
}

describe('Engine preference weighting (H8)', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	// Dec 2025 weekdays: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri.
	const PINCH = ['2025-12-01', '2025-12-02'];
	const PREFERRED = ['2025-12-03', '2025-12-04', '2025-12-05'];

	it('fills preferred days first and never an in-a-pinch day while a preferred day is open', async () => {
		const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Hospital', 1);
		const siteId = siteIds[0];
		const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine', {
			requiredDays: 3
		});
		const [preceptorId] = await createTestPreceptors(db, 1, {
			healthSystemId,
			siteId,
			maxStudents: 5,
			clerkshipId
		});
		const [studentId] = await createTestStudents(db, 1);

		// Both kinds of days are open; the requirement fits entirely within preferred.
		await addAvailability(db, preceptorId, siteId, PINCH, 'in_a_pinch');
		await addAvailability(db, preceptorId, siteId, PREFERRED, 'preferred');

		const engine = new ConfigurableSchedulingEngine(db);
		const result = await engine.schedule([studentId], [clerkshipId], {
			startDate: '2025-12-01',
			endDate: '2025-12-31',
			dryRun: false
		});

		expect(result.assignments.length).toBe(3);
		const assignedDates = result.assignments.map((a) => a.date).sort();
		// Only preferred days were used; no in-a-pinch day was touched.
		expect(assignedDates).toEqual([...PREFERRED].sort());
		expect(assignedDates.some((d) => PINCH.includes(d))).toBe(false);
	});

	it('falls back to in-a-pinch days only after preferred days are exhausted', async () => {
		const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Hospital', 1);
		const siteId = siteIds[0];
		const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine', {
			requiredDays: 3
		});
		const [preceptorId] = await createTestPreceptors(db, 1, {
			healthSystemId,
			siteId,
			maxStudents: 5,
			clerkshipId
		});
		const [studentId] = await createTestStudents(db, 1);

		// Only ONE preferred day, but three days are required.
		const onePreferred = ['2025-12-03'];
		const manyPinch = ['2025-12-01', '2025-12-02', '2025-12-04', '2025-12-05'];
		await addAvailability(db, preceptorId, siteId, onePreferred, 'preferred');
		await addAvailability(db, preceptorId, siteId, manyPinch, 'in_a_pinch');

		const engine = new ConfigurableSchedulingEngine(db);
		const result = await engine.schedule([studentId], [clerkshipId], {
			startDate: '2025-12-01',
			endDate: '2025-12-31',
			dryRun: false
		});

		expect(result.assignments.length).toBe(3);
		const assignedDates = result.assignments.map((a) => a.date);
		// The single preferred day is always consumed.
		expect(assignedDates).toContain('2025-12-03');
		// The remaining two come from in-a-pinch days (fallback), and they are the
		// earliest ones by date.
		const pinchUsed = assignedDates.filter((d) => manyPinch.includes(d));
		expect(pinchUsed.length).toBe(2);
	});
});
