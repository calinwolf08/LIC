import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Clerkships API', () => {
	test.describe('POST /api/clerkships', () => {
		test('should create a new clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(response, 201);

			assertions.crud.created(clerkship, {
				name: clerkshipData.name,
				specialty: clerkshipData.specialty,
				clerkship_type: clerkshipData.clerkship_type,
				required_days: clerkshipData.required_days
			});
		});

		test('should create clerkship with description', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship({
				description: 'Test description for clerkship'
			});

			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(response, 201);

			expect(clerkship.description).toBe('Test description for clerkship');
		});

		test('should create outpatient clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship({
				clerkship_type: 'outpatient',
				required_days: 14
			});

			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectData(response, 201);

			expect(clerkship.clerkship_type).toBe('outpatient');
			expect(clerkship.required_days).toBe(14);
		});

		test('should reject clerkship with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { name: 'Test' };

			const response = await api.post('/api/clerkships', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject clerkship with invalid clerkship_type', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = {
				name: 'Test Clerkship',
				clerkship_type: 'invalid_type',
				required_days: 28
			};

			const response = await api.post('/api/clerkships', clerkshipData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('GET /api/clerkships', () => {
		test('should list all clerkships', async ({ request }) => {
			const api = createApiClient(request);

			const c1 = fixtures.clerkship({ specialty: 'Family Medicine' });
			const c2 = fixtures.clerkship({ specialty: 'Surgery' });
			await api.post('/api/clerkships', c1);
			await api.post('/api/clerkships', c2);

			const response = await api.get('/api/clerkships');
			const clerkships = await api.expectData<any[]>(response);

			const items = assertions.hasItems(clerkships);
			assertions.hasMinLength(items, 2);
		});

		test('should filter clerkships by specialty', async ({ request }) => {
			const api = createApiClient(request);

			const fm = fixtures.clerkship({ specialty: 'Family Medicine' });
			const surgery = fixtures.clerkship({ specialty: 'Surgery' });

			await api.post('/api/clerkships', fm);
			await api.post('/api/clerkships', surgery);

			const response = await api.get('/api/clerkships', {
				params: { specialty: 'Family Medicine' }
			});
			const clerkships = await api.expectData<any[]>(response);

			const items = assertions.hasItems(clerkships);
			items.forEach(c => {
				expect(c.specialty).toBe('Family Medicine');
			});
		});
	});

	test.describe('GET /api/clerkships/:id', () => {
		test('should get clerkship by id', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/clerkships/${created.id}`);
			const clerkship = await api.expectData(response);

			assertions.hasFields(clerkship, ['id', 'name', 'clerkship_type', 'required_days']);
			expect(clerkship.id).toBe(created.id);
		});

		test('should return 404 for non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.get(`/api/clerkships/${nonExistentId}`);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/clerkships/:id', () => {
		test('should update clerkship fields', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				required_days: 42,
				description: 'Updated description'
			};

			const response = await api.patch(`/api/clerkships/${created.id}`, updates);
			const updated = await api.expectData(response);

			assertions.crud.updated(updated, updates);
		});

		test('should update clerkship_type', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship({ clerkship_type: 'inpatient' });

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.patch(`/api/clerkships/${created.id}`, {
				clerkship_type: 'outpatient'
			});
			const updated = await api.expectData(response);

			expect(updated.clerkship_type).toBe('outpatient');
		});

		test('should return 404 when updating non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.patch(`/api/clerkships/${nonExistentId}`, { required_days: 35 });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/clerkships/:id', () => {
		test('should delete clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/clerkships/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/clerkships/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const nonExistentId = '00000000-0000-0000-0000-000000000000';

			const response = await api.delete(`/api/clerkships/${nonExistentId}`);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full clerkship lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE - Use fixture-generated unique name to avoid conflicts
			const clerkshipData = fixtures.clerkship({
				specialty: 'Family Medicine',
				clerkship_type: 'inpatient',
				required_days: 28,
				description: 'Core family medicine rotation'
			});

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectData(createResponse, 201);
			const clerkshipId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/clerkships/${clerkshipId}`);
			const fetched = await api.expectData(getResponse);
			expect(fetched.name).toBe(clerkshipData.name);
			expect(fetched.required_days).toBe(28);
			expect(fetched.description).toBe('Core family medicine rotation');

			// UPDATE
			const updateResponse = await api.patch(`/api/clerkships/${clerkshipId}`, {
				required_days: 42,
				clerkship_type: 'outpatient'
			});
			const updated = await api.expectData(updateResponse);
			expect(updated.required_days).toBe(42);
			expect(updated.clerkship_type).toBe('outpatient');

			// LIST with filter
			const listResponse = await api.get('/api/clerkships', {
				params: { specialty: 'Family Medicine' }
			});
			const clerkships = await api.expectData<any[]>(listResponse);
			const items = assertions.hasItems(clerkships);
			assertions.containsWhere(items, c => c.id === clerkshipId);

			// DELETE
			const deleteResponse = await api.delete(`/api/clerkships/${clerkshipId}`);
			await api.expectSuccess(deleteResponse);

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/clerkships/${clerkshipId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
