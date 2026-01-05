/**
 * Integration Suite 15: User Scenario Validation
 *
 * Replicates the exact user scenario to validate:
 * 1. No double-booking when max_students=1
 * 2. All available preceptor days are used
 * 3. Elective days are scheduled with correct elective_id
 * 4. Multiple teams are used (not just the first one)
 * 5. Regeneration modes work correctly
 *
 * Scenario:
 * - 3 students needing 20 days each
 * - Dr Dude: Mon-Wed-Fri (12 days), max 1 student/day
 * - Dr S: Block 1/5-1/16 weekdays (10 days), max 1 student/day
 * - 2 electives (5 + 8 = 13 days) requiring Dr S
 * - Total capacity: 22 student-days, need: 60 student-days
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createPreceptorAvailability,
	createTestPreceptor,
	createTestTeam,
	clearAllTestData,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import { nanoid } from 'nanoid';

describe('Integration Suite 15: User Scenario Validation', () => {
	let db: Kysely<DB>;
	let engine: ConfigurableSchedulingEngine;

	// Entity IDs
	let studentIds: string[];
	let clerkshipId: string;
	let drDudeId: string;
	let drSId: string;
	let drDudeTeamId: string;
	let drSTeamId: string;
	let elective1Id: string;
	let elective2Id: string;
	let groupHealthSiteId: string;
	let cityHospitalSiteId: string;

	// Date constants
	const SCHEDULE_START = '2026-01-01';
	const SCHEDULE_END = '2026-01-30';

	// Dr Dude's Mon-Wed-Fri availability (1/5 - 1/30, excluding weekends)
	const DR_DUDE_DATES = [
		'2026-01-05', '2026-01-07', '2026-01-09', // Week 1: Mon, Wed, Fri
		'2026-01-12', '2026-01-14', '2026-01-16', // Week 2: Mon, Wed, Fri
		'2026-01-19', '2026-01-21', '2026-01-23', // Week 3: Mon, Wed, Fri
		'2026-01-26', '2026-01-28', '2026-01-30', // Week 4: Mon, Wed, Fri
	];

	// Dr S's block availability (1/5 - 1/16, weekdays only)
	const DR_S_DATES = [
		'2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', // Week 1
		'2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', // Week 2
	];

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		engine = new ConfigurableSchedulingEngine(db);

		// Create health systems and sites
		const { healthSystemId: groupHealthId, siteIds: ghSites } = await createTestHealthSystem(
			db,
			'Group Health Seattle',
			1
		);
		groupHealthSiteId = ghSites[0];

		const { healthSystemId: cityHospitalId, siteIds: chSites } = await createTestHealthSystem(
			db,
			'City Hospital Kaiser',
			1
		);
		cityHospitalSiteId = chSites[0];

		// Create clerkship with 20 required days
		clerkshipId = await createTestClerkship(db, 'Internal Medicine', {
			clerkshipType: 'outpatient',
			requiredDays: 20,
		});

		// Create students
		studentIds = [];
		for (const name of ['Student A', 'Student B', 'Student C']) {
			const id = nanoid();
			await db.insertInto('students').values({
				id,
				name,
				email: `${name.toLowerCase().replace(' ', '')}@test.edu`,
			}).execute();
			studentIds.push(id);
		}

		// Create Dr Dude with max_students=1
		drDudeId = await createTestPreceptor(db, {
			name: 'Dr Dude',
			healthSystemId: groupHealthId,
			siteId: groupHealthSiteId,
			maxStudents: 1,
		});

		// Create Dr S with max_students=1
		drSId = await createTestPreceptor(db, {
			name: 'Dr S',
			healthSystemId: cityHospitalId,
			siteId: cityHospitalSiteId,
			maxStudents: 1,
		});

		// Create teams - one for each preceptor
		drDudeTeamId = await createTestTeam(db, clerkshipId, 'Dr Dude - Group Health Seattle', [drDudeId]);
		drSTeamId = await createTestTeam(db, clerkshipId, 'Dr S City Hosp Kaiser', [drSId]);

		// Create preceptor availability
		await createPreceptorAvailability(db, drDudeId, groupHealthSiteId, DR_DUDE_DATES);
		await createPreceptorAvailability(db, drSId, cityHospitalSiteId, DR_S_DATES);

		// Create electives with Dr S as the preceptor
		const now = new Date().toISOString();

		// Elective 1: 5 days, required
		elective1Id = nanoid();
		await db.insertInto('clerkship_electives').values({
			id: elective1Id,
			clerkship_id: clerkshipId,
			name: 'Test Elective',
			minimum_days: 5,
			is_required: 1,
			override_mode: 'inherit',
			created_at: now,
			updated_at: now,
		}).execute();

		await db.insertInto('elective_preceptors').values({
			id: nanoid(),
			elective_id: elective1Id,
			preceptor_id: drSId,
			created_at: now,
		}).execute();

		// Elective 2: 8 days, required
		elective2Id = nanoid();
		await db.insertInto('clerkship_electives').values({
			id: elective2Id,
			clerkship_id: clerkshipId,
			name: 'Test Elective 2',
			minimum_days: 8,
			is_required: 1,
			override_mode: 'inherit',
			created_at: now,
			updated_at: now,
		}).execute();

		await db.insertInto('elective_preceptors').values({
			id: nanoid(),
			elective_id: elective2Id,
			preceptor_id: drSId,
			created_at: now,
		}).execute();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	/**
	 * Helper to get all assignments from DB
	 */
	async function getAllAssignments() {
		return db
			.selectFrom('schedule_assignments')
			.selectAll()
			.orderBy('date', 'asc')
			.execute();
	}

	/**
	 * Helper to count assignments per preceptor per date (for double-booking check)
	 */
	function countAssignmentsPerPreceptorDate(
		assignments: Array<{ preceptor_id: string; date: string }>
	): Map<string, number> {
		const counts = new Map<string, number>();
		for (const a of assignments) {
			const key = `${a.preceptor_id}-${a.date}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	}

	describe('Initial Schedule Generation', () => {
		it('should not double-book preceptors when max_students=1', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify no double-booking
			const assignments = await getAllAssignments();
			const counts = countAssignmentsPerPreceptorDate(assignments);

			for (const [key, count] of counts) {
				expect(count, `Double-booking detected: ${key} has ${count} students`).toBe(1);
			}
		});

		it('should use all available Dr Dude days for non-elective scheduling', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const assignments = await getAllAssignments();

			// Count Dr Dude assignments
			const drDudeAssignments = assignments.filter(a => a.preceptor_id === drDudeId);

			// Dr Dude should have assignments on all 12 available days
			// (since we have 3 students and only 1 slot per day, all 12 days should be used)
			expect(drDudeAssignments.length).toBe(12);

			// Verify each of Dr Dude's available dates is used
			const usedDates = new Set(drDudeAssignments.map(a => a.date));
			for (const date of DR_DUDE_DATES) {
				expect(usedDates.has(date), `Dr Dude should be assigned on ${date}`).toBe(true);
			}
		});

		it('should use all available Dr S days for elective scheduling', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const assignments = await getAllAssignments();

			// Count Dr S assignments
			const drSAssignments = assignments.filter(a => a.preceptor_id === drSId);

			// Dr S should have assignments on all 10 available days
			expect(drSAssignments.length).toBe(10);

			// Verify each of Dr S's available dates is used
			const usedDates = new Set(drSAssignments.map(a => a.date));
			for (const date of DR_S_DATES) {
				expect(usedDates.has(date), `Dr S should be assigned on ${date}`).toBe(true);
			}
		});

		it('should set elective_id on elective assignments', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const assignments = await getAllAssignments();

			// Dr S assignments should have elective_id set (since Dr S is only for electives)
			const drSAssignments = assignments.filter(a => a.preceptor_id === drSId);

			// All Dr S assignments should have an elective_id
			const electiveAssignments = drSAssignments.filter(a => a.elective_id !== null);
			expect(electiveAssignments.length).toBe(drSAssignments.length);

			// Elective IDs should be one of the two electives we created
			const validElectiveIds = new Set([elective1Id, elective2Id]);
			for (const a of electiveAssignments) {
				expect(validElectiveIds.has(a.elective_id!), `Invalid elective_id: ${a.elective_id}`).toBe(true);
			}
		});

		it('should use both preceptor teams (not just the first one)', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const assignments = await getAllAssignments();

			// Both preceptors should have assignments
			const drDudeAssignments = assignments.filter(a => a.preceptor_id === drDudeId);
			const drSAssignments = assignments.filter(a => a.preceptor_id === drSId);

			expect(drDudeAssignments.length, 'Dr Dude should have assignments').toBeGreaterThan(0);
			expect(drSAssignments.length, 'Dr S should have assignments').toBeGreaterThan(0);
		});

		it('should report unmet requirements when capacity is exhausted', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			// Total capacity: 22 student-days (12 Dr Dude + 10 Dr S)
			// Total need: 60 student-days (3 students × 20 days)
			// Expected unmet: ~38 student-days

			// Should have some unmet requirements
			expect(result.unmetRequirements.length).toBeGreaterThan(0);

			// Total assigned should be 22 (all available capacity used)
			expect(result.assignments.length).toBe(22);
		});

		it('should prefer completing electives over partial assignments', async () => {
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const assignments = await getAllAssignments();

			// Check elective assignment distribution
			const electiveAssignments = assignments.filter(a => a.elective_id !== null);

			// Group by student and elective
			const studentElectiveDays = new Map<string, Map<string, number>>();
			for (const a of electiveAssignments) {
				if (!studentElectiveDays.has(a.student_id)) {
					studentElectiveDays.set(a.student_id, new Map());
				}
				const electiveMap = studentElectiveDays.get(a.student_id)!;
				const current = electiveMap.get(a.elective_id!) ?? 0;
				electiveMap.set(a.elective_id!, current + 1);
			}

			// Verify we have some complete electives (5 days for elective1)
			let completedElective1Count = 0;
			for (const [_studentId, electiveMap] of studentElectiveDays) {
				const elective1Days = electiveMap.get(elective1Id) ?? 0;
				if (elective1Days >= 5) {
					completedElective1Count++;
				}
			}

			// With 10 available days and 5-day elective, should complete at least 1-2 electives
			expect(completedElective1Count, 'Should have at least one completed 5-day elective').toBeGreaterThanOrEqual(1);
		});
	});

	describe('Full Regeneration Mode', () => {
		it('should clear existing assignments and regenerate from scratch', async () => {
			// First generation
			await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const firstGenAssignments = await getAllAssignments();
			expect(firstGenAssignments.length).toBe(22);

			// Clear and regenerate (simulating full regeneration mode)
			await db.deleteFrom('schedule_assignments').execute();

			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const secondGenAssignments = await getAllAssignments();

			// Should have same total (all capacity used)
			expect(secondGenAssignments.length).toBe(22);

			// No double-booking
			const counts = countAssignmentsPerPreceptorDate(secondGenAssignments);
			for (const [key, count] of counts) {
				expect(count).toBe(1);
			}
		});
	});

	describe('Smart Regeneration Mode (Preserve Past)', () => {
		it('should preserve assignments before cutoff and regenerate future', async () => {
			// First generation
			await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const firstGenAssignments = await getAllAssignments();

			// Cutoff: 2026-01-15 (mid-schedule)
			const cutoffDate = '2026-01-15';

			// Preserve assignments before cutoff
			const pastAssignments = firstGenAssignments.filter(a => a.date < cutoffDate);
			const futureAssignmentIds = firstGenAssignments
				.filter(a => a.date >= cutoffDate)
				.map(a => a.id);

			// Delete future assignments
			if (futureAssignmentIds.length > 0) {
				await db
					.deleteFrom('schedule_assignments')
					.where('id', 'in', futureAssignmentIds)
					.execute();
			}

			// Regenerate (engine will see past assignments and schedule around them)
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: cutoffDate,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const finalAssignments = await getAllAssignments();

			// Past assignments should still exist
			for (const past of pastAssignments) {
				const found = finalAssignments.find(a => a.id === past.id);
				expect(found, `Past assignment ${past.id} should be preserved`).toBeDefined();
			}

			// No double-booking in final state
			const counts = countAssignmentsPerPreceptorDate(finalAssignments);
			for (const [key, count] of counts) {
				expect(count).toBe(1);
			}
		});
	});

	describe('Completion Mode (Fill Gaps Only)', () => {
		it('should preserve all existing assignments and fill remaining capacity', async () => {
			// First generation - schedule 1 student initially
			await engine.schedule([studentIds[0]], [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const initialAssignments = await getAllAssignments();
			const initialCount = initialAssignments.length;
			const initialIds = new Set(initialAssignments.map(a => a.id));

			// Verify first student got some assignments
			expect(initialCount).toBeGreaterThan(0);

			// Now run completion mode for remaining students
			// The engine loads existing DB assignments and respects capacity
			await engine.schedule(studentIds.slice(1), [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const finalAssignments = await getAllAssignments();

			// Original assignments should still exist (not deleted/replaced)
			for (const initial of initialAssignments) {
				const found = finalAssignments.find(a => a.id === initial.id);
				expect(found, `Initial assignment ${initial.id} should be preserved`).toBeDefined();
			}

			// No double-booking across all assignments
			const counts = countAssignmentsPerPreceptorDate(finalAssignments);
			for (const [key, count] of counts) {
				expect(count, `Double-booking at ${key}`).toBe(1);
			}

			// Both preceptors should have assignments
			const drDudeCount = finalAssignments.filter(a => a.preceptor_id === drDudeId).length;
			const drSCount = finalAssignments.filter(a => a.preceptor_id === drSId).length;
			expect(drDudeCount, 'Dr Dude should have assignments').toBeGreaterThan(0);
			expect(drSCount, 'Dr S should have assignments').toBeGreaterThan(0);
		});

		it('should correctly track remaining capacity after existing assignments', async () => {
			// Schedule first student
			await engine.schedule([studentIds[0]], [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const afterFirstStudent = await getAllAssignments();

			// Dr Dude and Dr S should each have some assignments
			const drDudeUsedDays = new Set(
				afterFirstStudent
					.filter(a => a.preceptor_id === drDudeId)
					.map(a => a.date)
			);
			const drSUsedDays = new Set(
				afterFirstStudent
					.filter(a => a.preceptor_id === drSId)
					.map(a => a.date)
			);

			// Schedule second student
			await engine.schedule([studentIds[1]], [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			const afterSecondStudent = await getAllAssignments();

			// Verify no double-booking occurred
			const counts = countAssignmentsPerPreceptorDate(afterSecondStudent);
			for (const [key, count] of counts) {
				expect(count, `Double-booking at ${key}`).toBe(1);
			}

			// Second student should use different dates than first student
			const secondStudentAssignments = afterSecondStudent.filter(
				a => a.student_id === studentIds[1]
			);

			for (const a of secondStudentAssignments) {
				if (a.preceptor_id === drDudeId) {
					expect(drDudeUsedDays.has(a.date), `Dr Dude already used on ${a.date}`).toBe(false);
				}
				if (a.preceptor_id === drSId) {
					expect(drSUsedDays.has(a.date), `Dr S already used on ${a.date}`).toBe(false);
				}
			}
		});
	});

	describe('Edge Cases', () => {
		it('should handle scenario where elective days exceed preceptor availability', async () => {
			// Dr S has 10 days, electives need 13 days per student
			// This should result in partial elective completion

			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			// Should have unmet elective requirements
			const electiveUnmet = result.unmetRequirements.filter(
				ur => ur.clerkshipName?.includes('Elective')
			);

			// Since total elective need (13 days × 3 students = 39 days) > Dr S capacity (10 days),
			// there should be unmet elective requirements
			expect(electiveUnmet.length).toBeGreaterThan(0);
		});

		it('should correctly calculate non-elective days (total - elective days)', async () => {
			// Clerkship has 20 required days
			// Electives need 5 + 8 = 13 days
			// Non-elective days = 20 - 13 = 7 days

			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: SCHEDULE_START,
				endDate: SCHEDULE_END,
				dryRun: false,
			});

			// Check result metadata or unmet requirements to verify correct calculation
			// The engine should track 7 non-elective days per student
			const assignments = await getAllAssignments();

			// Dr Dude only handles non-elective days
			// With 12 available days and 1 student/day, can serve 12 student-days
			// 3 students × 7 days = 21 non-elective student-days needed
			// So should use all 12 Dr Dude days
			const drDudeAssignments = assignments.filter(a => a.preceptor_id === drDudeId);
			expect(drDudeAssignments.length).toBe(12);

			// All Dr Dude assignments should have null elective_id (non-elective)
			for (const a of drDudeAssignments) {
				expect(a.elective_id).toBeNull();
			}
		});
	});
});
