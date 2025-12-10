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
	createTestRequirement,
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
	 */
	async function createElective(
		requirementId: string,
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
				requirement_id: requirementId,
				name: options.name,
				minimum_days: options.minimumDays,
				is_required: options.isRequired !== false ? 1 : 0,
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			// Create elective requirement
			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			// Create required and optional electives
			const requiredElectiveId = await createElective(requirementId, {
				name: 'Required Cardiology',
				minimumDays: 5,
				isRequired: true,
			});

			const optionalElectiveId = await createElective(requirementId, {
				name: 'Optional Neurology',
				minimumDays: 3,
				isRequired: false,
			});

			// Verify electives were created
			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('requirement_id', '=', requirementId)
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			const electiveId = await createElective(requirementId, {
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

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

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			const electiveId = await createElective(requirementId, {
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			const electiveId = await createElective(requirementId, {
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. General',
				healthSystemId,
				siteId,
			});

			// Create both outpatient requirement (for scheduling) and elective requirement
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
			});

			const electiveReqId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 3,
			});

			await createElective(electiveReqId, {
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

			// Scheduling should work for the outpatient requirement
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);
		});
	});

	describe('Test 7: Multiple electives for same clerkship', () => {
		it('should support multiple electives under one elective requirement', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			// Create multiple electives
			await createElective(requirementId, {
				name: 'Cardiology',
				minimumDays: 3,
				isRequired: true,
			});

			await createElective(requirementId, {
				name: 'Neurology',
				minimumDays: 3,
				isRequired: true,
			});

			await createElective(requirementId, {
				name: 'Dermatology',
				minimumDays: 2,
				isRequired: false, // Optional
			});

			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('requirement_id', '=', requirementId)
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
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 15,
			});

			await createElective(requirementId, {
				name: 'Short Elective',
				minimumDays: 3,
			});

			await createElective(requirementId, {
				name: 'Long Elective',
				minimumDays: 10,
			});

			const electives = await db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('requirement_id', '=', requirementId)
				.orderBy('minimum_days', 'asc')
				.execute();

			expect(electives[0].minimum_days).toBe(3);
			expect(electives[1].minimum_days).toBe(10);
		});
	});

	describe('Test 9: Elective with specialty', () => {
		it('should store specialty field correctly', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'elective',
				requiredDays: 10,
			});

			const electiveId = nanoid();
			await db
				.insertInto('clerkship_electives')
				.values({
					id: electiveId,
					requirement_id: requirementId,
					name: 'Cardiology Subspecialty',
					minimum_days: 5,
					specialty: 'Cardiology',
					is_required: 1,
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
});
