import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Preceptors API', () => {
	let healthSystemId: string;

	test.beforeEach(async ({ request }) => {
		// Create a health system for all preceptor tests (optional now but good for testing)
		const api = createApiClient(request);
		const hsData = fixtures.healthSystem();
		const response = await api.post('/api/scheduling-config/health-systems', hsData);
		const hs = await api.expectData(response, 201);
		healthSystemId = hs.id;
	});

	test.describe('POST /api/preceptors', () => {
		test('should create a new preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });

			const response = await api.post('/api/preceptors', preceptorData);
			const preceptor = await api.expectData(response, 201);

			assertions.crud.created(preceptor, {
				name: preceptorData.name,
				email: preceptorData.email
			});
		});

		test('should create preceptor with max_students', async ({ request }) => {
			const api = createApiClient(request);

			// Create preceptor with explicit max_students
			const preceptorData = fixtures.preceptor({
				health_system_id: healthSystemId,
				max_students: 5
			});

			const response = await api.post('/api/preceptors', preceptorData);
			const preceptor = await api.expectData(response, 201);

			expect(preceptor.health_system_id).toBe(healthSystemId);
			expect(preceptor.max_students).toBe(5);
		});

		test('should reject preceptor with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { name: 'Dr.' };

			const response = await api.post('/api/preceptors', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject duplicate email', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });

			await api.post('/api/preceptors', preceptorData);

			const response = await api.post('/api/preceptors', preceptorData);
			const error = await api.expectError(response, 409);

			assertions.hasErrorMessage(error);
		});
	});

	test.describe('GET /api/preceptors', () => {
		test('should list all preceptors', async ({ request }) => {
			const api = createApiClient(request);

			const p1 = fixtures.preceptor({ health_system_id: healthSystemId });
			const p2 = fixtures.preceptor({ health_system_id: healthSystemId });
			await api.post('/api/preceptors', p1);
			await api.post('/api/preceptors', p2);

			const response = await api.get('/api/preceptors');
			const preceptors = await api.expectData<any[]>(response);

			const items = assertions.hasItems(preceptors);
			assertions.hasMinLength(items, 2);
		});
	});

	test.describe('GET /api/preceptors/:id', () => {
		test('should get preceptor by id', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/preceptors/${created.id}`);
			const preceptor = await api.expectData(response);

			assertions.hasFields(preceptor, ['id', 'name', 'email']);
			expect(preceptor.id).toBe(created.id);
		});

		test('should return 404 for non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.get(`/api/preceptors/${nonExistentId}`);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/preceptors/:id', () => {
		test('should update preceptor fields', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				name: 'Dr. Updated Name'
			};

			const response = await api.patch(`/api/preceptors/${created.id}`, updates);
			const updated = await api.expectData(response);

			assertions.crud.updated(updated, updates);
		});

		test('should return 404 when updating non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.patch(`/api/preceptors/${nonExistentId}`, { name: 'Test' });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/preceptors/:id', () => {
		test('should delete preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/preceptors/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/preceptors/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.delete(`/api/preceptors/${nonExistentId}`);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full preceptor lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE preceptor
			const preceptorData = fixtures.preceptor({
				health_system_id: healthSystemId,
				max_students: 3
			});

			const createResponse = await api.post('/api/preceptors', preceptorData);
			const created = await api.expectData(createResponse, 201);
			const preceptorId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/preceptors/${preceptorId}`);
			const fetched = await api.expectData(getResponse);
			expect(fetched.health_system_id).toBe(healthSystemId);
			expect(fetched.max_students).toBe(3);

			// UPDATE
			const updateResponse = await api.patch(`/api/preceptors/${preceptorId}`, {
				max_students: 5
			});
			const updated = await api.expectData(updateResponse);
			expect(updated.max_students).toBe(5);

			// LIST
			const listResponse = await api.get('/api/preceptors');
			const preceptors = await api.expectData<any[]>(listResponse);
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
