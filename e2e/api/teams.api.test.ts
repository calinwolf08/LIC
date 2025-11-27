import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';

/**
 * Teams API Tests
 *
 * Tests for the preceptor teams API endpoints:
 * - GET /api/preceptors/teams - List teams
 * - POST /api/preceptors/teams - Create team
 * - GET /api/preceptors/teams/:id - Get team
 * - PATCH /api/preceptors/teams/:id - Update team
 * - DELETE /api/preceptors/teams/:id - Delete team
 */

test.describe('Teams API', () => {
	// Test data holders for cleanup
	let testClerkshipId: string;
	let testSiteId: string;
	let testHealthSystemId: string;
	let testPreceptorIds: string[] = [];
	let testTeamIds: string[] = [];

	test.beforeAll(async ({ request }) => {
		const api = createApiClient(request);

		// Create a health system
		const hsResponse = await api.post('/api/health-systems', {
			name: `Test Health System ${Date.now()}`,
			abbreviation: `THS-${Date.now().toString().slice(-5)}`
		});
		const healthSystem = await api.expectData<{ id: string }>(hsResponse, 201);
		testHealthSystemId = healthSystem.id;

		// Create a site
		const siteResponse = await api.post('/api/sites', {
			name: `Test Site ${Date.now()}`,
			health_system_id: testHealthSystemId
		});
		const site = await api.expectData<{ id: string }>(siteResponse, 201);
		testSiteId = site.id;

		// Create a clerkship
		const clerkshipResponse = await api.post('/api/clerkships', {
			name: `Test Clerkship ${Date.now()}`,
			specialty: 'Family Medicine',
			clerkship_type: 'inpatient',
			required_days: 28
		});
		const clerkship = await api.expectData<{ id: string }>(clerkshipResponse, 201);
		testClerkshipId = clerkship.id;

		// Create test preceptors with site association
		for (let i = 0; i < 3; i++) {
			const preceptorResponse = await api.post('/api/preceptors', {
				name: `Dr. Test Preceptor ${i + 1} - ${Date.now()}`,
				email: `preceptor${i}-${Date.now()}@test.com`,
				health_system_id: testHealthSystemId,
				site_ids: [testSiteId]
			});
			const preceptor = await api.expectData<{ id: string }>(preceptorResponse, 201);
			testPreceptorIds.push(preceptor.id);
		}
	});

	test.afterAll(async ({ request }) => {
		const api = createApiClient(request);

		// Cleanup teams
		for (const teamId of testTeamIds) {
			await api.delete(`/api/preceptors/teams/${teamId}`).catch(() => {});
		}

		// Cleanup preceptors
		for (const preceptorId of testPreceptorIds) {
			await api.delete(`/api/preceptors/${preceptorId}`).catch(() => {});
		}

		// Cleanup clerkship
		if (testClerkshipId) {
			await api.delete(`/api/clerkships/${testClerkshipId}`).catch(() => {});
		}

		// Cleanup site
		if (testSiteId) {
			await api.delete(`/api/sites/${testSiteId}`).catch(() => {});
		}

		// Cleanup health system
		if (testHealthSystemId) {
			await api.delete(`/api/health-systems/${testHealthSystemId}`).catch(() => {});
		}
	});

	test.describe('GET /api/preceptors/teams', () => {
		test('should list all teams', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/preceptors/teams');
			const teams = await api.expectData<any[]>(response);

			expect(Array.isArray(teams)).toBe(true);
		});

		test('should filter teams by clerkship', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Filter Test Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const team = await api.expectData<{ id: string }>(createResponse, 201);
			testTeamIds.push(team.id);

			// Filter by clerkship
			const response = await api.get('/api/preceptors/teams', {
				params: { clerkshipId: testClerkshipId }
			});
			const teams = await api.expectData<any[]>(response);

			expect(Array.isArray(teams)).toBe(true);
			expect(teams.some((t: any) => t.id === team.id)).toBe(true);
		});
	});

	test.describe('POST /api/preceptors/teams', () => {
		test('should create a team with members', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = {
				clerkshipId: testClerkshipId,
				name: `Test Team ${Date.now()}`,
				requireSameHealthSystem: false,
				requireSameSite: false,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1, role: 'Lead' },
					{ preceptorId: testPreceptorIds[1], priority: 2 }
				]
			};

			const response = await api.post('/api/preceptors/teams', teamData);
			const team = await api.expectData<any>(response, 201);

			expect(team.id).toBeDefined();
			expect(team.name).toBe(teamData.name);
			expect(team.members).toHaveLength(2);
			expect(team.clerkshipId).toBe(testClerkshipId);

			testTeamIds.push(team.id);
		});

		test('should fail to create team without members', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = {
				clerkshipId: testClerkshipId,
				name: `Empty Team ${Date.now()}`,
				members: []
			};

			const response = await api.post('/api/preceptors/teams', teamData);
			expect(response.status()).toBe(400);

			const body = await response.json();
			expect(body.success).toBe(false);
		});

		test('should fail to create team without clerkshipId', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = {
				name: `No Clerkship Team ${Date.now()}`,
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			};

			const response = await api.post('/api/preceptors/teams', teamData);
			expect(response.status()).toBe(400);
		});

		test('should fail with duplicate priorities', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = {
				clerkshipId: testClerkshipId,
				name: `Duplicate Priority Team ${Date.now()}`,
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 },
					{ preceptorId: testPreceptorIds[1], priority: 1 } // Duplicate priority
				]
			};

			const response = await api.post('/api/preceptors/teams', teamData);
			expect(response.status()).toBe(400);
		});

		test('should fail with duplicate preceptors', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = {
				clerkshipId: testClerkshipId,
				name: `Duplicate Preceptor Team ${Date.now()}`,
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 },
					{ preceptorId: testPreceptorIds[0], priority: 2 } // Same preceptor
				]
			};

			const response = await api.post('/api/preceptors/teams', teamData);
			expect(response.status()).toBe(400);
		});
	});

	test.describe('GET /api/preceptors/teams/:id', () => {
		test('should get team by ID', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Get By ID Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Get the team
			const response = await api.get(`/api/preceptors/teams/${created.id}`);
			const team = await api.expectData<any>(response);

			expect(team.id).toBe(created.id);
			expect(team.name).toBe(created.name);
			expect(team.members).toBeDefined();
			expect(team.sites).toBeDefined();
		});

		test('should return 404 for non-existent team', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/preceptors/teams/nonexistent-id');
			expect(response.status()).toBe(404);
		});
	});

	test.describe('PATCH /api/preceptors/teams/:id', () => {
		test('should update team name', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Update Name Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Update the team
			const newName = `Updated Team Name ${Date.now()}`;
			const updateResponse = await api.patch(`/api/preceptors/teams/${created.id}`, {
				name: newName
			});
			const updated = await api.expectData<any>(updateResponse);

			expect(updated.name).toBe(newName);
		});

		test('should update team members', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Update Members Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Update members
			const updateResponse = await api.patch(`/api/preceptors/teams/${created.id}`, {
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 },
					{ preceptorId: testPreceptorIds[1], priority: 2 },
					{ preceptorId: testPreceptorIds[2], priority: 3 }
				]
			});
			const updated = await api.expectData<any>(updateResponse);

			expect(updated.members).toHaveLength(3);
		});

		test('should update team sites', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team without sites first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Update Sites Team ${Date.now()}`,
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Update with sites
			const updateResponse = await api.patch(`/api/preceptors/teams/${created.id}`, {
				siteIds: [testSiteId]
			});
			const updated = await api.expectData<any>(updateResponse);

			expect(updated.sites).toBeDefined();
			expect(updated.sites.some((s: any) => s.id === testSiteId)).toBe(true);
		});

		test('should update formation rules', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Update Rules Team ${Date.now()}`,
				requireSameHealthSystem: false,
				requireSameSite: false,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Update rules
			const updateResponse = await api.patch(`/api/preceptors/teams/${created.id}`, {
				requireSameHealthSystem: true,
				requireSameSite: true
			});
			const updated = await api.expectData<any>(updateResponse);

			expect(updated.requireSameHealthSystem).toBe(true);
			expect(updated.requireSameSite).toBe(true);
		});

		test('should fail to update with empty members array', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team first
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Empty Members Update Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(created.id);

			// Try to update with empty members
			const updateResponse = await api.patch(`/api/preceptors/teams/${created.id}`, {
				members: []
			});
			expect(updateResponse.status()).toBe(400);
		});

		test('should return error for non-existent team', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/preceptors/teams/nonexistent-id', {
				name: 'Test'
			});
			// API returns error (400 or 404) for non-existent team
			expect(response.ok()).toBeFalsy();
		});
	});

	test.describe('DELETE /api/preceptors/teams/:id', () => {
		test('should delete team', async ({ request }) => {
			const api = createApiClient(request);

			// Create a team
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Delete Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const created = await api.expectData<any>(createResponse, 201);

			// Delete the team
			const deleteResponse = await api.delete(`/api/preceptors/teams/${created.id}`);
			expect(deleteResponse.ok()).toBeTruthy();

			// Verify deleted
			const verifyResponse = await api.get(`/api/preceptors/teams/${created.id}`);
			expect(verifyResponse.status()).toBe(404);
		});

		test('should return error for non-existent team', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/preceptors/teams/nonexistent-id');
			// API returns error (400 or 404) for non-existent team
			expect(response.ok()).toBeFalsy();
		});
	});

	test.describe('Edge Cases', () => {
		test('should handle team with all optional fields', async ({ request }) => {
			const api = createApiClient(request);

			// Create minimal team (no name, no sites, no roles)
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				members: [
					{ preceptorId: testPreceptorIds[0], priority: 1 }
				]
			});
			const team = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(team.id);

			expect(team.id).toBeDefined();
			expect(team.name).toBeFalsy(); // Should be null/undefined
			expect(team.members).toHaveLength(1);
		});

		test('should store all members with correct priorities', async ({ request }) => {
			const api = createApiClient(request);

			// Create team with specific priorities
			const createResponse = await api.post('/api/preceptors/teams', {
				clerkshipId: testClerkshipId,
				name: `Priority Order Team ${Date.now()}`,
				siteIds: [testSiteId],
				members: [
					{ preceptorId: testPreceptorIds[2], priority: 3 },
					{ preceptorId: testPreceptorIds[0], priority: 1 },
					{ preceptorId: testPreceptorIds[1], priority: 2 }
				]
			});
			const team = await api.expectData<any>(createResponse, 201);
			testTeamIds.push(team.id);

			// Verify all priorities are present (order may vary in response)
			const priorities = team.members.map((m: any) => m.priority).sort();
			expect(priorities).toEqual([1, 2, 3]);
		});
	});
});
