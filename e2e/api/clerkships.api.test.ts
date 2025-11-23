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
			const clerkship = await api.expectJson(response, 201);

			assertions.crud.created(clerkship, {
				name: clerkshipData.name,
				specialty: clerkshipData.specialty,
				duration_weeks: clerkshipData.duration_weeks
			});
		});

		test('should create clerkship with inpatient and outpatient days', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship({
				inpatient_days: 10,
				outpatient_days: 10
			});

			const response = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(response, 201);

			expect(clerkship.inpatient_days).toBe(10);
			expect(clerkship.outpatient_days).toBe(10);
		});

		test('should reject clerkship with missing required fields', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = { name: 'Test' };

			const response = await api.post('/api/clerkships', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject clerkship with invalid date range', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship({
				start_date: '2025-12-31',
				end_date: '2025-01-01' // End before start
			});

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
			const clerkships = await api.expectJson<any[]>(response);

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
			const clerkships = await api.expectJson<any[]>(response);

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
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/clerkships/${created.id}`);
			const clerkship = await api.expectJson(response);

			assertions.hasFields(clerkship, ['id', 'name', 'specialty', 'duration_weeks', 'start_date', 'end_date']);
			expect(clerkship.id).toBe(created.id);
		});

		test('should return 404 for non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/clerkships/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/clerkships/:id', () => {
		test('should update clerkship fields', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectJson(createResponse, 201);

			const updates = {
				duration_weeks: 6,
				inpatient_days: 15
			};

			const response = await api.patch(`/api/clerkships/${created.id}`, updates);
			const updated = await api.expectJson(response);

			assertions.crud.updated(updated, updates);
		});

		test('should return 404 when updating non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/clerkships/999999', { duration_weeks: 5 });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/clerkships/:id', () => {
		test('should delete clerkship', async ({ request }) => {
			const api = createApiClient(request);
			const clerkshipData = fixtures.clerkship();

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/clerkships/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/clerkships/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/clerkships/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full clerkship lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const clerkshipData = fixtures.clerkship({
				name: 'Family Medicine Clerkship',
				specialty: 'Family Medicine',
				duration_weeks: 4,
				inpatient_days: 10,
				outpatient_days: 10
			});

			const createResponse = await api.post('/api/clerkships', clerkshipData);
			const created = await api.expectJson(createResponse, 201);
			const clerkshipId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/clerkships/${clerkshipId}`);
			const fetched = await api.expectJson(getResponse);
			expect(fetched.name).toBe(clerkshipData.name);
			expect(fetched.inpatient_days).toBe(10);
			expect(fetched.outpatient_days).toBe(10);

			// UPDATE
			const updateResponse = await api.patch(`/api/clerkships/${clerkshipId}`, {
				duration_weeks: 6,
				inpatient_days: 15
			});
			const updated = await api.expectJson(updateResponse);
			expect(updated.duration_weeks).toBe(6);
			expect(updated.inpatient_days).toBe(15);

			// LIST
			const listResponse = await api.get('/api/clerkships', {
				params: { specialty: 'Family Medicine' }
			});
			const clerkships = await api.expectJson<any[]>(listResponse);
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
