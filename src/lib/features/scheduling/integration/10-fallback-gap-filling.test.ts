/**
 * Integration Test Suite 10: Fallback Gap Filling
 *
 * Tests the fallback gap filling system that runs after primary scheduling.
 *
 * Note: The primary scheduling uses TeamContinuityStrategy which already finds
 * preceptors across the team. Fallback gap filling runs AFTER primary scheduling
 * when the team's combined availability is insufficient.
 *
 * Validates that:
 * 1. Primary scheduling combines team members to meet requirements
 * 2. Fallback fills remaining gaps using other teams
 * 3. Capacity limits are respected
 * 4. Partial fulfillment is properly reported
 * 5. Fallback config controls whether gap filling runs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestStudents,
	createTestRequirement,
	createPreceptorAvailability,
	createTestTeam,
	clearAllTestData,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 10: Fallback Gap Filling', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Primary scheduling combines team members', () => {
		it('should use multiple team members during primary scheduling to meet requirement', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create 2 preceptors on same team
			const preceptor1 = nanoid();
			const preceptor2 = nanoid();

			await db.insertInto('preceptors').values({
				id: preceptor1,
				name: 'Dr. Primary',
				email: 'primary@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await db.insertInto('preceptors').values({
				id: preceptor2,
				name: 'Dr. Teammate',
				email: 'teammate@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			// Create team with both preceptors
			await createTestTeam(db, clerkshipId, 'Team A', [preceptor1, preceptor2]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Preceptor 1 has 2 days available
			await createPreceptorAvailability(db, preceptor1, siteId, ['2025-12-01', '2025-12-02']);

			// Preceptor 2 has 3 days (non-overlapping)
			await createPreceptorAvailability(db, preceptor2, siteId, ['2025-12-03', '2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// TeamContinuityStrategy should find both team members and schedule 5 days
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Both preceptors should have assignments
			const p1Count = result.assignments.filter(a => a.preceptorId === preceptor1).length;
			const p2Count = result.assignments.filter(a => a.preceptorId === preceptor2).length;
			expect(p1Count + p2Count).toBe(5);
		});
	});

	describe('Test 2: Fallback fills gaps when primary scheduling partially fails', () => {
		it('should use fallback to fill gaps when primary team has insufficient availability', async () => {
			// Setup - Two teams in same health system
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptors
			const teamAPreceptor = nanoid();
			const teamBPreceptor = nanoid();

			await db.insertInto('preceptors').values({
				id: teamAPreceptor,
				name: 'Dr. Team A',
				email: 'teama@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await db.insertInto('preceptors').values({
				id: teamBPreceptor,
				name: 'Dr. Team B',
				email: 'teamb@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			// Team A (will be primary)
			await createTestTeam(db, clerkshipId, 'Team A', [teamAPreceptor]);

			// Team B (fallback - same health system)
			await createTestTeam(db, clerkshipId, 'Team B', [teamBPreceptor]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Team A preceptor has only 2 days
			await createPreceptorAvailability(db, teamAPreceptor, siteId, ['2025-12-01', '2025-12-02']);

			// Team B preceptor has 3 days (different dates)
			await createPreceptorAvailability(db, teamBPreceptor, siteId, ['2025-12-03', '2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should have 5 assignments total (combining both teams)
			expect(result.assignments.length).toBe(5);

			// Both teams should contribute
			const teamACount = result.assignments.filter(a => a.preceptorId === teamAPreceptor).length;
			const teamBCount = result.assignments.filter(a => a.preceptorId === teamBPreceptor).length;
			expect(teamACount + teamBCount).toBe(5);
		});
	});

	describe('Test 3: Capacity limits respected', () => {
		it('should respect daily capacity limits during scheduling', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor with capacity limit
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Limited',
				email: 'limited@test.edu',
				health_system_id: healthSystemId,
				max_students: 1,
			}).execute();

			// Create capacity rule - max 1 student per day
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: preceptorId,
				max_students_per_day: 1,
				max_students_per_year: 50,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create 2 students
			const studentIds = await createTestStudents(db, 2);

			// Preceptor available all 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Check no date has more than 1 student
			const assignmentsByDate = new Map<string, number>();
			for (const assignment of result.assignments) {
				const count = assignmentsByDate.get(assignment.date) || 0;
				assignmentsByDate.set(assignment.date, count + 1);
			}

			for (const [, count] of assignmentsByDate) {
				expect(count).toBeLessThanOrEqual(1);
			}
		});
	});

	describe('Test 4: Partial fulfillment reporting', () => {
		it('should correctly report partial fulfillment when full requirement cannot be met', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Test',
				email: 'test@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Only 3 days available (less than required 5)
			const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should have 3 assignments (partial)
			expect(result.assignments.length).toBe(3);

			// Should have unmet requirement for remaining 2 days
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
			const unmetReq = result.unmetRequirements[0];
			expect(unmetReq.remainingDays).toBe(2); // 5 required - 3 assigned = 2 remaining
		});
	});

	describe('Test 5: Fallback config - allow_fallbacks disabled', () => {
		it('should not fill gaps when allow_fallbacks is false in config', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Disable fallbacks in global defaults
			await db
				.updateTable('global_outpatient_defaults')
				.set({ allow_fallbacks: 0 })
				.where('school_id', '=', 'default')
				.execute();

			// Create preceptor
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Test',
				email: 'test@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Only 3 days available - less than the 5 required
			const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true, // Engine enabled, but config disabled
				dryRun: false,
			});

			// Primary scheduling fails (all-or-nothing when not enough days)
			// Fallback is disabled via config, so no gap filling
			// Result: 0 assignments from primary, 0 from fallback = 0 total
			expect(result.unmetRequirements.length).toBeGreaterThan(0);

			// With allow_fallbacks=0, fallback gap filling is skipped
			// The unmet requirement should still show the full 5 days needed
			const unmetReq = result.unmetRequirements[0];
			expect(unmetReq.requiredDays).toBe(5);
		});
	});

	describe('Test 6: Engine-level enableFallbacks=false', () => {
		it('should not run fallback phase when engine option is false', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Test',
				email: 'test@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Only 3 days available - less than the 5 required
			const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Run scheduling with enableFallbacks: false
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: false, // Disabled at engine level
				dryRun: false,
			});

			// Primary scheduling fails (all-or-nothing)
			// With enableFallbacks=false, fallback phase is skipped entirely
			expect(result.unmetRequirements.length).toBeGreaterThan(0);

			// The unmet requirement should show full 5 days needed
			const unmetReq = result.unmetRequirements[0];
			expect(unmetReq.requiredDays).toBe(5);
		});
	});

	describe('Test 7: Multiple students with limited availability', () => {
		it('should distribute limited availability across multiple students', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Test',
				email: 'test@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create 2 students
			const studentIds = await createTestStudents(db, 2);

			// Limited availability - 6 days total
			const dates = generateDateRange('2025-12-01', 6);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Capacity: 1 per day
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: preceptorId,
				max_students_per_day: 1,
				max_students_per_year: 50,
			}).execute();

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// With capacity 1/day and 6 days available:
			// First student gets 5 days (full requirement)
			// Second student gets 1 day (limited by capacity)
			expect(result.assignments.length).toBeLessThanOrEqual(6);

			// Should have unmet requirements for second student
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('Test 8: Cross-health-system teams', () => {
		it('should combine preceptors from different health systems when both are on teams for clerkship', async () => {
			// Setup: Two health systems
			const { healthSystemId: hs1, siteIds: [site1] } = await createTestHealthSystem(db, 'Hospital A', 1);
			const { healthSystemId: hs2, siteIds: [site2] } = await createTestHealthSystem(db, 'Hospital B', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptors in different health systems
			const hs1Preceptor = nanoid();
			const hs2Preceptor = nanoid();

			await db.insertInto('preceptors').values({
				id: hs1Preceptor,
				name: 'Dr. Hospital A',
				email: 'hsa@test.edu',
				health_system_id: hs1,
			}).execute();

			await db.insertInto('preceptors').values({
				id: hs2Preceptor,
				name: 'Dr. Hospital B',
				email: 'hsb@test.edu',
				health_system_id: hs2,
			}).execute();

			// Teams in different health systems, both for same clerkship
			await createTestTeam(db, clerkshipId, 'Team HS1', [hs1Preceptor]);
			await createTestTeam(db, clerkshipId, 'Team HS2', [hs2Preceptor]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// HS1 preceptor has 2 days
			await createPreceptorAvailability(db, hs1Preceptor, site1, ['2025-12-01', '2025-12-02']);

			// HS2 preceptor has 3 days
			await createPreceptorAvailability(db, hs2Preceptor, site2, ['2025-12-03', '2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should combine both health systems (both have teams for clerkship)
			expect(result.assignments.length).toBe(5);

			// Both preceptors should contribute
			const hs1Count = result.assignments.filter(a => a.preceptorId === hs1Preceptor).length;
			const hs2Count = result.assignments.filter(a => a.preceptorId === hs2Preceptor).length;
			expect(hs1Count + hs2Count).toBe(5);
		});
	});

	describe('Test 9: Cross-system config behavior', () => {
		it('should use cross-system preceptors during primary scheduling when both teams are associated with clerkship', async () => {
			// Note: The `fallbackAllowCrossSystem` setting only controls the FALLBACK phase.
			// During PRIMARY scheduling, TeamContinuityStrategy looks at ALL teams associated
			// with the clerkship, regardless of health system.

			// Setup: Two health systems
			const { healthSystemId: hs1, siteIds: [site1] } = await createTestHealthSystem(db, 'Hospital A', 1);
			const { healthSystemId: hs2, siteIds: [site2] } = await createTestHealthSystem(db, 'Hospital B', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Disable cross-system fallback (only affects fallback phase)
			await db
				.updateTable('global_outpatient_defaults')
				.set({ fallback_allow_cross_system: 0 })
				.where('school_id', '=', 'default')
				.execute();

			// Create preceptors in different health systems
			const hs1Preceptor = nanoid();
			const hs2Preceptor = nanoid();

			await db.insertInto('preceptors').values({
				id: hs1Preceptor,
				name: 'Dr. Hospital A',
				email: 'hsa@test.edu',
				health_system_id: hs1,
			}).execute();

			await db.insertInto('preceptors').values({
				id: hs2Preceptor,
				name: 'Dr. Hospital B',
				email: 'hsb@test.edu',
				health_system_id: hs2,
			}).execute();

			// Both teams associated with clerkship
			await createTestTeam(db, clerkshipId, 'Team HS1', [hs1Preceptor]);
			await createTestTeam(db, clerkshipId, 'Team HS2', [hs2Preceptor]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// HS1 preceptor has 2 days
			await createPreceptorAvailability(db, hs1Preceptor, site1, ['2025-12-01', '2025-12-02']);

			// HS2 preceptor has 3 days
			await createPreceptorAvailability(db, hs2Preceptor, site2, ['2025-12-03', '2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Primary scheduling uses TeamContinuityStrategy which finds ALL teams for clerkship
			// Both preceptors should be used since both teams are associated with the clerkship
			expect(result.assignments.length).toBe(5);

			// Both health systems contribute
			const hs1Count = result.assignments.filter(a => a.preceptorId === hs1Preceptor).length;
			const hs2Count = result.assignments.filter(a => a.preceptorId === hs2Preceptor).length;
			expect(hs1Count + hs2Count).toBe(5);
		});
	});

	describe('Test 10: No teams for clerkship', () => {
		it('should handle gracefully when clerkship has no teams', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			// Create clerkship with NO teams
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor but DO NOT add to any team
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. No Team',
				email: 'noteam@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			// Create availability
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should have unmet requirements since no teams exist
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('Test 11: Daily capacity limit with multiple students', () => {
		it('should respect daily capacity limits when scheduling multiple students', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor with daily capacity limit of 2
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Limited',
				email: 'limited@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			// Create capacity rule - max 2 students per day
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: preceptorId,
				max_students_per_day: 2,
				max_students_per_year: 100,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create availability for 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create 3 students - each needs 5 days, but only 10 slots available (2/day * 5 days)
			const studentIds = await createTestStudents(db, 3);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Check daily capacity is respected
			const assignmentsByDate = new Map<string, number>();
			for (const assignment of result.assignments) {
				const count = assignmentsByDate.get(assignment.date) || 0;
				assignmentsByDate.set(assignment.date, count + 1);
			}

			for (const [, count] of assignmentsByDate) {
				expect(count).toBeLessThanOrEqual(2); // Max 2 per day
			}

			// Should have assignments (2 students * 5 days = 10 max with capacity 2/day)
			expect(result.assignments.length).toBeLessThanOrEqual(10);

			// At least one student should have unmet requirements (3 students need 15 days but only 10 slots)
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('Test 12: Fallback preserves date continuity', () => {
		it('should maximize consecutive days with same preceptor during fallback', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor with 5 consecutive days
			const preceptorId = nanoid();
			await db.insertInto('preceptors').values({
				id: preceptorId,
				name: 'Dr. Consecutive',
				email: 'consecutive@test.edu',
				health_system_id: healthSystemId,
			}).execute();

			await createTestTeam(db, clerkshipId, 'Team', [preceptorId]);

			// Create 5 consecutive days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should have 5 consecutive assignments
			expect(result.assignments.length).toBe(5);

			// All with same preceptor
			const preceptorCounts = new Map<string, number>();
			for (const assignment of result.assignments) {
				const count = preceptorCounts.get(assignment.preceptorId) || 0;
				preceptorCounts.set(assignment.preceptorId, count + 1);
			}

			expect(preceptorCounts.get(preceptorId)).toBe(5);

			// Dates should be consecutive
			const assignedDates = result.assignments
				.map(a => a.date)
				.sort();
			expect(assignedDates).toEqual(dates);
		});
	});
});
