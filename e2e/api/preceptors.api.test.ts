import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Preceptors API', () => {
	test.describe('POST /api/preceptors', () => {
		test('should create a new preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor();

			const response = await api.post('/api/preceptors', preceptorData);
			const preceptor = await api.expectJson(response, 201);

			assertions.crud.created(preceptor, {
				first_name: preceptorData.first_name,
				last_name: preceptorData.last_name,
				email: preceptorData.email,
				specialty: preceptorData.specialty
			});
		});

		test('should create preceptor with health system and site', async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const healthSystemData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', healthSystemData);
			const healthSystem = await api.expectJson(hsResponse, 201);

			// Create site
			const siteData = fixtures.site({ health_system_id: healthSystem.id });
			const siteResponse = await api.post('/api/sites', siteData);
			const site = await api.expectJson(siteResponse, 201);

			// Create preceptor
			const preceptorData = fixtures.preceptor({
				health_system_id: healthSystem.id,
				site_id: site.id
			});

			const response = await api.post('/api/preceptors', preceptorData);
			const preceptor = await api.expectJson(response, 201);

			expect(preceptor.health_system_id).toBe(healthSystem.id);
			expect(preceptor.site_id).toBe(site.id);
		});

		test('should reject preceptor with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { first_name: 'Dr.' };

			const response = await api.post('/api/preceptors', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject duplicate email', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor();

			await api.post('/api/preceptors', preceptorData);

			const response = await api.post('/api/preceptors', preceptorData);
			const error = await api.expectError(response, 409);

			assertions.hasErrorMessage(error);
		});
	});

	test.describe('GET /api/preceptors', () => {
		test('should list all preceptors', async ({ request }) => {
			const api = createApiClient(request);

			const p1 = fixtures.preceptor({ specialty: 'Family Medicine' });
			const p2 = fixtures.preceptor({ specialty: 'Surgery' });
			await api.post('/api/preceptors', p1);
			await api.post('/api/preceptors', p2);

			const response = await api.get('/api/preceptors');
			const preceptors = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(preceptors);
			assertions.hasMinLength(items, 2);
		});

		test('should filter preceptors by specialty', async ({ request }) => {
			const api = createApiClient(request);

			const fm1 = fixtures.preceptor({ specialty: 'Family Medicine' });
			const fm2 = fixtures.preceptor({ specialty: 'Family Medicine' });
			const surgery = fixtures.preceptor({ specialty: 'Surgery' });

			await api.post('/api/preceptors', fm1);
			await api.post('/api/preceptors', fm2);
			await api.post('/api/preceptors', surgery);

			const response = await api.get('/api/preceptors', {
				params: { specialty: 'Family Medicine' }
			});
			const preceptors = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(preceptors);
			items.forEach(p => {
				expect(p.specialty).toBe('Family Medicine');
			});
		});
	});

	test.describe('GET /api/preceptors/:id', () => {
		test('should get preceptor by id', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor();

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/preceptors/${created.id}`);
			const preceptor = await api.expectJson(response);

			assertions.hasFields(preceptor, ['id', 'first_name', 'last_name', 'email', 'specialty']);
			expect(preceptor.id).toBe(created.id);
		});

		test('should return 404 for non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/preceptors/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/preceptors/:id', () => {
		test('should update preceptor fields', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ specialty: 'Family Medicine' });

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectJson(createResponse, 201);

			const updates = {
				specialty: 'Surgery',
				first_name: 'Updated'
			};

			const response = await api.patch(`/api/preceptors/${created.id}`, updates);
			const updated = await api.expectJson(response);

			assertions.crud.updated(updated, updates);
		});

		test('should return 404 when updating non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/preceptors/999999', { specialty: 'Test' });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/preceptors/:id', () => {
		test('should delete preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor();

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/preceptors/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/preceptors/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/preceptors/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full preceptor lifecycle with associations', async ({ request }) => {
			const api = createApiClient(request);

			// Create dependencies
			const hsData = fixtures.healthSystem();
			const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const hs = await api.expectJson(hsResponse, 201);

			const siteData = fixtures.site({ health_system_id: hs.id });
			const siteResponse = await api.post('/api/sites', siteData);
			const site = await api.expectJson(siteResponse, 201);

			// CREATE preceptor
			const preceptorData = fixtures.preceptor({
				specialty: 'Family Medicine',
				health_system_id: hs.id,
				site_id: site.id
			});

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectJson(createResponse, 201);
			const preceptorId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/preceptors/${preceptorId}`);
			const fetched = await api.expectJson(getResponse);
			expect(fetched.health_system_id).toBe(hs.id);
			expect(fetched.site_id).toBe(site.id);

			// UPDATE
			const updateResponse = await api.patch(`/api/preceptors/${preceptorId}`, {
				specialty: 'Surgery'
			});
			const updated = await api.expectJson(updateResponse);
			expect(updated.specialty).toBe('Surgery');

			// LIST with filter
			const listResponse = await api.get('/api/preceptors', {
				params: { specialty: 'Surgery' }
			});
			const preceptors = await api.expectJson<any[]>(listResponse);
			const items = assertions.hasItems(preceptors);
			assertions.containsWhere(items, p => p.id === preceptorId);

			// DELETE
			const deleteResponse = await api.delete(`/api/preceptors/${preceptorId}`);
			await api.expectSuccess(deleteResponse);

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/preceptors/${preceptorId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
