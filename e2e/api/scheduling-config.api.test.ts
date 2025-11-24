import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Scheduling Configuration API', () => {
	test.describe('Health Systems', () => {
		test('should create health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const response = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(response, 201);

			assertions.crud.created(hs, {
				name: hsData.name
			});
		});

		test('should list all health systems', async ({ request }) => {
			const api = createApiClient(request);

			const hs1 = fixtures.healthSystem();
			const hs2 = fixtures.healthSystem();
			await api.post('/api/scheduling-config/health-systems', hs1);
			await api.post('/api/scheduling-config/health-systems', hs2);

			const response = await api.get('/api/scheduling-config/health-systems');
			const systems = await api.expectData<any[]>(response);

			assertions.hasMinLength(systems, 2);
		});

		test('should update health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			const updates = { name: 'Updated Health System' };
			const response = await api.put(`/api/scheduling-config/health-systems/${created.id}`, updates);
			const updated = await api.expectData(response);

			expect(updated.name).toBe('Updated Health System');
		});

		test('should delete health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/health-systems/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/scheduling-config/health-systems/${created.id}`);
			await api.expectError(getResponse, 404);
		});
	});

	test.describe('Requirements', () => {
		let clerkshipId: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();
			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(response, 201);
			clerkshipId = clerkship.id;
		});

		test('should create requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 10,
				overrideMode: 'inherit'
			});

			const response = await api.post('/api/scheduling-config/requirements', reqData);
			const req = await api.expectData(response, 201);

			expect(req.clerkshipId).toBe(clerkshipId);
			expect(req.requirementType).toBe('inpatient');
			expect(req.requiredDays).toBe(10);
		});

		test('should list requirements for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const req1 = fixtures.requirement(clerkshipId, { requirementType: 'inpatient' });
			const req2 = fixtures.requirement(clerkshipId, { requirementType: 'outpatient' });

			await api.post('/api/scheduling-config/requirements', req1);
			await api.post('/api/scheduling-config/requirements', req2);

			const response = await api.get('/api/scheduling-config/requirements', {
				params: { clerkshipId: String(clerkshipId) }
			});
			const requirements = await api.expectData<any[]>(response);

			assertions.hasMinLength(requirements, 2);
		});

		test('should update requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId);

			const createResponse = await api.post('/api/scheduling-config/requirements', reqData);
			const created = await api.expectData(createResponse, 201);

			// Update with full schema object (API validates against full requirementInputSchema)
			const updates = {
				...reqData,
				requiredDays: 15
			};
			const response = await api.put(`/api/scheduling-config/requirements/${created.id}`, updates);
			if (response.status() !== 200) {
				const body = await response.json();
				console.log('Requirement PUT error:', JSON.stringify(body, null, 2));
			}
			const updated = await api.expectData(response);

			expect(updated.requiredDays).toBe(15);
		});

		test('should delete requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId);

			const createResponse = await api.post('/api/scheduling-config/requirements', reqData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/requirements/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});

		test('should create requirement with health system constraint', async ({ request }) => {
			const api = createApiClient(request);

			// Create health system
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(hsResponse, 201);

			const reqData = fixtures.requirement(clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 10,
				overrideMode: 'override_fields',
				overrideHealthSystemRule: 'enforce_same_system'
			});

			const response = await api.post('/api/scheduling-config/requirements', reqData);
			const req = await api.expectData(response, 201);

			expect(req.overrideHealthSystemRule).toBe('enforce_same_system');
		});
	});

	test.describe('Teams', () => {
		let clerkshipId: string;
		let preceptor1Id: string;
		let preceptor2Id: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(hsResponse, 201);

			const clerkshipData = fixtures.clerkship();
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(clerkshipResponse, 201);
			clerkshipId = clerkship.id;

			const p1Data = fixtures.preceptor({ health_system_id: hs.id });
			const p1Response = await api.post('/api/preceptors', p1Data);
			const p1 = await api.expectData(p1Response, 201);
			preceptor1Id = p1.id;

			const p2Data = fixtures.preceptor({ health_system_id: hs.id });
			const p2Response = await api.post('/api/preceptors', p2Data);
			const p2 = await api.expectData(p2Response, 201);
			preceptor2Id = p2.id;
		});

		test('should create team with preceptors', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = fixtures.team({
				name: 'Team Alpha',
				requireSameHealthSystem: false,
				members: [
					{ preceptorId: preceptor1Id, priority: 1 },
					{ preceptorId: preceptor2Id, priority: 2 }
				]
			});

			const response = await api.post('/api/scheduling-config/teams', teamData, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			if (response.status() !== 201) {
				const body = await response.json();
				console.log('Teams POST error:', JSON.stringify(body, null, 2));
			}
			const team = await api.expectData(response, 201);

			expect(team.name).toBe('Team Alpha');
			expect(team.members).toBeDefined();
			expect(team.members.length).toBe(2);
		});

		test('should list teams for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const team1 = fixtures.team({
				name: 'Team 1',
				members: [
					{ preceptorId: preceptor1Id, priority: 1 },
					{ preceptorId: preceptor2Id, priority: 2 }
				]
			});
			const team2 = fixtures.team({
				name: 'Team 2',
				members: [
					{ preceptorId: preceptor2Id, priority: 1 },
					{ preceptorId: preceptor1Id, priority: 2 }
				]
			});

			await api.post('/api/scheduling-config/teams', team1, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			await api.post('/api/scheduling-config/teams', team2, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);

			const response = await api.get('/api/scheduling-config/teams', {
				params: { clerkshipId: String(clerkshipId) }
			});
			const teams = await api.expectData<any[]>(response);

			assertions.hasMinLength(teams, 2);
		});

		test('should validate team configuration', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = fixtures.team({
				members: [
					{ preceptorId: preceptor1Id, priority: 1 },
					{ preceptorId: preceptor2Id, priority: 2 }
				]
			});

			const response = await api.post('/api/scheduling-config/teams/validate', teamData);
			const validation = await api.expectData(response);

			expect(validation.valid !== undefined || validation.errors !== undefined).toBeTruthy();
		});
	});

	test.describe('Capacity Rules', () => {
		let preceptorId: string;
		let clerkshipId: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(hsResponse, 201);

			const pData = fixtures.preceptor({ health_system_id: hs.id });
			const pResponse = await api.post('/api/preceptors', pData);
			const p = await api.expectData(pResponse, 201);
			preceptorId = p.id;

			const cData = fixtures.clerkship();
			const cResponse = await api.post('/api/clerkships', cData);
			const c = await api.expectData(cResponse, 201);
			clerkshipId = c.id;
		});

		test('should create per-day capacity rule', async ({ request }) => {
			const api = createApiClient(request);

			const capData = fixtures.capacityRule(preceptorId, {
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 50
			});

			const response = await api.post('/api/scheduling-config/capacity-rules', capData);
			const rule = await api.expectData(response, 201);

			expect(rule.preceptorId).toBe(preceptorId);
			expect(rule.maxStudentsPerDay).toBe(2);
			expect(rule.maxStudentsPerYear).toBe(50);
		});

		test('should create per-year capacity rule with clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const capData = fixtures.capacityRule(preceptorId, {
				clerkshipId: clerkshipId,
				maxStudentsPerDay: 1,
				maxStudentsPerYear: 10
			});

			const response = await api.post('/api/scheduling-config/capacity-rules', capData);
			const rule = await api.expectData(response, 201);

			expect(rule.clerkshipId).toBe(clerkshipId);
			expect(rule.maxStudentsPerYear).toBe(10);
		});

		test('should list capacity rules for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const cap1 = fixtures.capacityRule(preceptorId, { maxStudentsPerDay: 2, maxStudentsPerYear: 20 });
			const cap2 = fixtures.capacityRule(preceptorId, { maxStudentsPerDay: 3, maxStudentsPerYear: 30 });

			await api.post('/api/scheduling-config/capacity-rules', cap1);
			await api.post('/api/scheduling-config/capacity-rules', cap2);

			const response = await api.get('/api/scheduling-config/capacity-rules', {
				params: { preceptorId: String(preceptorId) }
			});
			const rules = await api.expectData<any[]>(response);

			assertions.hasMinLength(rules, 2);
		});
	});

	test.describe('Fallbacks', () => {
		let primaryId: string;
		let fallback1Id: string;
		let fallback2Id: string;
		let clerkshipId: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(hsResponse, 201);

			// Create preceptors
			const p1 = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id }));
			const primary = await api.expectData(p1, 201);
			primaryId = primary.id;

			const p2 = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id }));
			const f1 = await api.expectData(p2, 201);
			fallback1Id = f1.id;

			const p3 = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: hs.id }));
			const f2 = await api.expectData(p3, 201);
			fallback2Id = f2.id;

			// Create clerkship
			const c = await api.post('/api/clerkships', fixtures.clerkship());
			const clerkship = await api.expectData(c, 201);
			clerkshipId = clerkship.id;
		});

		test('should create fallback chain', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, fallback1Id, {
				clerkshipId: clerkshipId,
				priority: 1
			});

			const response = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const fallback = await api.expectData(response, 201);

			expect(fallback.primaryPreceptorId).toBe(primaryId);
			expect(fallback.fallbackPreceptorId).toBe(fallback1Id);
			expect(fallback.clerkshipId).toBe(clerkshipId);
		});

		test('should list fallbacks for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, fallback1Id);

			await api.post('/api/scheduling-config/fallbacks', fallbackData);

			const response = await api.get('/api/scheduling-config/fallbacks', {
				params: { preceptorId: String(primaryId) }
			});
			const fallbacks = await api.expectData<any[]>(response);

			assertions.hasMinLength(fallbacks, 1);
		});

		test('should get specific fallback', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, fallback1Id);

			const createResponse = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/scheduling-config/fallbacks/${created.id}`);
			const fallback = await api.expectData(response);

			expect(fallback.id).toBe(created.id);
			expect(fallback.primaryPreceptorId).toBe(primaryId);
		});

		test('should delete fallback', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, fallback1Id);

			const createResponse = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/fallbacks/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});
	});

	test.describe('Electives', () => {
		let requirementId: string;
		let preceptorId: string;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectData(hsResponse, 201);

			const clerkshipData = fixtures.clerkship();
			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(response, 201);

			// Create a requirement for electives
			const reqData = fixtures.requirement(clerkship.id, {
				requirementType: 'elective'
			});
			const reqResponse = await api.post('/api/scheduling-config/requirements', reqData);
			const requirement = await api.expectData(reqResponse, 201);
			requirementId = requirement.id;

			// Create a preceptor for electives
			const pData = fixtures.preceptor({ health_system_id: hs.id, specialty: 'Surgery' });
			const pResponse = await api.post('/api/preceptors', pData);
			const p = await api.expectData(pResponse, 201);
			preceptorId = p.id;
		});

		test('should create elective', async ({ request }) => {
			const api = createApiClient(request);

			const electiveData = fixtures.elective({
				name: 'Surgery Elective',
				specialty: 'Surgery',
				minimumDays: 5,
				availablePreceptorIds: [preceptorId]
			});

			const response = await api.post('/api/scheduling-config/electives', electiveData, {
				params: { requirementId: String(requirementId) }
			} as any);
			if (response.status() !== 201) {
				const body = await response.json();
				console.log('Electives POST error:', JSON.stringify(body, null, 2));
			}
			const elective = await api.expectData(response, 201);

			expect(elective.name).toBe('Surgery Elective');
			expect(elective.specialty).toBe('Surgery');
			expect(elective.minimumDays).toBe(5);
		});

		test('should list electives for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const e1 = fixtures.elective({ specialty: 'Surgery', availablePreceptorIds: [preceptorId] });
			const e2 = fixtures.elective({ specialty: 'Pediatrics', availablePreceptorIds: [preceptorId] });

			await api.post('/api/scheduling-config/electives', e1, {
				params: { requirementId: String(requirementId) }
			} as any);
			await api.post('/api/scheduling-config/electives', e2, {
				params: { requirementId: String(requirementId) }
			} as any);

			const response = await api.get('/api/scheduling-config/electives', {
				params: { requirementId: String(requirementId) }
			});
			const electives = await api.expectData<any[]>(response);

			assertions.hasMinLength(electives, 2);
		});

		test('should delete elective', async ({ request }) => {
			const api = createApiClient(request);

			const electiveData = fixtures.elective({ availablePreceptorIds: [preceptorId] });
			const createResponse = await api.post('/api/scheduling-config/electives', electiveData, {
				params: { requirementId: String(clerkshipId) }
			} as any);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/electives/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});
	});

	test.describe('Global Defaults', () => {
		test('should get and update inpatient defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'prefer_same_system',
				defaultMaxStudentsPerDay: 2,
				defaultMaxStudentsPerYear: 50,
				allowTeams: false,
				allowFallbacks: true,
				fallbackRequiresApproval: false,
				fallbackAllowCrossSystem: false
			};

			const updateResponse = await api.put('/api/scheduling-config/global-defaults/inpatient', defaults);
			expect(updateResponse.status()).toBe(200);
			const updateBody = await updateResponse.json() as { data: any };
			const updated = updateBody.data;

			expect(updated.assignmentStrategy).toBe('continuous_single');

			// Get defaults
			const getResponse = await api.get('/api/scheduling-config/global-defaults/inpatient');
			expect(getResponse.status()).toBe(200);
			const getBody = await getResponse.json() as { data: any };
			const fetched = getBody.data;

			expect(fetched.assignmentStrategy).toBe('continuous_single');
		});

		test('should get and update outpatient defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignmentStrategy: 'daily_rotation',
				healthSystemRule: 'no_preference',
				defaultMaxStudentsPerDay: 3,
				defaultMaxStudentsPerYear: 60,
				allowTeams: true,
				allowFallbacks: true
			};

			const response = await api.put('/api/scheduling-config/global-defaults/outpatient', defaults);
			expect(response.status()).toBe(200);
			const body = await response.json() as { data: any };
			const updated = body.data;

			expect(updated.assignmentStrategy).toBe('daily_rotation');
		});

		test('should get and update elective defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'no_preference',
				defaultMaxStudentsPerDay: 1,
				defaultMaxStudentsPerYear: 20,
				allowTeams: false,
				allowFallbacks: true
			};

			const response = await api.put('/api/scheduling-config/global-defaults/elective', defaults);
			expect(response.status()).toBe(200);
			const body = await response.json() as { data: any };
			const updated = body.data;

			expect(updated.assignmentStrategy).toBe('continuous_single');
		});
	});
});
