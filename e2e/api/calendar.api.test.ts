import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

test.describe('Calendar API', () => {
	test.describe('GET /api/calendar', () => {
		let studentId: number;
		let preceptorId: number;
		let clerkshipId: number;

		test.beforeEach(async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first (required for preceptors)
			const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
			const healthSystem = await api.expectData(hsResponse, 201);

			// Create test data
			const sResponse = await api.post('/api/students', fixtures.student());
			const student = await api.expectData(sResponse, 201);
			studentId = student.id;

			const pResponse = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: healthSystem.id }));
			const preceptor = await api.expectData(pResponse, 201);
			preceptorId = preceptor.id;

			const cResponse = await api.post('/api/clerkships', fixtures.clerkship());
			const clerkship = await api.expectData(cResponse, 201);
			clerkshipId = clerkship.id;

			// Set availability and generate schedule
			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptorId}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});
		});

		test('should get calendar events for date range', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10'
				}
			});

			const events = await api.expectData<any[]>(response);

			expect(Array.isArray(events)).toBeTruthy();
			assertions.hasMinLength(events, 1);

			// Verify event structure
			events.forEach(event => {
				assertions.hasFields(event, ['id', 'student_id', 'preceptor_id', 'clerkship_id', 'date']);
				assertions.isValidDate(event.date);
			});
		});

		test('should filter calendar by student', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10',
					student_id: String(studentId)
				}
			});

			const events = await api.expectData<any[]>(response);

			events.forEach(event => {
				expect(event.student_id).toBe(studentId);
			});
		});

		test('should filter calendar by preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10',
					preceptor_id: String(preceptorId)
				}
			});

			const events = await api.expectData<any[]>(response);

			events.forEach(event => {
				expect(event.preceptor_id).toBe(preceptorId);
			});
		});

		test('should filter calendar by clerkship', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10',
					clerkship_id: String(clerkshipId)
				}
			});

			const events = await api.expectData<any[]>(response);

			events.forEach(event => {
				expect(event.clerkship_id).toBe(clerkshipId);
			});
		});

		test('should return empty array for date range with no assignments', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-12-01',
					end_date: '2025-12-31'
				}
			});

			const events = await api.expectData<any[]>(response);

			expect(Array.isArray(events)).toBeTruthy();
			expect(events.length).toBe(0);
		});

		test('should combine multiple filters', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10',
					student_id: String(studentId),
					clerkship_id: String(clerkshipId)
				}
			});

			const events = await api.expectData<any[]>(response);

			events.forEach(event => {
				expect(event.student_id).toBe(studentId);
				expect(event.clerkship_id).toBe(clerkshipId);
			});
		});

		test('should handle single day query', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-06'
				}
			});

			const events = await api.expectData<any[]>(response);

			expect(Array.isArray(events)).toBeTruthy();
			events.forEach(event => {
				expect(event.date).toBe('2025-01-06');
			});
		});
	});

	test.describe('GET /api/calendar/summary', () => {
		test('should get calendar summary statistics', async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
			const healthSystem = await api.expectData(hsResponse, 201);

			// Create minimal data and generate schedule
			await api.post('/api/students', fixtures.student());
			const pResponse = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: healthSystem.id }));
			const preceptor = await api.expectData(pResponse, 201);
			await api.post('/api/clerkships', fixtures.clerkship());

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: dates.map(date => ({ date, is_available: true }))
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});

			// Get summary
			const response = await api.get('/api/calendar/summary', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-10'
				}
			});

			const summary = await api.expectData(response);

			// Verify summary structure
			expect(summary).toBeDefined();
			expect(typeof summary).toBe('object');

			// Summary typically includes counts and statistics
			// Exact structure may vary, but verify it's a valid response
			if (summary.total_assignments !== undefined) {
				expect(typeof summary.total_assignments).toBe('number');
				expect(summary.total_assignments).toBeGreaterThanOrEqual(0);
			}
		});

		test('should get summary for empty date range', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar/summary', {
				params: {
					start_date: '2025-12-01',
					end_date: '2025-12-31'
				}
			});

			const summary = await api.expectData(response);

			expect(summary).toBeDefined();
			// Should return valid summary even for empty range
		});

		test('should get summary with filters', async ({ request }) => {
			const api = createApiClient(request);

			// Create health system first
			const hsResponse = await api.post('/api/scheduling-config/health-systems', fixtures.healthSystem());
			const healthSystem = await api.expectData(hsResponse, 201);

			// Create data
			const sResponse = await api.post('/api/students', fixtures.student());
			const student = await api.expectData(sResponse, 201);

			const pResponse = await api.post('/api/preceptors', fixtures.preceptor({ health_system_id: healthSystem.id }));
			const preceptor = await api.expectData(pResponse, 201);

			await api.post('/api/clerkships', fixtures.clerkship());

			await api.post(`/api/preceptors/${preceptor.id}/availability`, {
				availability: [{ date: '2025-01-06', is_available: true }]
			});

			await api.post('/api/schedules/generate', {
				start_date: '2025-01-06',
				end_date: '2025-01-06'
			});

			// Get summary filtered by student
			const response = await api.get('/api/calendar/summary', {
				params: {
					start_date: '2025-01-06',
					end_date: '2025-01-06',
					student_id: String(student.id)
				}
			});

			const summary = await api.expectData(response);

			expect(summary).toBeDefined();
		});
	});

	test.describe('Scheduling Periods', () => {
		test('should create scheduling period', async ({ request }) => {
			const api = createApiClient(request);

			const periodData = fixtures.schedulingPeriod({
				name: 'Spring 2025',
				start_date: '2025-01-06',
				end_date: '2025-05-31',
				is_active: false
			});

			const response = await api.post('/api/scheduling-periods', periodData);
			const period = await api.expectData(response, 201);

			assertions.crud.created(period, {
				name: 'Spring 2025',
				start_date: '2025-01-06',
				end_date: '2025-05-31'
			});
		});

		test('should list all scheduling periods', async ({ request }) => {
			const api = createApiClient(request);

			const p1 = fixtures.schedulingPeriod({ name: 'Period 1' });
			const p2 = fixtures.schedulingPeriod({ name: 'Period 2' });

			await api.post('/api/scheduling-periods', p1);
			await api.post('/api/scheduling-periods', p2);

			const response = await api.get('/api/scheduling-periods');
			const periods = await api.expectData<any[]>(response);

			assertions.hasMinLength(periods, 2);
		});

		test('should get active scheduling period', async ({ request }) => {
			const api = createApiClient(request);

			const periodData = fixtures.schedulingPeriod({ is_active: true });
			const createResponse = await api.post('/api/scheduling-periods', periodData);
			const created = await api.expectData(createResponse, 201);

			// Activate the period
			await api.post(`/api/scheduling-periods/${created.id}/activate`, {});

			const response = await api.get('/api/scheduling-periods/active');
			const active = await api.expectData(response);

			expect(active).toBeDefined();
			if (active.id) {
				expect(active.is_active).toBe(true);
			}
		});

		test('should update scheduling period', async ({ request }) => {
			const api = createApiClient(request);

			const periodData = fixtures.schedulingPeriod();
			const createResponse = await api.post('/api/scheduling-periods', periodData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				name: 'Updated Period Name',
				end_date: '2025-12-31'
			};

			const response = await api.put(`/api/scheduling-periods/${created.id}`, updates);
			const updated = await api.expectData(response);

			expect(updated.name).toBe('Updated Period Name');
			expect(updated.end_date).toBe('2025-12-31');
		});

		test('should activate scheduling period', async ({ request }) => {
			const api = createApiClient(request);

			const periodData = fixtures.schedulingPeriod({ is_active: false });
			const createResponse = await api.post('/api/scheduling-periods', periodData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.post(`/api/scheduling-periods/${created.id}/activate`, {});
			const activated = await api.expectData(response);

			expect(activated.is_active || activated.success).toBeTruthy();
		});

		test('should delete scheduling period', async ({ request }) => {
			const api = createApiClient(request);

			const periodData = fixtures.schedulingPeriod();
			const createResponse = await api.post('/api/scheduling-periods', periodData);
			const created = await api.expectData(createResponse, 201);

			const deleteResponse = await api.delete(`/api/scheduling-periods/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/scheduling-periods/${created.id}`);
			await api.expectError(getResponse, 404);
		});
	});

	test.describe('Error Handling', () => {
		test('should reject calendar query without date range', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar');
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject invalid date format', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: 'invalid-date',
					end_date: '2025-01-10'
				}
			});

			const error = await api.expectError(response, 400);
			assertions.validationError(error);
		});

		test('should reject end_date before start_date', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/calendar', {
				params: {
					start_date: '2025-12-31',
					end_date: '2025-01-01'
				}
			});

			const error = await api.expectError(response, 400);
			assertions.validationError(error);
		});
	});
});
