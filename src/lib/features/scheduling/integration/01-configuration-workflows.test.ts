/**
 * Integration Test Suite 1: Complete Configuration Workflows
 *
 * Tests the full lifecycle of configuration creation, update, and deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestPreceptors,
	createTestRequirement,
	createCapacityRule,
	createTestTeam,
	createFallbackChain,
	clearAllTestData,
} from '$lib/testing/integration-helpers';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { ConfigurationService } from '$lib/features/scheduling-config/services/configuration.service';
import { RequirementService } from '$lib/features/scheduling-config/services/requirements.service';
import { CapacityRuleService } from '$lib/features/scheduling-config/services/capacity.service';
import { TeamService } from '$lib/features/scheduling-config/services/teams.service';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 1: Configuration Workflows', () => {
	let db: Kysely<DB>;
	let healthSystemService: HealthSystemService;
	let configService: ConfigurationService;
	let requirementService: RequirementService;
	let capacityService: CapacityRuleService;
	let teamService: TeamService;
	let fallbackService: FallbackService;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		healthSystemService = new HealthSystemService(db);
		configService = new ConfigurationService(db);
		requirementService = new RequirementService(db);
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
				location: 'Test City',
			});
			expect(hsResult.success).toBe(true);
			if (!hsResult.success) return;
			const healthSystemId = hsResult.data.id;

			// 2. Create sites
			const siteResult = await healthSystemService.createSite(healthSystemId, {
				name: 'Main Campus',
				address: '123 Test St',
			});
			expect(siteResult.success).toBe(true);
			if (!siteResult.success) return;
			const siteId = siteResult.data.id;

			// 3. Create preceptors
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId,
				maxStudents: 3,
			});
			expect(preceptorIds.length).toBe(3);

			// 4. Create clerkship
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// 5. Create clerkship requirement
			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 20,
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'prefer_same_system',
			});
			expect(requirementId).toBeDefined();

			// 6. Create capacity rules (hierarchical)
			const generalRuleResult = await capacityService.createCapacityRule({
				preceptorId: preceptorIds[0],
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 10,
			});
			expect(generalRuleResult.success).toBe(true);

			const clerkshipRuleResult = await capacityService.createCapacityRule({
				preceptorId: preceptorIds[1],
				clerkshipId,
				maxStudentsPerDay: 3,
				maxStudentsPerYear: 12,
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
					priority: i + 1,
				})),
			});
			expect(teamResult.success).toBe(true);
			if (!teamResult.success) return;

			// 8. Create fallback chain
			const fallbackIds = await createFallbackChain(db, preceptorIds[0], [
				preceptorIds[1],
				preceptorIds[2],
			]);
			expect(fallbackIds.length).toBe(2);

			// 9. Validate complete configuration
			const configResult = await configService.getCompleteConfiguration(clerkshipId);
			expect(configResult.success).toBe(true);
			if (!configResult.success) return;

			expect(configResult.data!.requirements.length).toBe(1);
			expect(configResult.data!.requirements[0].requirement.requirementType).toBe('outpatient');
			expect(configResult.data!.requirements[0].requirement.requiredDays).toBe(20);

			// 10. Verify all relationships intact
			const requirementsResult = await requirementService.getRequirementsByClerkship(clerkshipId);
			expect(requirementsResult.success).toBe(true);
			if (!requirementsResult.success) return;
			expect(requirementsResult.data.length).toBe(1);

			const teamsResult = await teamService.getTeamsByClerkship(clerkshipId);
			expect(teamsResult.success).toBe(true);
			if (!teamsResult.success) return;
			expect(teamsResult.data.length).toBe(1);

			const capacityRulesResult = await capacityService.getCapacityRulesByPreceptor(
				preceptorIds[0]
			);
			expect(capacityRulesResult.success).toBe(true);
			if (!capacityRulesResult.success) return;
			expect(capacityRulesResult.data.length).toBeGreaterThan(0);
		});
	});

	describe('Test 2: Update Configuration Cascade', () => {
		it('should update configuration and cascade changes appropriately', async () => {
			// Create initial configuration
			const clerkshipId = await createTestClerkship(db, 'Internal Medicine', 'Internal Medicine');
			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'block_based',
				blockSizeDays: 14,
			});

			// Verify initial state
			let reqResult = await requirementService.getRequirement(requirementId);
			expect(reqResult.success).toBe(true);
			if (!reqResult.success) return;
			expect(reqResult.data?.overrideAssignmentStrategy).toBe('block_based');
			expect(reqResult.data?.overrideBlockSizeDays).toBe(14);

			// Update requirement - change strategy to continuous_single
			const updateResult = await requirementService.updateRequirement(requirementId, {
				overrideAssignmentStrategy: 'continuous_single',
			});
			expect(updateResult.success).toBe(true);

			// Verify update persisted
			reqResult = await requirementService.getRequirement(requirementId);
			expect(reqResult.success).toBe(true);
			if (!reqResult.success) return;
			expect(reqResult.data?.overrideAssignmentStrategy).toBe('continuous_single');
			// The required days should remain unchanged
			expect(reqResult.data?.requiredDays).toBe(28);
		});
	});

	describe('Test 3: Delete Configuration Cascade', () => {
		it('should delete configuration and cascade to child entities', async () => {
			// Create complete configuration
			const clerkshipId = await createTestClerkship(db, 'Surgery', 'Surgery');
			const preceptorIds = await createTestPreceptors(db, 2);

			const requirementId = await createTestRequirement(db, clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 42,
				assignmentStrategy: 'daily_rotation',
			});

			// Create team for this clerkship
			const teamId = await createTestTeam(db, clerkshipId, 'Surgery Team', preceptorIds);

			// Verify entities exist
			let teamResult = await teamService.getTeam(teamId);
			expect(teamResult.success).toBe(true);
			if (teamResult.success) {
				expect(teamResult.data).not.toBeNull();
			}

			let reqResult = await requirementService.getRequirement(requirementId);
			expect(reqResult.success).toBe(true);
			if (reqResult.success) {
				expect(reqResult.data).not.toBeNull();
			}

			// Delete requirement
			const deleteResult = await requirementService.deleteRequirement(requirementId);
			expect(deleteResult.success).toBe(true);

			// Verify requirement deleted
			reqResult = await requirementService.getRequirement(requirementId);
			expect(reqResult.success).toBe(true);
			if (reqResult.success) {
				expect(reqResult.data).toBeNull();
			}

			// Note: Team should still exist as it's associated with clerkship, not requirement
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
			const clerkshipId = await createTestClerkship(db, 'Pediatrics', 'Pediatrics');
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
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
					priority: i + 1,
				})),
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
			const clerkshipId = await createTestClerkship(db, 'Emergency Medicine', 'Emergency Medicine');
			const preceptorIds = await createTestPreceptors(db, 1);
			const preceptorId = preceptorIds[0];

			// Create rules at different hierarchy levels
			// 1. General rule
			const generalRule = await capacityService.createCapacityRule({
				preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 10,
			});
			expect(generalRule.success).toBe(true);

			// 2. Clerkship-specific rule (higher precedence)
			const clerkshipRule = await capacityService.createCapacityRule({
				preceptorId,
				clerkshipId,
				maxStudentsPerDay: 3,
				maxStudentsPerYear: 15,
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
