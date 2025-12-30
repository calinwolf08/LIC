/**
 * TeamService Tests
 *
 * Tests for the TeamService, particularly focusing on:
 * - CRUD operations with isFallbackOnly flag
 * - Validation of team member fallback status
 * - Mapping of database values to domain types
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { TeamService } from './teams.service';
import { nanoid } from 'nanoid';

/**
 * Helper to create test clerkship
 */
async function createTestClerkship(db: Kysely<DB>, name: string = 'Test Clerkship'): Promise<string> {
	const id = nanoid();
	await db.insertInto('clerkships').values({
		id,
		name,
		clerkship_type: 'outpatient',
		required_days: 28,
	}).execute();
	return id;
}

/**
 * Helper to create test preceptor
 */
async function createTestPreceptor(db: Kysely<DB>, name: string = 'Dr. Test'): Promise<string> {
	const id = nanoid();
	await db.insertInto('preceptors').values({
		id,
		name,
		email: `${id}@test.edu`,
	}).execute();
	return id;
}

describe('TeamService', () => {
	let db: Kysely<DB>;
	let service: TeamService;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		service = new TeamService(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('createTeam', () => {
		it('should create team with primary member (isFallbackOnly: false)', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptorId = await createTestPreceptor(db);

			const result = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId, priority: 1, isFallbackOnly: false },
				],
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.members).toHaveLength(1);
			expect(result.data.members[0].isFallbackOnly).toBe(false);
		});

		it('should create team with fallback-only member', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			const result = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId: primaryId, priority: 1, isFallbackOnly: false },
					{ preceptorId: fallbackId, priority: 2, isFallbackOnly: true },
				],
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.members).toHaveLength(2);

			const primary = result.data.members.find(m => m.preceptorId === primaryId);
			const fallback = result.data.members.find(m => m.preceptorId === fallbackId);

			expect(primary!.isFallbackOnly).toBe(false);
			expect(fallback!.isFallbackOnly).toBe(true);
		});

		it('should default isFallbackOnly to false when not provided', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptorId = await createTestPreceptor(db);

			const result = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId, priority: 1 }, // No isFallbackOnly specified
				],
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.members[0].isFallbackOnly).toBe(false);
		});

		it('should reject team with all fallback-only members', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptor1 = await createTestPreceptor(db, 'Dr. One');
			const preceptor2 = await createTestPreceptor(db, 'Dr. Two');

			const result = await service.createTeam(clerkshipId, {
				name: 'Invalid Team',
				members: [
					{ preceptorId: preceptor1, priority: 1, isFallbackOnly: true },
					{ preceptorId: preceptor2, priority: 2, isFallbackOnly: true },
				],
			});

			expect(result.success).toBe(false);
			// The error comes from schema validation
			expect(result.error).toBeDefined();
		});
	});

	describe('getTeam', () => {
		it('should return team with isFallbackOnly flags', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			const createResult = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId: primaryId, priority: 1, isFallbackOnly: false },
					{ preceptorId: fallbackId, priority: 2, isFallbackOnly: true },
				],
			});

			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');
			const teamId = createResult.data.id;

			const getResult = await service.getTeam(teamId);

			expect(getResult.success).toBe(true);
			if (!getResult.success) throw new Error('Expected success');
			expect(getResult.data.members).toHaveLength(2);

			const primary = getResult.data.members.find(m => m.preceptorId === primaryId);
			const fallback = getResult.data.members.find(m => m.preceptorId === fallbackId);

			expect(primary!.isFallbackOnly).toBe(false);
			expect(fallback!.isFallbackOnly).toBe(true);
		});
	});

	describe('updateTeam', () => {
		it('should update member to fallback-only', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptor1 = await createTestPreceptor(db, 'Dr. One');
			const preceptor2 = await createTestPreceptor(db, 'Dr. Two');

			const createResult = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId: preceptor1, priority: 1, isFallbackOnly: false },
					{ preceptorId: preceptor2, priority: 2, isFallbackOnly: false },
				],
			});

			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');
			const teamId = createResult.data.id;

			// Update second member to fallback-only
			const updateResult = await service.updateTeam(teamId, {
				members: [
					{ preceptorId: preceptor1, priority: 1, isFallbackOnly: false },
					{ preceptorId: preceptor2, priority: 2, isFallbackOnly: true },
				],
			});

			expect(updateResult.success).toBe(true);

			const member2 = updateResult.data.members.find(m => m.preceptorId === preceptor2);
			expect(member2!.isFallbackOnly).toBe(true);
		});

		it('should prevent update that makes all members fallback-only', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptor1 = await createTestPreceptor(db, 'Dr. One');
			const preceptor2 = await createTestPreceptor(db, 'Dr. Two');

			const createResult = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId: preceptor1, priority: 1, isFallbackOnly: false },
					{ preceptorId: preceptor2, priority: 2, isFallbackOnly: true },
				],
			});

			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');
			const teamId = createResult.data.id;

			// Try to make both fallback-only
			const updateResult = await service.updateTeam(teamId, {
				members: [
					{ preceptorId: preceptor1, priority: 1, isFallbackOnly: true },
					{ preceptorId: preceptor2, priority: 2, isFallbackOnly: true },
				],
			});

			expect(updateResult.success).toBe(false);
		});
	});

	describe('addTeamMember', () => {
		it('should add fallback-only member to team', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			const createResult = await service.createTeam(clerkshipId, {
				name: 'Test Team',
				members: [
					{ preceptorId: primaryId, priority: 1, isFallbackOnly: false },
				],
			});

			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');
			const teamId = createResult.data.id;

			// Add fallback member
			const addResult = await service.addTeamMember(teamId, {
				preceptorId: fallbackId,
				priority: 2,
				isFallbackOnly: true,
			});

			expect(addResult.success).toBe(true);
			if (!addResult.success) throw new Error('Expected success');
			expect(addResult.data.isFallbackOnly).toBe(true);

			// Verify in database
			const getResult = await service.getTeam(teamId);
			expect(getResult.data.members).toHaveLength(2);

			const fallback = getResult.data.members.find(m => m.preceptorId === fallbackId);
			expect(fallback!.isFallbackOnly).toBe(true);
		});
	});

	describe('getTeamsByClerkship', () => {
		it('should return teams with correct isFallbackOnly values', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			await service.createTeam(clerkshipId, {
				name: 'Team A',
				members: [
					{ preceptorId: primaryId, priority: 1, isFallbackOnly: false },
					{ preceptorId: fallbackId, priority: 2, isFallbackOnly: true },
				],
			});

			const result = await service.getTeamsByClerkship(clerkshipId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(1);

			const team = result.data[0];
			const primary = team.members.find(m => m.preceptorId === primaryId);
			const fallback = team.members.find(m => m.preceptorId === fallbackId);

			expect(primary!.isFallbackOnly).toBe(false);
			expect(fallback!.isFallbackOnly).toBe(true);
		});
	});

	describe('getAllTeams', () => {
		it('should return all teams with isFallbackOnly flags', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			await service.createTeam(clerkshipId, {
				name: 'Team A',
				members: [
					{ preceptorId: primaryId, priority: 1, isFallbackOnly: false },
					{ preceptorId: fallbackId, priority: 2, isFallbackOnly: true },
				],
			});

			const result = await service.getAllTeams();

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.length).toBeGreaterThanOrEqual(1);

			const team = result.data.find(t => t.name === 'Team A');
			expect(team).toBeDefined();

			const primary = team!.members.find(m => m.preceptorId === primaryId);
			const fallback = team!.members.find(m => m.preceptorId === fallbackId);

			expect(primary!.isFallbackOnly).toBe(false);
			expect(fallback!.isFallbackOnly).toBe(true);
		});
	});

	describe('Database value mapping', () => {
		it('should correctly map is_fallback_only = 0 to false', async () => {
			const clerkshipId = await createTestClerkship(db);
			const preceptorId = await createTestPreceptor(db);

			// Insert directly into database with explicit 0
			const teamId = nanoid();
			const timestamp = new Date().toISOString();

			await db.insertInto('preceptor_teams').values({
				id: teamId,
				clerkship_id: clerkshipId,
				name: 'Direct Insert Team',
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();

			await db.insertInto('preceptor_team_members').values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: preceptorId,
				priority: 1,
				is_fallback_only: 0, // Explicitly 0
				created_at: timestamp,
			}).execute();

			const result = await service.getTeam(teamId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.members[0].isFallbackOnly).toBe(false);
		});

		it('should correctly map is_fallback_only = 1 to true', async () => {
			const clerkshipId = await createTestClerkship(db);
			const primaryId = await createTestPreceptor(db, 'Dr. Primary');
			const fallbackId = await createTestPreceptor(db, 'Dr. Fallback');

			// Insert directly into database with explicit 1
			const teamId = nanoid();
			const timestamp = new Date().toISOString();

			await db.insertInto('preceptor_teams').values({
				id: teamId,
				clerkship_id: clerkshipId,
				name: 'Direct Insert Team',
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();

			await db.insertInto('preceptor_team_members').values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: primaryId,
				priority: 1,
				is_fallback_only: 0,
				created_at: timestamp,
			}).execute();

			await db.insertInto('preceptor_team_members').values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: fallbackId,
				priority: 2,
				is_fallback_only: 1, // Explicitly 1
				created_at: timestamp,
			}).execute();

			const result = await service.getTeam(teamId);

			expect(result.success).toBe(true);

			const fallback = result.data.members.find(m => m.preceptorId === fallbackId);
			expect(fallback!.isFallbackOnly).toBe(true);
		});
	});
});
