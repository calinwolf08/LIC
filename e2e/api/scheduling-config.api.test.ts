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
			const hs = await api.expectJson(response, 201);

			assertions.crud.created(hs, {
				name: hsData.name,
				abbreviation: hsData.abbreviation
			});
		});

		test('should list all health systems', async ({ request }) => {
			const api = createApiClient(request);

			const hs1 = fixtures.healthSystem();
			const hs2 = fixtures.healthSystem();
			await api.post('/api/scheduling-config/health-systems', hs1);
			await api.post('/api/scheduling-config/health-systems', hs2);

			const response = await api.get('/api/scheduling-config/health-systems');
			const systems = await api.expectJson<any[]>(response);

			assertions.hasMinLength(systems, 2);
		});

		test('should update health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectJson(createResponse, 201);

			const updates = { name: 'Updated Health System' };
			const response = await api.put(`/api/scheduling-config/health-systems/${created.id}`, updates);
			const updated = await api.expectJson(response);

			expect(updated.name).toBe('Updated Health System');
		});

		test('should delete health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/health-systems/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/scheduling-config/health-systems/${created.id}`);
			await api.expectError(getResponse, 404);
		});
	});

	test.describe('Requirements', () => {
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();
			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(response, 201);
			clerkshipId = clerkship.id;
		});

		test('should create requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId, {
				requirement_type: 'inpatient',
				days_required: 10,
				assignment_strategy: 'prioritize_continuity'
			});

			const response = await api.post('/api/scheduling-config/requirements', reqData);
			const req = await api.expectJson(response, 201);

			assertions.crud.created(req, {
				clerkship_id: clerkshipId,
				requirement_type: 'inpatient',
				days_required: 10
			});
		});

		test('should list requirements for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const req1 = fixtures.requirement(clerkshipId, { requirement_type: 'inpatient' });
			const req2 = fixtures.requirement(clerkshipId, { requirement_type: 'outpatient' });

			await api.post('/api/scheduling-config/requirements', req1);
			await api.post('/api/scheduling-config/requirements', req2);

			const response = await api.get('/api/scheduling-config/requirements', {
				params: { clerkshipId: String(clerkshipId) }
			});
			const requirements = await api.expectJson<any[]>(response);

			assertions.hasMinLength(requirements, 2);
		});

		test('should update requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId);

			const createResponse = await api.post('/api/scheduling-config/requirements', reqData);
			const created = await api.expectJson(createResponse, 201);

			const updates = { days_required: 15 };
			const response = await api.put(`/api/scheduling-config/requirements/${created.id}`, updates);
			const updated = await api.expectJson(response);

			expect(updated.days_required).toBe(15);
		});

		test('should delete requirement', async ({ request }) => {
			const api = createApiClient(request);
			const reqData = fixtures.requirement(clerkshipId);

			const createResponse = await api.post('/api/scheduling-config/requirements', reqData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/requirements/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});

		test('should create requirement with health system constraint', async ({ request }) => {
			const api = createApiClient(request);

			// Create health system
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectJson(hsResponse, 201);

			const reqData = fixtures.requirement(clerkshipId, {
				requirement_type: 'inpatient',
				days_required: 10,
				health_system_id: hs.id,
				allow_cross_system: false
			});

			const response = await api.post('/api/scheduling-config/requirements', reqData);
			const req = await api.expectJson(response, 201);

			expect(req.health_system_id).toBe(hs.id);
			expect(req.allow_cross_system).toBe(false);
		});
	});

	test.describe('Teams', () => {
		let clerkshipId: number;
		let preceptor1Id: number;
		let preceptor2Id: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			const clerkshipData = fixtures.clerkship();
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(clerkshipResponse, 201);
			clerkshipId = clerkship.id;

			const p1Data = fixtures.preceptor();
			const p1Response = await api.post('/api/preceptors', p1Data);
			const p1 = await api.expectJson(p1Response, 201);
			preceptor1Id = p1.id;

			const p2Data = fixtures.preceptor();
			const p2Response = await api.post('/api/preceptors', p2Data);
			const p2 = await api.expectJson(p2Response, 201);
			preceptor2Id = p2.id;
		});

		test('should create team with preceptors', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = fixtures.team(clerkshipId, {
				name: 'Team Alpha',
				priority_order: 1,
				preceptor_ids: [preceptor1Id, preceptor2Id],
				min_days: 5,
				max_days: 15
			});

			const response = await api.post('/api/scheduling-config/teams', teamData, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const team = await api.expectJson(response, 201);

			assertions.crud.created(team, {
				name: 'Team Alpha',
				clerkship_id: clerkshipId,
				priority_order: 1
			});

			expect(team.preceptor_ids).toBeDefined();
			expect(team.preceptor_ids.length).toBe(2);
		});

		test('should list teams for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const team1 = fixtures.team(clerkshipId, {
				name: 'Team 1',
				preceptor_ids: [preceptor1Id]
			});
			const team2 = fixtures.team(clerkshipId, {
				name: 'Team 2',
				preceptor_ids: [preceptor2Id]
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
			const teams = await api.expectJson<any[]>(response);

			assertions.hasMinLength(teams, 2);
		});

		test('should validate team configuration', async ({ request }) => {
			const api = createApiClient(request);

			const teamData = fixtures.team(clerkshipId, {
				preceptor_ids: [preceptor1Id, preceptor2Id]
			});

			const response = await api.post('/api/scheduling-config/teams/validate', teamData);
			const validation = await api.expectJson(response);

			expect(validation.valid !== undefined || validation.errors !== undefined).toBeTruthy();
		});
	});

	test.describe('Capacity Rules', () => {
		let preceptorId: number;
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			const pData = fixtures.preceptor();
			const pResponse = await api.post('/api/preceptors', pData);
			const p = await api.expectJson(pResponse, 201);
			preceptorId = p.id;

			const cData = fixtures.clerkship();
			const cResponse = await api.post('/api/clerkships', cData);
			const c = await api.expectJson(cResponse, 201);
			clerkshipId = c.id;
		});

		test('should create per-day capacity rule', async ({ request }) => {
			const api = createApiClient(request);

			const capData = fixtures.capacityRule(preceptorId, {
				capacity_type: 'per_day',
				max_students: 2
			});

			const response = await api.post('/api/scheduling-config/capacity-rules', capData);
			const rule = await api.expectJson(response, 201);

			assertions.crud.created(rule, {
				preceptor_id: preceptorId,
				capacity_type: 'per_day',
				max_students: 2
			});
		});

		test('should create per-year capacity rule with clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const capData = fixtures.capacityRule(preceptorId, {
				clerkship_id: clerkshipId,
				capacity_type: 'per_year',
				max_students: 10
			});

			const response = await api.post('/api/scheduling-config/capacity-rules', capData);
			const rule = await api.expectJson(response, 201);

			expect(rule.clerkship_id).toBe(clerkshipId);
			expect(rule.capacity_type).toBe('per_year');
			expect(rule.max_students).toBe(10);
		});

		test('should list capacity rules for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const cap1 = fixtures.capacityRule(preceptorId, { capacity_type: 'per_day' });
			const cap2 = fixtures.capacityRule(preceptorId, { capacity_type: 'per_year' });

			await api.post('/api/scheduling-config/capacity-rules', cap1);
			await api.post('/api/scheduling-config/capacity-rules', cap2);

			const response = await api.get('/api/scheduling-config/capacity-rules', {
				params: { preceptorId: String(preceptorId) }
			});
			const rules = await api.expectJson<any[]>(response);

			assertions.hasMinLength(rules, 2);
		});
	});

	test.describe('Fallbacks', () => {
		let primaryId: number;
		let fallback1Id: number;
		let fallback2Id: number;
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create preceptors
			const p1 = await api.post('/api/preceptors', fixtures.preceptor());
			const primary = await api.expectJson(p1, 201);
			primaryId = primary.id;

			const p2 = await api.post('/api/preceptors', fixtures.preceptor());
			const f1 = await api.expectJson(p2, 201);
			fallback1Id = f1.id;

			const p3 = await api.post('/api/preceptors', fixtures.preceptor());
			const f2 = await api.expectJson(p3, 201);
			fallback2Id = f2.id;

			// Create clerkship
			const c = await api.post('/api/clerkships', fixtures.clerkship());
			const clerkship = await api.expectJson(c, 201);
			clerkshipId = clerkship.id;
		});

		test('should create fallback chain', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, {
				clerkship_id: clerkshipId,
				fallback_order: [fallback1Id, fallback2Id]
			});

			const response = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const fallback = await api.expectJson(response, 201);

			assertions.crud.created(fallback, {
				primary_preceptor_id: primaryId,
				clerkship_id: clerkshipId
			});

			expect(fallback.fallback_order).toBeDefined();
			expect(fallback.fallback_order.length).toBe(2);
		});

		test('should list fallbacks for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, {
				fallback_order: [fallback1Id]
			});

			await api.post('/api/scheduling-config/fallbacks', fallbackData);

			const response = await api.get('/api/scheduling-config/fallbacks', {
				params: { preceptorId: String(primaryId) }
			});
			const fallbacks = await api.expectJson<any[]>(response);

			assertions.hasMinLength(fallbacks, 1);
		});

		test('should get specific fallback', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, {
				fallback_order: [fallback1Id, fallback2Id]
			});

			const createResponse = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/scheduling-config/fallbacks/${created.id}`);
			const fallback = await api.expectJson(response);

			expect(fallback.id).toBe(created.id);
			expect(fallback.primary_preceptor_id).toBe(primaryId);
		});

		test('should delete fallback', async ({ request }) => {
			const api = createApiClient(request);

			const fallbackData = fixtures.fallback(primaryId, {
				fallback_order: [fallback1Id]
			});

			const createResponse = await api.post('/api/scheduling-config/fallbacks', fallbackData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/fallbacks/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});
	});

	test.describe('Electives', () => {
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();
			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(response, 201);
			clerkshipId = clerkship.id;
		});

		test('should create elective', async ({ request }) => {
			const api = createApiClient(request);

			const electiveData = fixtures.elective(clerkshipId, {
				specialty: 'Surgery',
				days_required: 5
			});

			const response = await api.post('/api/scheduling-config/electives', electiveData, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const elective = await api.expectJson(response, 201);

			assertions.crud.created(elective, {
				clerkship_id: clerkshipId,
				specialty: 'Surgery',
				days_required: 5
			});
		});

		test('should list electives for clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const e1 = fixtures.elective(clerkshipId, { specialty: 'Surgery' });
			const e2 = fixtures.elective(clerkshipId, { specialty: 'Pediatrics' });

			await api.post('/api/scheduling-config/electives', e1, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			await api.post('/api/scheduling-config/electives', e2, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);

			const response = await api.get('/api/scheduling-config/electives', {
				params: { clerkshipId: String(clerkshipId) }
			});
			const electives = await api.expectJson<any[]>(response);

			assertions.hasMinLength(electives, 2);
		});

		test('should delete elective', async ({ request }) => {
			const api = createApiClient(request);

			const electiveData = fixtures.elective(clerkshipId);
			const createResponse = await api.post('/api/scheduling-config/electives', electiveData, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-config/electives/${created.id}`);
			await api.expectSuccess(deleteResponse);
		});
	});

	test.describe('Global Defaults', () => {
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();
			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(response, 201);
			clerkshipId = clerkship.id;
		});

		test('should get and update inpatient defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignment_strategy: 'prioritize_continuity',
				allow_cross_system: false
			};

			const updateResponse = await api.put('/api/scheduling-config/global-defaults/inpatient', defaults, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const updated = await api.expectJson(updateResponse);

			expect(updated.assignment_strategy).toBe('prioritize_continuity');

			// Get defaults
			const getResponse = await api.get('/api/scheduling-config/global-defaults/inpatient', {
				params: { clerkshipId: String(clerkshipId) }
			});
			const fetched = await api.expectJson(getResponse);

			expect(fetched.assignment_strategy).toBe('prioritize_continuity');
		});

		test('should get and update outpatient defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignment_strategy: 'balance_load',
				allow_cross_system: true
			};

			const response = await api.put('/api/scheduling-config/global-defaults/outpatient', defaults, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const updated = await api.expectJson(response);

			expect(updated.assignment_strategy).toBe('balance_load');
		});

		test('should get and update elective defaults', async ({ request }) => {
			const api = createApiClient(request);

			const defaults = {
				assignment_strategy: 'student_preference',
				allow_cross_system: true
			};

			const response = await api.put('/api/scheduling-config/global-defaults/elective', defaults, {
				params: { clerkshipId: String(clerkshipId) }
			} as any);
			const updated = await api.expectJson(response);

			expect(updated.assignment_strategy).toBe('student_preference');
		});
	});
});
