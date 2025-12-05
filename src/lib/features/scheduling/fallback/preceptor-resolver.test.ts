/**
 * Unit Tests: FallbackPreceptorResolver
 *
 * Tests the fallback preceptor resolution logic that finds available preceptors
 * in priority order based on team membership and health system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { FallbackPreceptorResolver } from './preceptor-resolver';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('FallbackPreceptorResolver', () => {
	let db: Kysely<DB>;
	let resolver: FallbackPreceptorResolver;

	// Test data IDs
	let healthSystem1Id: string;
	let healthSystem2Id: string;
	let clerkshipId: string;
	let teamAId: string;
	let teamBId: string;
	let teamCId: string;
	let preceptor1Id: string; // Team A, HS1
	let preceptor2Id: string; // Team A, HS1
	let preceptor3Id: string; // Team B, HS1
	let preceptor4Id: string; // Team C, HS2

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		resolver = new FallbackPreceptorResolver(db);

		// Create test data
		healthSystem1Id = nanoid();
		healthSystem2Id = nanoid();
		clerkshipId = nanoid();

		// Create health systems
		await db.insertInto('health_systems').values([
			{ id: healthSystem1Id, name: 'Hospital System 1' },
			{ id: healthSystem2Id, name: 'Hospital System 2' },
		]).execute();

		// Create clerkship
		await db.insertInto('clerkships').values({
			id: clerkshipId,
			name: 'Test Clerkship',
			clerkship_type: 'outpatient',
			required_days: 5,
		}).execute();

		// Create preceptors
		preceptor1Id = nanoid();
		preceptor2Id = nanoid();
		preceptor3Id = nanoid();
		preceptor4Id = nanoid();

		await db.insertInto('preceptors').values([
			{ id: preceptor1Id, name: 'Dr. One', email: 'one@test.edu', health_system_id: healthSystem1Id },
			{ id: preceptor2Id, name: 'Dr. Two', email: 'two@test.edu', health_system_id: healthSystem1Id },
			{ id: preceptor3Id, name: 'Dr. Three', email: 'three@test.edu', health_system_id: healthSystem1Id },
			{ id: preceptor4Id, name: 'Dr. Four', email: 'four@test.edu', health_system_id: healthSystem2Id },
		]).execute();

		// Create teams
		teamAId = nanoid();
		teamBId = nanoid();
		teamCId = nanoid();

		await db.insertInto('preceptor_teams').values([
			{ id: teamAId, clerkship_id: clerkshipId, name: 'Team A' },
			{ id: teamBId, clerkship_id: clerkshipId, name: 'Team B' },
			{ id: teamCId, clerkship_id: clerkshipId, name: 'Team C' },
		]).execute();

		// Add team members
		// Team A: Preceptor 1 (lead, priority 1) + Preceptor 2 (priority 2)
		await db.insertInto('preceptor_team_members').values([
			{ id: nanoid(), team_id: teamAId, preceptor_id: preceptor1Id, priority: 1, role: 'lead' },
			{ id: nanoid(), team_id: teamAId, preceptor_id: preceptor2Id, priority: 2, role: 'member' },
		]).execute();

		// Team B: Preceptor 3 (same health system as Team A)
		await db.insertInto('preceptor_team_members').values([
			{ id: nanoid(), team_id: teamBId, preceptor_id: preceptor3Id, priority: 1, role: 'lead' },
		]).execute();

		// Team C: Preceptor 4 (different health system)
		await db.insertInto('preceptor_team_members').values([
			{ id: nanoid(), team_id: teamCId, preceptor_id: preceptor4Id, priority: 1, role: 'lead' },
		]).execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('getOrderedFallbackPreceptors', () => {
		it('should return tier 1 (same team) preceptors first', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId, // Primary team
				healthSystem1Id,
				false, // No cross-system
				new Set([preceptor1Id]) // Exclude lead preceptor
			);

			// Should find Preceptor 2 (same team, tier 1)
			const tier1 = result.filter(p => p.tier === 1);
			expect(tier1.length).toBe(1);
			expect(tier1[0].id).toBe(preceptor2Id);
			expect(tier1[0].teamId).toBe(teamAId);
		});

		it('should return tier 2 (same health system) preceptors second', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				false, // No cross-system
				new Set()
			);

			// Tier 1: Preceptor 1, 2 (Team A)
			// Tier 2: Preceptor 3 (Team B, same health system)
			const tier2 = result.filter(p => p.tier === 2);
			expect(tier2.length).toBe(1);
			expect(tier2[0].id).toBe(preceptor3Id);
			expect(tier2[0].teamId).toBe(teamBId);
		});

		it('should return tier 3 (cross-system) preceptors when allowed', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				true, // Allow cross-system
				new Set()
			);

			// Tier 3: Preceptor 4 (Team C, different health system)
			const tier3 = result.filter(p => p.tier === 3);
			expect(tier3.length).toBe(1);
			expect(tier3[0].id).toBe(preceptor4Id);
			expect(tier3[0].teamId).toBe(teamCId);
		});

		it('should NOT return tier 3 preceptors when cross-system is disabled', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				false, // No cross-system
				new Set()
			);

			// Should not include Preceptor 4
			const tier3 = result.filter(p => p.tier === 3);
			expect(tier3.length).toBe(0);

			const preceptor4 = result.find(p => p.id === preceptor4Id);
			expect(preceptor4).toBeUndefined();
		});

		it('should exclude specified preceptor IDs', async () => {
			const excluded = new Set([preceptor1Id, preceptor3Id]);
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				true,
				excluded
			);

			// Should not include excluded preceptors
			expect(result.find(p => p.id === preceptor1Id)).toBeUndefined();
			expect(result.find(p => p.id === preceptor3Id)).toBeUndefined();

			// Should include others
			expect(result.find(p => p.id === preceptor2Id)).toBeDefined();
			expect(result.find(p => p.id === preceptor4Id)).toBeDefined();
		});

		it('should return empty array when no teams exist for clerkship', async () => {
			const emptyClerkshipId = nanoid();
			await db.insertInto('clerkships').values({
				id: emptyClerkshipId,
				name: 'Empty Clerkship',
				clerkship_type: 'outpatient',
				required_days: 5,
			}).execute();

			const result = await resolver.getOrderedFallbackPreceptors(
				emptyClerkshipId,
				null,
				null,
				true,
				new Set()
			);

			expect(result).toEqual([]);
		});

		it('should handle null primary team by returning all preceptors as tier 2/3', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				null, // No primary team
				healthSystem1Id,
				true,
				new Set()
			);

			// No tier 1 since no primary team
			const tier1 = result.filter(p => p.tier === 1);
			expect(tier1.length).toBe(0);

			// Should have tier 2 (same health system) and tier 3 (cross-system)
			const tier2 = result.filter(p => p.tier === 2);
			const tier3 = result.filter(p => p.tier === 3);

			expect(tier2.length).toBeGreaterThan(0);
			expect(tier3.length).toBeGreaterThan(0);
		});

		it('should maintain priority order within each tier', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				false,
				new Set()
			);

			// Tier 1 should have Preceptor 1 (priority 1) before Preceptor 2 (priority 2)
			const tier1 = result.filter(p => p.tier === 1);
			expect(tier1.length).toBe(2);
			expect(tier1[0].id).toBe(preceptor1Id);
			expect(tier1[0].priority).toBe(1);
			expect(tier1[1].id).toBe(preceptor2Id);
			expect(tier1[1].priority).toBe(2);
		});

		it('should not duplicate preceptors across tiers', async () => {
			const result = await resolver.getOrderedFallbackPreceptors(
				clerkshipId,
				teamAId,
				healthSystem1Id,
				true,
				new Set()
			);

			// Check for duplicates
			const ids = result.map(p => p.id);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});
	});

	describe('getTeamHealthSystem', () => {
		it('should return health system of highest priority team member', async () => {
			const healthSystemId = await resolver.getTeamHealthSystem(teamAId);
			expect(healthSystemId).toBe(healthSystem1Id);
		});

		it('should return null for team with no members', async () => {
			const emptyTeamId = nanoid();
			await db.insertInto('preceptor_teams').values({
				id: emptyTeamId,
				clerkship_id: clerkshipId,
				name: 'Empty Team',
			}).execute();

			const healthSystemId = await resolver.getTeamHealthSystem(emptyTeamId);
			expect(healthSystemId).toBeNull();
		});
	});

	describe('getTeamsForClerkship', () => {
		it('should return all teams for a clerkship', async () => {
			const teams = await resolver.getTeamsForClerkship(clerkshipId);

			expect(teams.length).toBe(3);
			expect(teams.map(t => t.id).sort()).toEqual([teamAId, teamBId, teamCId].sort());
		});

		it('should return empty array for clerkship with no teams', async () => {
			const emptyClerkshipId = nanoid();
			await db.insertInto('clerkships').values({
				id: emptyClerkshipId,
				name: 'Empty Clerkship',
				clerkship_type: 'outpatient',
				required_days: 5,
			}).execute();

			const teams = await resolver.getTeamsForClerkship(emptyClerkshipId);
			expect(teams).toEqual([]);
		});

		it('should include health system ID for each team', async () => {
			const teams = await resolver.getTeamsForClerkship(clerkshipId);

			const teamA = teams.find(t => t.id === teamAId);
			const teamC = teams.find(t => t.id === teamCId);

			expect(teamA?.healthSystemId).toBe(healthSystem1Id);
			expect(teamC?.healthSystemId).toBe(healthSystem2Id);
		});
	});
});
