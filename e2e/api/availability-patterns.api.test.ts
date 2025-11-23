import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

test.describe('Availability & Patterns API', () => {
	let preceptorId: number;

	test.beforeEach(async ({ request }) => {
		// Create a preceptor for tests
		const api = createApiClient(request);
		const preceptorData = fixtures.preceptor();
		const response = await api.post('/api/preceptors', preceptorData);
		const preceptor = await api.expectJson(response, 201);
		preceptorId = preceptor.id;
	});

	test.describe('Availability Management', () => {
		test('should set preceptor availability for date range', async ({ request }) => {
			const api = createApiClient(request);

			const startDate = '2025-01-06';
			const endDate = '2025-01-10';
			const dates = dateHelpers.getDateRange(startDate, endDate);

			const availabilityData = dates.map(date => ({
				date,
				is_available: true
			}));

			const response = await api.post(`/api/preceptors/${preceptorId}/availability`, {
				availability: availabilityData
			});
			await api.expectSuccess(response);

			// Verify availability was set
			const getResponse = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: startDate, end_date: endDate }
			});
			const availability = await api.expectJson<any[]>(getResponse);

			assertions.hasLength(availability, dates.length);
			availability.forEach(a => {
				expect(a.is_available).toBe(true);
			});
		});

		test('should get availability for specific date range', async ({ request }) => {
			const api = createApiClient(request);

			const startDate = '2025-01-06';
			const endDate = '2025-01-10';

			const response = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: startDate, end_date: endDate }
			});
			const availability = await api.expectJson<any[]>(response);

			expect(Array.isArray(availability)).toBeTruthy();
			// Verify all returned dates are within range
			availability.forEach(a => {
				expect(a.date >= startDate && a.date <= endDate).toBeTruthy();
			});
		});

		test('should handle bulk availability updates', async ({ request }) => {
			const api = createApiClient(request);

			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-31');
			const availabilityData = dates.map((date, index) => ({
				date,
				is_available: index % 2 === 0 // Alternate availability
			}));

			const response = await api.post(`/api/preceptors/${preceptorId}/availability`, {
				availability: availabilityData
			});
			await api.expectSuccess(response);

			// Verify pattern
			const getResponse = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: '2025-01-06', end_date: '2025-01-31' }
			});
			const availability = await api.expectJson<any[]>(getResponse);

			const available = availability.filter(a => a.is_available);
			const unavailable = availability.filter(a => !a.is_available);

			expect(available.length).toBeGreaterThan(0);
			expect(unavailable.length).toBeGreaterThan(0);
		});
	});

	test.describe('Pattern Creation and Management', () => {
		test('should create a weekly availability pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_name: 'Monday-Friday',
				pattern_type: 'weekly',
				week_pattern: [true, true, true, true, true, false, false] // M-F available
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectJson(response, 201);

			assertions.crud.created(pattern, {
				preceptor_id: preceptorId,
				pattern_name: 'Monday-Friday',
				pattern_type: 'weekly'
			});

			expect(pattern.week_pattern).toBeDefined();
			expect(pattern.week_pattern).toHaveLength(7);
		});

		test('should create a monthly pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_name: 'First 15 days',
				pattern_type: 'monthly',
				month_pattern: Array.from({ length: 15 }, (_, i) => i + 1) // Days 1-15
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectJson(response, 201);

			expect(pattern.pattern_type).toBe('monthly');
			expect(pattern.month_pattern).toBeDefined();
			expect(pattern.month_pattern.length).toBe(15);
		});

		test('should create an interval pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_name: 'Every other day',
				pattern_type: 'interval',
				interval: 2 // Every 2 days
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectJson(response, 201);

			expect(pattern.pattern_type).toBe('interval');
			expect(pattern.interval).toBe(2);
		});

		test('should list all patterns for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			// Create multiple patterns
			const pattern1 = fixtures.pattern(preceptorId, { pattern_name: 'Pattern 1' });
			const pattern2 = fixtures.pattern(preceptorId, { pattern_name: 'Pattern 2' });

			await api.post(`/api/preceptors/${preceptorId}/patterns`, pattern1);
			await api.post(`/api/preceptors/${preceptorId}/patterns`, pattern2);

			const response = await api.get(`/api/preceptors/${preceptorId}/patterns`);
			const patterns = await api.expectJson<any[]>(response);

			assertions.hasMinLength(patterns, 2);
		});

		test('should get specific pattern by id', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId);
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/preceptors/${preceptorId}/patterns/${created.id}`);
			const pattern = await api.expectJson(response);

			expect(pattern.id).toBe(created.id);
			expect(pattern.pattern_name).toBe(patternData.pattern_name);
		});

		test('should update pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId);
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectJson(createResponse, 201);

			const updates = {
				pattern_name: 'Updated Pattern',
				week_pattern: [false, true, false, true, false, true, false]
			};

			const response = await api.put(`/api/preceptors/${preceptorId}/patterns/${created.id}`, updates);
			const updated = await api.expectJson(response);

			expect(updated.pattern_name).toBe('Updated Pattern');
			expect(updated.week_pattern).toEqual(updates.week_pattern);
		});

		test('should delete pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId);
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/preceptors/${preceptorId}/patterns/${created.id}`);
			await api.expectSuccess(deleteResponse);

			// Verify deleted
			const getResponse = await api.get(`/api/preceptors/${preceptorId}/patterns/${created.id}`);
			await api.expectError(getResponse, 404);
		});
	});

	test.describe('Pattern Generation', () => {
		test('should generate availability from weekly pattern', async ({ request }) => {
			const api = createApiClient(request);

			// Create weekly pattern
			const patternData = fixtures.pattern(preceptorId, {
				pattern_name: 'Weekdays only',
				pattern_type: 'weekly',
				start_date: '2025-01-06', // Monday
				end_date: '2025-01-17', // Two weeks
				week_pattern: [true, true, true, true, true, false, false]
			});

			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectJson(createResponse, 201);

			// Generate availability
			const generateResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/generate`, {
				pattern_id: pattern.id
			});
			const result = await api.expectJson(generateResponse);

			expect(result.generated_count).toBeGreaterThan(0);

			// Verify availability was generated
			const availResponse = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: '2025-01-06', end_date: '2025-01-17' }
			});
			const availability = await api.expectJson<any[]>(availResponse);

			// Should have 10 available days (2 weeks * 5 weekdays)
			const availableDays = availability.filter(a => a.is_available);
			expect(availableDays.length).toBe(10);
		});

		test('should save existing availability as pattern', async ({ request }) => {
			const api = createApiClient(request);

			// Set some availability
			const dates = dateHelpers.getDateRange('2025-01-06', '2025-01-10');
			const availabilityData = dates.map(date => ({
				date,
				is_available: true
			}));

			await api.post(`/api/preceptors/${preceptorId}/availability`, {
				availability: availabilityData
			});

			// Save as pattern
			const saveResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/save`, {
				pattern_name: 'Saved Pattern',
				start_date: '2025-01-06',
				end_date: '2025-01-10'
			});
			const pattern = await api.expectJson(saveResponse, 201);

			expect(pattern.pattern_name).toBe('Saved Pattern');
			assertions.hasId(pattern);
		});
	});

	test.describe('Error Handling', () => {
		test('should reject pattern with invalid date range', async ({ request }) => {
			const api = createApiClient(request);

			const invalidPattern = fixtures.pattern(preceptorId, {
				start_date: '2025-12-31',
				end_date: '2025-01-01' // End before start
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, invalidPattern);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should return 404 for pattern on non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/preceptors/999999/patterns');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});

		test('should reject weekly pattern without week_pattern', async ({ request }) => {
			const api = createApiClient(request);

			const invalidPattern = {
				preceptor_id: preceptorId,
				pattern_name: 'Invalid',
				pattern_type: 'weekly',
				start_date: '2025-01-06',
				end_date: '2025-01-31'
				// Missing week_pattern
			};

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, invalidPattern);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('Full workflow', () => {
		test('should complete pattern creation to availability generation', async ({ request }) => {
			const api = createApiClient(request);

			// 1. Create pattern
			const patternData = fixtures.pattern(preceptorId, {
				pattern_name: 'Mon-Wed-Fri',
				pattern_type: 'weekly',
				start_date: '2025-01-06',
				end_date: '2025-01-31',
				week_pattern: [true, false, true, false, true, false, false]
			});

			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectJson(createResponse, 201);
			const patternId = assertions.hasId(pattern);

			// 2. Generate availability
			const generateResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/generate`, {
				pattern_id: patternId
			});
			const genResult = await api.expectJson(generateResponse);
			expect(genResult.generated_count).toBeGreaterThan(0);

			// 3. Verify availability
			const availResponse = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: '2025-01-06', end_date: '2025-01-31' }
			});
			const availability = await api.expectJson<any[]>(availResponse);

			const availableDays = availability.filter(a => a.is_available);
			// January 2025 has 4 complete weeks (12 M-W-F days) starting from Monday Jan 6
			expect(availableDays.length).toBeGreaterThan(10);

			// 4. Update pattern
			const updateResponse = await api.put(`/api/preceptors/${preceptorId}/patterns/${patternId}`, {
				pattern_name: 'Updated Mon-Wed-Fri'
			});
			const updated = await api.expectJson(updateResponse);
			expect(updated.pattern_name).toBe('Updated Mon-Wed-Fri');

			// 5. Delete pattern
			const deleteResponse = await api.delete(`/api/preceptors/${preceptorId}/patterns/${patternId}`);
			await api.expectSuccess(deleteResponse);

			// 6. Verify pattern deleted
			const verifyResponse = await api.get(`/api/preceptors/${preceptorId}/patterns/${patternId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
