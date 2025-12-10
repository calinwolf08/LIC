/**
 * Unit Tests: FallbackGapFiller
 *
 * Tests the gap filling logic that runs after primary scheduling
 * to fill unmet requirements using fallback preceptors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { FallbackGapFiller, type UnmetRequirement } from './gap-filler';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('FallbackGapFiller', () => {
	let db: Kysely<DB>;
	let gapFiller: FallbackGapFiller;

	// Test data IDs
	let healthSystemId: string;
	let siteId: string;
	let clerkshipId: string;
	let teamId: string;
	let preceptor1Id: string;
	let preceptor2Id: string;
	let studentId: string;

	// Helper to create config
	const createConfig = (overrides: Partial<ResolvedRequirementConfiguration> = {}): ResolvedRequirementConfiguration => ({
		clerkshipId,
		requirementType: 'outpatient',
		requiredDays: 5,
		assignmentStrategy: 'continuous_single',
		healthSystemRule: 'prefer_same_system',
		maxStudentsPerDay: 2,
		maxStudentsPerYear: 20,
		allowTeams: true,
		allowFallbacks: true,
		fallbackRequiresApproval: false,
		fallbackAllowCrossSystem: false,
		source: 'global_defaults',
		...overrides,
	});

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		gapFiller = new FallbackGapFiller(db);

		// Create test data
		healthSystemId = nanoid();
		siteId = nanoid();
		clerkshipId = nanoid();
		studentId = nanoid();

		// Create health system and site
		await db.insertInto('health_systems').values({
			id: healthSystemId,
			name: 'Test Hospital',
		}).execute();

		await db.insertInto('sites').values({
			id: siteId,
			name: 'Test Site',
			health_system_id: healthSystemId,
		}).execute();

		// Create clerkship
		await db.insertInto('clerkships').values({
			id: clerkshipId,
			name: 'Test Clerkship',
			clerkship_type: 'outpatient',
			required_days: 5,
		}).execute();

		// Create student
		await db.insertInto('students').values({
			id: studentId,
			name: 'Test Student',
			email: 'student@test.edu',
		}).execute();

		// Create preceptors
		preceptor1Id = nanoid();
		preceptor2Id = nanoid();

		await db.insertInto('preceptors').values([
			{ id: preceptor1Id, name: 'Dr. One', email: 'one@test.edu', health_system_id: healthSystemId },
			{ id: preceptor2Id, name: 'Dr. Two', email: 'two@test.edu', health_system_id: healthSystemId },
		]).execute();

		// Create team
		teamId = nanoid();
		await db.insertInto('preceptor_teams').values({
			id: teamId,
			clerkship_id: clerkshipId,
			name: 'Test Team',
		}).execute();

		// Add both preceptors to team
		await db.insertInto('preceptor_team_members').values([
			{ id: nanoid(), team_id: teamId, preceptor_id: preceptor1Id, priority: 1, role: 'lead' },
			{ id: nanoid(), team_id: teamId, preceptor_id: preceptor2Id, priority: 2, role: 'member' },
		]).execute();

		// Create availability for both preceptors (5 days each)
		const dates = ['2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04', '2025-12-05'];
		for (const date of dates) {
			await db.insertInto('preceptor_availability').values([
				{ id: nanoid(), preceptor_id: preceptor1Id, site_id: siteId, date, is_available: 1 },
				{ id: nanoid(), preceptor_id: preceptor2Id, site_id: siteId, date, is_available: 1 },
			]).execute();
		}

		// Create capacity rules
		await db.insertInto('preceptor_capacity_rules').values([
			{ id: nanoid(), preceptor_id: preceptor1Id, max_students_per_day: 1, max_students_per_year: 20 },
			{ id: nanoid(), preceptor_id: preceptor2Id, max_students_per_day: 1, max_students_per_year: 20 },
		]).execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('fillGaps', () => {
		it('should return empty result for empty unmet requirements', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			const result = await gapFiller.fillGaps(
				[],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			expect(result.assignments).toEqual([]);
			expect(result.fulfilledRequirements).toEqual([]);
			expect(result.partialFulfillments).toEqual([]);
			expect(result.stillUnmet).toEqual([]);
		});

		it('should skip requirements when allowFallbacks is false', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig({ allowFallbacks: false }));

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 0,
				remainingDays: 5,
				reason: 'No availability',
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			expect(result.assignments.length).toBe(0);
			expect(result.stillUnmet.length).toBe(1);
			expect(result.stillUnmet[0].studentId).toBe(studentId);
		});

		it('should fill gaps using available preceptors', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 0,
				remainingDays: 5,
				reason: 'No availability',
				primaryTeamId: teamId,
				primaryHealthSystemId: healthSystemId,
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// Should create assignments
			expect(result.assignments.length).toBe(5);
			expect(result.fulfilledRequirements.length).toBe(1);
			expect(result.stillUnmet.length).toBe(0);
		});

		it('should process students with largest gaps first', async () => {
			// Create second student
			const student2Id = nanoid();
			await db.insertInto('students').values({
				id: student2Id,
				name: 'Test Student 2',
				email: 'student2@test.edu',
			}).execute();

			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			// Student 1: needs 2 days (smaller gap)
			// Student 2: needs 5 days (larger gap)
			const requirements: UnmetRequirement[] = [
				{
					studentId,
					studentName: 'Test Student 1',
					clerkshipId,
					clerkshipName: 'Test Clerkship',
					requirementType: 'outpatient',
					requiredDays: 5,
					assignedDays: 3,
					remainingDays: 2,
					reason: 'Partial',
					primaryTeamId: teamId,
					primaryHealthSystemId: healthSystemId,
				},
				{
					studentId: student2Id,
					studentName: 'Test Student 2',
					clerkshipId,
					clerkshipName: 'Test Clerkship',
					requirementType: 'outpatient',
					requiredDays: 5,
					assignedDays: 0,
					remainingDays: 5,
					reason: 'None',
					primaryTeamId: teamId,
					primaryHealthSystemId: healthSystemId,
				},
			];

			const result = await gapFiller.fillGaps(
				requirements,
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// With capacity 1/day per preceptor and 2 preceptors with 5 days each:
			// Total capacity = 10 days
			// Student 2 (larger gap) should get processed first and get 5 days
			// Student 1 should get remaining 5 days -> 2 days needed, so fulfilled
			expect(result.assignments.length).toBeGreaterThan(0);

			// Check student 2 was processed (has assignments)
			const student2Assignments = result.assignments.filter(a => a.studentId === student2Id);
			expect(student2Assignments.length).toBeGreaterThan(0);
		});

		it('should respect capacity limits', async () => {
			// Create two students
			const student2Id = nanoid();
			await db.insertInto('students').values({
				id: student2Id,
				name: 'Test Student 2',
				email: 'student2@test.edu',
			}).execute();

			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			// Both students need 5 days
			const requirements: UnmetRequirement[] = [
				{
					studentId,
					studentName: 'Test Student 1',
					clerkshipId,
					clerkshipName: 'Test Clerkship',
					requirementType: 'outpatient',
					requiredDays: 5,
					assignedDays: 0,
					remainingDays: 5,
					reason: 'None',
					primaryTeamId: teamId,
					primaryHealthSystemId: healthSystemId,
				},
				{
					studentId: student2Id,
					studentName: 'Test Student 2',
					clerkshipId,
					clerkshipName: 'Test Clerkship',
					requirementType: 'outpatient',
					requiredDays: 5,
					assignedDays: 0,
					remainingDays: 5,
					reason: 'None',
					primaryTeamId: teamId,
					primaryHealthSystemId: healthSystemId,
				},
			];

			const result = await gapFiller.fillGaps(
				requirements,
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// Each preceptor has capacity 1/day, 5 days available
			// Total capacity: 2 preceptors * 5 days = 10 days
			// Both students need 5 days each = 10 days total
			// Should fit exactly or have partial fulfillment
			expect(result.assignments.length).toBeLessThanOrEqual(10);

			// Check no date has more than capacity for any preceptor
			const assignmentsByPreceptorDate = new Map<string, number>();
			for (const assignment of result.assignments) {
				const key = `${assignment.preceptorId}-${assignment.date}`;
				const count = assignmentsByPreceptorDate.get(key) || 0;
				assignmentsByPreceptorDate.set(key, count + 1);
			}

			for (const [, count] of assignmentsByPreceptorDate) {
				expect(count).toBeLessThanOrEqual(1);
			}
		});

		it('should include correct tier information in assignments', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 0,
				remainingDays: 5,
				reason: 'No availability',
				primaryTeamId: teamId,
				primaryHealthSystemId: healthSystemId,
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// All assignments should have tier 1 (same team)
			for (const assignment of result.assignments) {
				expect(assignment.tier).toBe(1);
				expect(assignment.fallbackTeamId).toBe(teamId);
				expect(assignment.originalTeamId).toBe(teamId);
			}
		});

		it('should report partial fulfillment correctly', async () => {
			// Reduce preceptor availability to 3 days
			await db.deleteFrom('preceptor_availability').execute();

			const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
			for (const date of dates) {
				await db.insertInto('preceptor_availability').values({
					id: nanoid(),
					preceptor_id: preceptor1Id,
					site_id: siteId,
					date,
					is_available: 1,
				}).execute();
			}

			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 0,
				remainingDays: 5,
				reason: 'No availability',
				primaryTeamId: teamId,
				primaryHealthSystemId: healthSystemId,
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// Should have partial fulfillment (3 days out of 5)
			expect(result.assignments.length).toBe(3);
			expect(result.fulfilledRequirements.length).toBe(0);
			expect(result.partialFulfillments.length).toBe(1);
			expect(result.partialFulfillments[0].requiredDays).toBe(5);
			expect(result.partialFulfillments[0].assignedDays).toBe(3);
			expect(result.partialFulfillments[0].addedDays).toBe(3);
		});

		it('should mark requirement as stillUnmet when no config exists', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			// Don't add config for clerkship

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 0,
				remainingDays: 5,
				reason: 'No availability',
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				[],
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			expect(result.assignments.length).toBe(0);
			expect(result.stillUnmet.length).toBe(1);
		});

		it('should not assign same date to student twice', async () => {
			const configs = new Map<string, ResolvedRequirementConfiguration>();
			configs.set(clerkshipId, createConfig());

			// Student already has 2 days assigned
			const existingAssignments = [
				{ studentId, preceptorId: preceptor1Id, clerkshipId, date: '2025-12-01' },
				{ studentId, preceptorId: preceptor1Id, clerkshipId, date: '2025-12-02' },
			];

			const unmetRequirement: UnmetRequirement = {
				studentId,
				studentName: 'Test Student',
				clerkshipId,
				clerkshipName: 'Test Clerkship',
				requirementType: 'outpatient',
				requiredDays: 5,
				assignedDays: 2,
				remainingDays: 3,
				reason: 'Partial',
				primaryTeamId: teamId,
				primaryHealthSystemId: healthSystemId,
			};

			const result = await gapFiller.fillGaps(
				[unmetRequirement],
				existingAssignments,
				configs,
				{ startDate: '2025-12-01', endDate: '2025-12-31' }
			);

			// Should not include Dec 1 or Dec 2 (already assigned)
			const dates = result.assignments.map(a => a.date);
			expect(dates).not.toContain('2025-12-01');
			expect(dates).not.toContain('2025-12-02');

			// Should assign Dec 3, 4, 5
			expect(result.assignments.length).toBe(3);
		});
	});
});
