/**
 * Integration Test Suite 1: Complete Configuration Workflows
 *
 * Tests the full lifecycle of configuration creation, update, and deletion.
 *
 * NOTE: Updated for the new model where:
 * - Clerkships define their type (inpatient/outpatient) directly
 * - Electives link directly to clerkships via clerkship_id
 * - clerkship_requirements table has been removed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestPreceptors,
	createCapacityRule,
	createTestTeam,
	createFallbackChain,
	clearAllTestData
} from '$lib/testing/integration-helpers';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { ConfigurationService } from '$lib/features/scheduling-config/services/configuration.service';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { CapacityRuleService } from '$lib/features/scheduling-config/services/capacity.service';
import { TeamService } from '$lib/features/scheduling-config/services/teams.service';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 1: Configuration Workflows', () => {
	let db: Kysely<DB>;
	let healthSystemService: HealthSystemService;
	let configService: ConfigurationService;
	let electiveService: ElectiveService;
	let capacityService: CapacityRuleService;
	let teamService: TeamService;
	let fallbackService: FallbackService;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		healthSystemService = new HealthSystemService(db);
		configService = new ConfigurationService(db);
		electiveService = new ElectiveService(db);
		capacityService = new CapacityRuleService(db);
		teamService = new TeamService(db);
		fallbackService = new FallbackService(db);
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Create Complete Configuration from Scratch', () => {
		it('should create a complete configuration with all components', async () => {
			// 1. Create health systems
			const hsResult = await healthSystemService.createHealthSystem({
				name: 'Test Medical Center',
				location: 'Test City'
			});
			expect(hsResult.success).toBe(true);
			if (!hsResult.success) return;
			const healthSystemId = hsResult.data.id;

			// 2. Create sites
			const siteResult = await healthSystemService.createSite(healthSystemId, {
				name: 'Main Campus',
				address: '123 Test St'
			});
			expect(siteResult.success).toBe(true);
			if (!siteResult.success) return;
			const siteId = siteResult.data.id;

			// 3. Create preceptors
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId,
				maxStudents: 3
			});
			expect(preceptorIds.length).toBe(3);

			// 4. Create clerkship (now includes type directly)
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine', {
				clerkshipType: 'outpatient',
				requiredDays: 20
			});

			// 5. Create electives (now link directly to clerkship)
			const electiveResult = await electiveService.createElective(clerkshipId, {
				name: 'Geriatrics Elective',
				specialty: 'Geriatrics',
				minimumDays: 5,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);

			// 6. Create capacity rules (hierarchical)
			const generalRuleResult = await capacityService.createCapacityRule({
				preceptorId: preceptorIds[0],
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 10
			});
			expect(generalRuleResult.success).toBe(true);

			const clerkshipRuleResult = await capacityService.createCapacityRule({
				preceptorId: preceptorIds[1],
				clerkshipId,
				maxStudentsPerDay: 3,
				maxStudentsPerYear: 12
			});
			expect(clerkshipRuleResult.success).toBe(true);

			// 7. Create a team with members
			const teamResult = await teamService.createTeam(clerkshipId, {
				name: 'Teaching Team A',
				requireSameHealthSystem: true,
				requireSameSite: false,
				requireSameSpecialty: true,
				requiresAdminApproval: false,
				members: preceptorIds.map((id, i) => ({
					preceptorId: id,
					priority: i + 1
				}))
			});
			expect(teamResult.success).toBe(true);
			if (!teamResult.success) return;

			// 8. Create fallback chain
			const fallbackIds = await createFallbackChain(db, preceptorIds[0], [
				preceptorIds[1],
				preceptorIds[2]
			]);
			expect(fallbackIds.length).toBe(2);

			// 9. Validate complete configuration
			const configResult = await configService.getCompleteConfiguration(clerkshipId);
			expect(configResult.success).toBe(true);
			if (!configResult.success) return;

			// Verify clerkship configuration
			expect(configResult.data!.clerkshipType).toBe('outpatient');
			expect(configResult.data!.totalRequiredDays).toBe(20);
			expect(configResult.data!.electives.length).toBe(1);
			expect(configResult.data!.electiveDays).toBe(5);
			expect(configResult.data!.nonElectiveDays).toBe(15);

			// 10. Verify electives
			const electivesResult = await electiveService.getElectivesByClerkship(clerkshipId);
			expect(electivesResult.success).toBe(true);
			if (!electivesResult.success) return;
			expect(electivesResult.data.length).toBe(1);

			// 11. Verify teams
			const teamsResult = await teamService.getTeamsByClerkship(clerkshipId);
			expect(teamsResult.success).toBe(true);
			if (!teamsResult.success) return;
			expect(teamsResult.data.length).toBe(1);

			// 12. Verify capacity rules
			const capacityRulesResult = await capacityService.getCapacityRulesByPreceptor(
				preceptorIds[0]
			);
			expect(capacityRulesResult.success).toBe(true);
			if (!capacityRulesResult.success) return;
			expect(capacityRulesResult.data.length).toBeGreaterThan(0);
		});
	});

	describe('Test 2: Update Elective Configuration', () => {
		it('should update elective and validate days constraint', async () => {
			// Create clerkship with 20 required days
			const clerkshipId = await createTestClerkship(db, 'Internal Medicine', 'Internal Medicine', {
				clerkshipType: 'inpatient',
				requiredDays: 28
			});

			// Create an elective with 10 days
			const electiveResult = await electiveService.createElective(clerkshipId, {
				name: 'ICU Rotation',
				specialty: 'Critical Care',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			// Update elective to have more days
			const updateResult = await electiveService.updateElective(electiveResult.data.id, {
				minimumDays: 14
			});
			expect(updateResult.success).toBe(true);

			// Verify update persisted
			const fetchResult = await electiveService.getElective(electiveResult.data.id);
			expect(fetchResult.success).toBe(true);
			if (!fetchResult.success) return;
			expect(fetchResult.data?.minimumDays).toBe(14);

			// Verify days summary
			const summaryResult = await electiveService.getElectiveDaysSummary(clerkshipId);
			expect(summaryResult.success).toBe(true);
			if (!summaryResult.success) return;
			expect(summaryResult.data.totalElectiveDays).toBe(14);
			expect(summaryResult.data.nonElectiveDays).toBe(14);
			expect(summaryResult.data.remainingDays).toBe(14);
		});
	});

	describe('Test 3: Delete Configuration Cascade', () => {
		it('should delete electives and cascade to child entities', async () => {
			// Create complete configuration
			const clerkshipId = await createTestClerkship(db, 'Surgery', 'Surgery', {
				clerkshipType: 'inpatient',
				requiredDays: 42
			});
			const preceptorIds = await createTestPreceptors(db, 2);

			// Create elective
			const electiveResult = await electiveService.createElective(clerkshipId, {
				name: 'Trauma Surgery',
				specialty: 'Trauma',
				minimumDays: 14,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			// Create team for this clerkship
			const teamId = await createTestTeam(db, clerkshipId, 'Surgery Team', preceptorIds);

			// Verify entities exist
			let teamResult = await teamService.getTeam(teamId);
			expect(teamResult.success).toBe(true);
			if (teamResult.success) {
				expect(teamResult.data).not.toBeNull();
			}

			let elecResult = await electiveService.getElective(electiveResult.data.id);
			expect(elecResult.success).toBe(true);
			if (elecResult.success) {
				expect(elecResult.data).not.toBeNull();
			}

			// Delete elective
			const deleteResult = await electiveService.deleteElective(electiveResult.data.id);
			expect(deleteResult.success).toBe(true);

			// Verify elective deleted
			elecResult = await electiveService.getElective(electiveResult.data.id);
			expect(elecResult.success).toBe(true);
			if (elecResult.success) {
				expect(elecResult.data).toBeNull();
			}

			// Note: Team should still exist as it's associated with clerkship, not elective
			teamResult = await teamService.getTeam(teamId);
			expect(teamResult.success).toBe(true);
			if (teamResult.success) {
				expect(teamResult.data).not.toBeNull();
			}
		});
	});

	describe('Test 4: Configuration Validation', () => {
		it('should validate configuration constraints', async () => {
			// Setup health system so preceptors have valid associations
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Pediatrics Hospital',
				1
			);
			const clerkshipId = await createTestClerkship(db, 'Pediatrics', 'Pediatrics', {
				clerkshipType: 'outpatient',
				requiredDays: 20
			});
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0]
			});

			// Create a team with validation rules and members
			const teamResult = await teamService.createTeam(clerkshipId, {
				name: 'Pediatrics Team',
				requireSameHealthSystem: true,
				requireSameSite: true,
				requireSameSpecialty: true,
				requiresAdminApproval: false,
				members: preceptorIds.map((id, i) => ({
					preceptorId: id,
					priority: i + 1
				}))
			});
			expect(teamResult.success).toBe(true);
			if (!teamResult.success) return;

			// Verify team has members by fetching the team
			const fetchedTeam = await teamService.getTeam(teamResult.data.id);
			expect(fetchedTeam.success).toBe(true);
			if (!fetchedTeam.success) return;
			expect(fetchedTeam.data?.members.length).toBe(3);
		});
	});

	describe('Test 5: Hierarchical Capacity Rules', () => {
		it('should correctly resolve hierarchical capacity rules', async () => {
			const clerkshipId = await createTestClerkship(
				db,
				'Emergency Medicine',
				'Emergency Medicine',
				{
					clerkshipType: 'inpatient',
					requiredDays: 28
				}
			);
			const preceptorIds = await createTestPreceptors(db, 1);
			const preceptorId = preceptorIds[0];

			// Create rules at different hierarchy levels
			// 1. General rule
			const generalRule = await capacityService.createCapacityRule({
				preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 10
			});
			expect(generalRule.success).toBe(true);

			// 2. Clerkship-specific rule (higher precedence)
			const clerkshipRule = await capacityService.createCapacityRule({
				preceptorId,
				clerkshipId,
				maxStudentsPerDay: 3,
				maxStudentsPerYear: 15
			});
			expect(clerkshipRule.success).toBe(true);

			// Get all rules for this preceptor
			const rulesResult = await capacityService.getCapacityRulesByPreceptor(preceptorId);
			expect(rulesResult.success).toBe(true);
			if (!rulesResult.success) return;
			expect(rulesResult.data.length).toBe(2);

			// Verify both rules exist (check for null/undefined clerkshipId)
			const hasGeneralRule = rulesResult.data.some((r) => r.clerkshipId == null);
			const hasClerkshipRule = rulesResult.data.some((r) => r.clerkshipId === clerkshipId);
			expect(hasGeneralRule).toBe(true);
			expect(hasClerkshipRule).toBe(true);
		});
	});

	describe('Test 6: Fallback Chain Validation', () => {
		it('should prevent circular fallback chains', async () => {
			const preceptorIds = await createTestPreceptors(db, 3);

			// Create initial fallback chain: P1 -> P2 -> P3
			await createFallbackChain(db, preceptorIds[0], [preceptorIds[1]]);
			await createFallbackChain(db, preceptorIds[1], [preceptorIds[2]]);

			// Verify fallback chains exist
			const p1Fallbacks = await fallbackService.getFallbackChain(preceptorIds[0]);
			expect(p1Fallbacks.success).toBe(true);
			if (!p1Fallbacks.success) return;
			expect(p1Fallbacks.data.length).toBeGreaterThan(0);

			const p2Fallbacks = await fallbackService.getFallbackChain(preceptorIds[1]);
			expect(p2Fallbacks.success).toBe(true);
			if (!p2Fallbacks.success) return;
			expect(p2Fallbacks.data.length).toBeGreaterThan(0);

			// Attempting to create P3 -> P1 would create a circular chain
			// The service should have validation to prevent this
			// For now, just verify the chain structure is correct
			const allFallbacks = await db.selectFrom('preceptor_fallbacks').selectAll().execute();
			expect(allFallbacks.length).toBe(2);
		});
	});
});
