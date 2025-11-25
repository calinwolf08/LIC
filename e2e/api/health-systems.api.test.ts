import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Health Systems API', () => {
	test.describe('POST /api/scheduling-config/health-systems', () => {
		test('should create a new health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const response = await api.post('/api/scheduling-config/health-systems', hsData);
			const healthSystem = await api.expectData(response, 201);

			assertions.crud.created(healthSystem, {
				name: hsData.name
			});
			expect(healthSystem.location).toBeDefined();
		});

		test('should create health system with description', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem({
				description: 'Large university hospital system'
			});

			const response = await api.post('/api/scheduling-config/health-systems', hsData);
			const healthSystem = await api.expectData(response, 201);

			expect(healthSystem.description).toBe('Large university hospital system');
		});

		test('should reject health system with missing name', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = {
				location: 'New York'
			};

			const response = await api.post('/api/scheduling-config/health-systems', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('GET /api/scheduling-config/health-systems', () => {
		test('should list all health systems', async ({ request }) => {
			const api = createApiClient(request);

			const hs1 = fixtures.healthSystem({ location: 'New York' });
			const hs2 = fixtures.healthSystem({ location: 'Boston' });
			await api.post('/api/scheduling-config/health-systems', hs1);
			await api.post('/api/scheduling-config/health-systems', hs2);

			const response = await api.get('/api/scheduling-config/health-systems');
			const healthSystems = await api.expectData<any[]>(response);

			const items = assertions.hasItems(healthSystems);
			assertions.hasMinLength(items, 2);
		});
	});

	test.describe('GET /api/scheduling-config/health-systems/:id', () => {
		test('should get health system by id', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/scheduling-config/health-systems/${created.id}`);
			const healthSystem = await api.expectData(response);

			assertions.hasFields(healthSystem, ['id', 'name', 'location']);
			expect(healthSystem.id).toBe(created.id);
		});

		test('should return 404 for non-existent health system', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = 'nonexistent123456';

			const response = await api.get(`/api/scheduling-config/health-systems/${nonExistentId}`);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/scheduling-config/health-systems/:id', () => {
		test('should update health system fields', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				location: 'Los Angeles',
				description: 'Updated description'
			};

			const response = await api.patch(
				`/api/scheduling-config/health-systems/${created.id}`,
				updates
			);
			const updated = await api.expectData(response);

			assertions.crud.updated(updated, updates);
		});

		test('should return 404 when updating non-existent health system', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = 'nonexistent123456';

			const response = await api.patch(`/api/scheduling-config/health-systems/${nonExistentId}`, {
				location: 'Chicago'
			});
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/scheduling-config/health-systems/:id', () => {
		test('should delete health system', async ({ request }) => {
			const api = createApiClient(request);
			const hsData = fixtures.healthSystem();

			const createResponse = await api.post('/api/scheduling-config/health-systems', hsData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(
				`/api/scheduling-config/health-systems/${created.id}`
			);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/scheduling-config/health-systems/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent health system', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = 'nonexistent123456';

			const response = await api.delete(
				`/api/scheduling-config/health-systems/${nonExistentId}`
			);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});
});
