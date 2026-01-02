/**
 * Integration Suite 12: Elective Scheduling
 *
 * Tests that electives are properly scheduled with their associated
 * preceptors and sites, respecting minimum days and required status.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestStudents,
	createPreceptorAvailability,
	createTestPreceptor,
	createTestTeam,
	clearAllTestData,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import { nanoid } from 'nanoid';

describe('Integration Suite 12: Elective Scheduling', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	/**
	 * Helper to create an elective with associations
	 *
	 * NOTE: In the new model, electives link directly to clerkships via clerkship_id
	 * The requirementId parameter is actually the clerkshipId for backward compatibility
	 */
	async function createElective(
		clerkshipId: string,
		options: {
			name: string;
			minimumDays: number;
			isRequired?: boolean;
			siteIds?: string[];
			preceptorIds?: string[];
		}
	): Promise<string> {
		const electiveId = nanoid();
		const now = new Date().toISOString();

		await db
			.insertInto('clerkship_electives')
			.values({
				id: electiveId,
				clerkship_id: clerkshipId,
				name: options.name,
				minimum_days: options.minimumDays,
				is_required: options.isRequired !== false ? 1 : 0,
				override_mode: 'inherit',
				created_at: now,
				updated_at: now,
			})
			.execute();

		// Add site associations
		if (options.siteIds && options.siteIds.length > 0) {
			await db
				.insertInto('elective_sites')
				.values(
					options.siteIds.map((siteId) => ({
						id: nanoid(),
						elective_id: electiveId,
						site_id: siteId,
						created_at: now,
					}))
				)
				.execute();
		}

		// Add preceptor associations
		if (options.preceptorIds && options.preceptorIds.length > 0) {
			await db
				.insertInto('elective_preceptors')
				.values(
					options.preceptorIds.map((preceptorId) => ({
						id: nanoid(),
						elective_id: electiveId,
						preceptor_id: preceptorId,
						created_at: now,
					}))
				)
				.execute();
		}

		return electiveId;
	}

	describe('Test 1: Elective database structure', () => {
		it('should create electives with proper is_required flag', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			// Create required and optional electives (now linked directly to clerkship)
			const requiredElectiveId = await createElective(clerkshipId, {
				name: 'Required Cardiology',
				minimumDays: 5,
				isRequired: true,
			});

			const optionalElectiveId = await createElective(clerkshipId, {
				name: 'Optional Neurology',
				minimumDays: 3,
				isRequired: false,
			});

			// Verify electives were created
			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.execute();

			expect(electives).toHaveLength(2);

			const required = electives.find((e) => e.id === requiredElectiveId);
			const optional = electives.find((e) => e.id === optionalElectiveId);

			expect(required?.is_required).toBe(1);
			expect(optional?.is_required).toBe(0);
		});
	});

	describe('Test 2: Elective site associations', () => {
		it('should properly store elective-site associations', async () => {
			const { healthSystemId, siteIds: [siteId, site2Id] } = await createTestHealthSystem(db, 'Hospital', 2);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			const electiveId = await createElective(clerkshipId, {
				name: 'Multi-Site Elective',
				minimumDays: 5,
				siteIds: [siteId, site2Id],
			});

			const associations = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();

			expect(associations).toHaveLength(2);
			expect(associations.map((a) => a.site_id).sort()).toEqual([siteId, site2Id].sort());
		});
	});

	describe('Test 3: Elective preceptor associations', () => {
		it('should properly store elective-preceptor associations', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			const preceptor1Id = await createTestPreceptor(db, {
				name: 'Dr. Cardio',
				healthSystemId,
				siteId,
			});

			const preceptor2Id = await createTestPreceptor(db, {
				name: 'Dr. Neuro',
				healthSystemId,
				siteId,
			});

			const electiveId = await createElective(clerkshipId, {
				name: 'Multi-Preceptor Elective',
				minimumDays: 5,
				preceptorIds: [preceptor1Id, preceptor2Id],
			});

			const associations = await db
				.selectFrom('elective_preceptors')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();

			expect(associations).toHaveLength(2);
			expect(associations.map((a) => a.preceptor_id).sort()).toEqual([preceptor1Id, preceptor2Id].sort());
		});
	});

	describe('Test 4: Cascade delete of elective associations', () => {
		it('should cascade delete sites and preceptors when elective is deleted', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			const electiveId = await createElective(clerkshipId, {
				name: 'To Be Deleted',
				minimumDays: 5,
				siteIds: [siteId],
				preceptorIds: [preceptorId],
			});

			// Verify associations exist
			const sitesBefore = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();
			expect(sitesBefore).toHaveLength(1);

			const preceptorsBefore = await db
				.selectFrom('elective_preceptors')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();
			expect(preceptorsBefore).toHaveLength(1);

			// Delete elective
			await db.deleteFrom('clerkship_electives').where('id', '=', electiveId).execute();

			// Verify cascade delete
			const sitesAfter = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();
			expect(sitesAfter).toHaveLength(0);

			const preceptorsAfter = await db
				.selectFrom('elective_preceptors')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();
			expect(preceptorsAfter).toHaveLength(0);
		});
	});

	describe('Test 5: Schedule assignments table has elective_id column', () => {
		it('should have elective_id column in schedule_assignments table', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 5,
			});

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			// Link preceptor to clerkship via team
			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);

			// Check that assignments table has elective_id column
			const assignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('student_id', '=', studentIds[0])
				.execute();

			if (assignments.length > 0) {
				// Column should exist (will be null for non-elective assignments)
				expect('elective_id' in assignments[0]).toBe(true);
			}
		});
	});

	describe('Test 6: Basic scheduling with elective defined', () => {
		it('should schedule student even when electives exist', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			// Clerkship with 8 total days: 5 non-elective + 3 elective
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 8,
			});

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. General',
				healthSystemId,
				siteId,
			});

			// Create elective (3 days); remaining 5 days are non-elective
			await createElective(clerkshipId, {
				name: 'Cardiology Elective',
				minimumDays: 3,
				preceptorIds: [preceptorId],
				siteIds: [siteId],
			});

			// Link preceptor to clerkship via team
			await createTestTeam(db, clerkshipId, 'General Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);
			const dates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			// Scheduling should work: 5 non-elective days + 3 elective days = 8 total
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(8);
		});
	});

	describe('Test 7: Multiple electives for same clerkship', () => {
		it('should support multiple electives for a clerkship', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			// Create multiple electives (linked directly to clerkship)
			await createElective(clerkshipId, {
				name: 'Cardiology',
				minimumDays: 3,
				isRequired: true,
			});

			await createElective(clerkshipId, {
				name: 'Neurology',
				minimumDays: 3,
				isRequired: true,
			});

			await createElective(clerkshipId, {
				name: 'Dermatology',
				minimumDays: 2,
				isRequired: false, // Optional
			});

			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.execute();

			expect(electives).toHaveLength(3);

			const requiredCount = electives.filter((e) => e.is_required === 1).length;
			const optionalCount = electives.filter((e) => e.is_required === 0).length;

			expect(requiredCount).toBe(2);
			expect(optionalCount).toBe(1);
		});
	});

	describe('Test 8: Elective minimum days validation', () => {
		it('should store minimum days correctly', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			await createElective(clerkshipId, {
				name: 'Short Elective',
				minimumDays: 3,
			});

			await createElective(clerkshipId, {
				name: 'Long Elective',
				minimumDays: 10,
			});

			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.orderBy('minimum_days', 'asc')
				.execute();

			expect(electives[0].minimum_days).toBe(3);
			expect(electives[1].minimum_days).toBe(10);
		});
	});

	describe('Test 9: Elective with specialty', () => {
		it('should store specialty field correctly', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 20,
			});

			const electiveId = nanoid();
			await db
				.insertInto('clerkship_electives')
				.values({
					id: electiveId,
					clerkship_id: clerkshipId,
					name: 'Cardiology Subspecialty',
					minimum_days: 5,
					specialty: 'Cardiology',
					is_required: 1,
					override_mode: 'inherit',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			const elective = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('id', '=', electiveId)
				.executeTakeFirst();

			expect(elective?.specialty).toBe('Cardiology');
		});
	});

	describe('Test 10: E2E Schedule Generation with Required Elective', () => {
		it('should generate schedule assignments for required elective', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			// Clerkship with 5 total days, all elective
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 5,
			});

			// Create preceptors
			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Cardiology',
				healthSystemId,
				siteId,
			});

			// Create required elective (linked directly to clerkship)
			const electiveId = await createElective(clerkshipId, {
				name: 'Cardiology Required',
				minimumDays: 5,
				isRequired: true,
				siteIds: [siteId],
				preceptorIds: [preceptorId],
			});

			// Create students and availability
			const studentIds = await createTestStudents(db, 2);
			const dates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Generate schedule
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			// Verify schedule succeeded
			expect(result.success).toBe(true);

			// Verify assignments were created with elective_id
			const assignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('elective_id', '=', electiveId)
				.execute();

			expect(assignments.length).toBeGreaterThan(0);

			// Verify each student got at least the minimum days
			for (const studentId of studentIds) {
				const studentAssignments = assignments.filter((a) => a.student_id === studentId);
				expect(studentAssignments.length).toBeGreaterThanOrEqual(5);
			}

			// Verify assignments use the associated site and preceptor
			for (const assignment of assignments) {
				expect(assignment.site_id).toBe(siteId);
				expect(assignment.preceptor_id).toBe(preceptorId);
			}
		});
	});

	describe('Test 11: E2E Multiple electives for same clerkship', () => {
		it('should distribute students across multiple required electives', async () => {
			const { healthSystemId, siteIds: [site1Id, site2Id] } = await createTestHealthSystem(
				db,
				'Hospital',
				2
			);
			// Clerkship with 10 total days, all elective (5 + 5)
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', {
				requiredDays: 10,
			});

			// Create preceptors
			const preceptor1Id = await createTestPreceptor(db, {
				name: 'Dr. Cardiology',
				healthSystemId,
				siteId: site1Id,
			});

			const preceptor2Id = await createTestPreceptor(db, {
				name: 'Dr. Neurology',
				healthSystemId,
				siteId: site2Id,
			});

			// Create two required electives (linked directly to clerkship)
			const cardioId = await createElective(clerkshipId, {
				name: 'Cardiology',
				minimumDays: 5,
				isRequired: true,
				siteIds: [site1Id],
				preceptorIds: [preceptor1Id],
			});

			const neuroId = await createElective(clerkshipId, {
				name: 'Neurology',
				minimumDays: 5,
				isRequired: true,
				siteIds: [site2Id],
				preceptorIds: [preceptor2Id],
			});

			// Create students and availability
			const studentIds = await createTestStudents(db, 2);
			const dates = generateDateRange('2025-12-01', 20);
			await createPreceptorAvailability(db, preceptor1Id, site1Id, dates);
			await createPreceptorAvailability(db, preceptor2Id, site2Id, dates);

			// Generate schedule
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);

			// Verify assignments exist for both electives
			const cardioAssignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('elective_id', '=', cardioId)
				.execute();

			const neuroAssignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('elective_id', '=', neuroId)
				.execute();

			// Both electives should have assignments
			expect(cardioAssignments.length).toBeGreaterThan(0);
			expect(neuroAssignments.length).toBeGreaterThan(0);

			// Each student should complete both required electives
			for (const studentId of studentIds) {
				const cardioForStudent = cardioAssignments.filter((a) => a.student_id === studentId);
				const neuroForStudent = neuroAssignments.filter((a) => a.student_id === studentId);

				expect(cardioForStudent.length).toBeGreaterThanOrEqual(5);
				expect(neuroForStudent.length).toBeGreaterThanOrEqual(5);
			}
		});
	});
});
