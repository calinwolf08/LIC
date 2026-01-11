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
import {
	createTestUser,
	createTestSchedule,
	associateTeamWithSchedule
} from '$lib/testing/integration-helpers';

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
			if (result.success) throw new Error('Expected failure');
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
			if (getResult.success && getResult.data) {
				expect(getResult.data.members).toHaveLength(2);

				const primary = getResult.data.members.find(m => m.preceptorId === primaryId);
				const fallback = getResult.data.members.find(m => m.preceptorId === fallbackId);

				expect(primary!.isFallbackOnly).toBe(false);
				expect(fallback!.isFallbackOnly).toBe(true);
			}
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
			if (!updateResult.success) throw new Error('Expected success');

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
			expect(getResult.success).toBe(true);
			if (getResult.success && getResult.data) {
				expect(getResult.data.members).toHaveLength(2);

				const fallback = getResult.data.members.find(m => m.preceptorId === fallbackId);
				expect(fallback!.isFallbackOnly).toBe(true);
			}
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
			if (result.success && result.data) {
				expect(result.data.members[0].isFallbackOnly).toBe(false);
			}
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
			if (result.success && result.data) {
				const fallback = result.data.members.find(m => m.preceptorId === fallbackId);
				expect(fallback!.isFallbackOnly).toBe(true);
			}
		});
	});
});

/**
 * Multi-tenancy Tests
 *
 * Tests for schedule-based data isolation
 */
describe('TeamService - Multi-tenancy', () => {
	let db: Kysely<DB>;
	let service: TeamService;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		service = new TeamService(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('getAllTeamsBySchedule()', () => {
		it('returns only teams associated with the given schedule', async () => {
			// Create two users with different schedules
			const userAId = await createTestUser(db, { name: 'User A' });
			const userBId = await createTestUser(db, { name: 'User B' });

			const scheduleAId = await createTestSchedule(db, { userId: userAId, name: 'Schedule A', setAsActive: true });
			const scheduleBId = await createTestSchedule(db, { userId: userBId, name: 'Schedule B', setAsActive: true });

			// Create clerkship and preceptors for teams
			const clerkshipId = await createTestClerkship(db);
			const preceptor1 = await createTestPreceptor(db, 'Dr. One');
			const preceptor2 = await createTestPreceptor(db, 'Dr. Two');
			const preceptor3 = await createTestPreceptor(db, 'Dr. Three');

			// Create teams
			const teamA1Result = await service.createTeam(clerkshipId, {
				name: 'Team A1',
				members: [{ preceptorId: preceptor1, priority: 1, isFallbackOnly: false }],
			});
			const teamA2Result = await service.createTeam(clerkshipId, {
				name: 'Team A2',
				members: [{ preceptorId: preceptor2, priority: 1, isFallbackOnly: false }],
			});
			const teamB1Result = await service.createTeam(clerkshipId, {
				name: 'Team B1',
				members: [{ preceptorId: preceptor3, priority: 1, isFallbackOnly: false }],
			});

			expect(teamA1Result.success).toBe(true);
			expect(teamA2Result.success).toBe(true);
			expect(teamB1Result.success).toBe(true);

			if (!teamA1Result.success || !teamA2Result.success || !teamB1Result.success) return;

			// Associate teams with schedules
			await associateTeamWithSchedule(db, teamA1Result.data.id, scheduleAId);
			await associateTeamWithSchedule(db, teamA2Result.data.id, scheduleAId);
			await associateTeamWithSchedule(db, teamB1Result.data.id, scheduleBId);

			// Get teams for Schedule A
			const teamsA = await service.getAllTeamsBySchedule(scheduleAId);
			expect(teamsA.success).toBe(true);
			if (teamsA.success) {
				expect(teamsA.data).toHaveLength(2);
				expect(teamsA.data.map(t => t.id)).toContain(teamA1Result.data.id);
				expect(teamsA.data.map(t => t.id)).toContain(teamA2Result.data.id);
				expect(teamsA.data.map(t => t.id)).not.toContain(teamB1Result.data.id);
			}

			// Get teams for Schedule B
			const teamsB = await service.getAllTeamsBySchedule(scheduleBId);
			expect(teamsB.success).toBe(true);
			if (teamsB.success) {
				expect(teamsB.data).toHaveLength(1);
				expect(teamsB.data.map(t => t.id)).toContain(teamB1Result.data.id);
			}
		});

		it('returns empty array when schedule has no associated teams', async () => {
			const userId = await createTestUser(db, { name: 'User' });
			const scheduleId = await createTestSchedule(db, { userId, name: 'Empty Schedule', setAsActive: true });

			// Create team but don't associate with the schedule
			const clerkshipId = await createTestClerkship(db);
			const preceptorId = await createTestPreceptor(db);
			await service.createTeam(clerkshipId, {
				name: 'Some Team',
				members: [{ preceptorId, priority: 1, isFallbackOnly: false }],
			});

			const teams = await service.getAllTeamsBySchedule(scheduleId);
			expect(teams.success).toBe(true);
			if (teams.success) {
				expect(teams.data).toEqual([]);
			}
		});

		it('returns failure when scheduleId is not provided', async () => {
			const result = await service.getAllTeamsBySchedule('');
			expect(result.success).toBe(false);
		});
	});
});
