import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions, dateHelpers } from './helpers/assertions';

test.describe('Availability & Patterns API', () => {
	let preceptorId: string;
	let healthSystemId: string;

	test.beforeEach(async ({ request }) => {
		// Create a health system and preceptor for tests
		const api = createApiClient(request);

		const hsData = fixtures.healthSystem();
		const hsResponse = await api.post('/api/scheduling-config/health-systems', hsData);
		const hs = await api.expectData(hsResponse, 201);
		healthSystemId = hs.id;

		const preceptorData = fixtures.preceptor({ health_system_id: healthSystemId });
		const response = await api.post('/api/preceptors', preceptorData);
		const preceptor = await api.expectData(response, 201);
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
			const availability = await api.expectData<any[]>(getResponse);

			assertions.hasLength(availability, dates.length);
			availability.forEach(a => {
				expect(a.is_available).toBeTruthy(); // SQLite stores booleans as 0/1
			});
		});

		test('should get availability for specific date range', async ({ request }) => {
			const api = createApiClient(request);

			const startDate = '2025-01-06';
			const endDate = '2025-01-10';

			const response = await api.get(`/api/preceptors/${preceptorId}/availability`, {
				params: { start_date: startDate, end_date: endDate }
			});
			const availability = await api.expectData<any[]>(response);

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
			const availability = await api.expectData<any[]>(getResponse);

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
				pattern_type: 'weekly',
				is_available: true,
				config: {
					days_of_week: [0, 1, 2, 3, 4] // Monday-Friday (0=Mon, 6=Sun)
				}
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectData(response, 201);

			expect(pattern.preceptor_id).toBe(preceptorId);
			expect(pattern.pattern_type).toBe('weekly');
			expect(pattern.is_available).toBeTruthy();
			expect(pattern.config).toBeDefined();
			expect(pattern.config.days_of_week).toEqual([0, 1, 2, 3, 4]);
		});

		test('should create a monthly pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_type: 'monthly',
				is_available: true,
				config: {
					monthly_type: 'specific_days',
					specific_days: Array.from({ length: 15 }, (_, i) => i + 1) // Days 1-15
				}
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectData(response, 201);

			expect(pattern.pattern_type).toBe('monthly');
			expect(pattern.config).toBeDefined();
			expect(pattern.config.specific_days).toHaveLength(15);
		});

		test('should create a block pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_type: 'block',
				is_available: true,
				date_range_start: '2025-02-01',
				date_range_end: '2025-02-28',
				config: {
					exclude_weekends: true
				}
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectData(response, 201);

			expect(pattern.pattern_type).toBe('block');
			expect(pattern.config).toBeDefined();
			expect(pattern.config.exclude_weekends).toBe(true);
		});

		test('should list all patterns for preceptor', async ({ request }) => {
			const api = createApiClient(request);

			// Create multiple patterns
			const pattern1 = fixtures.pattern(preceptorId, {
				pattern_type: 'weekly',
				config: { days_of_week: [0, 1, 2] }
			});
			const pattern2 = fixtures.pattern(preceptorId, {
				pattern_type: 'block',
				date_range_start: '2025-03-01',
				date_range_end: '2025-03-15',
				config: { exclude_weekends: false }
			});

			await api.post(`/api/preceptors/${preceptorId}/patterns`, pattern1);
			await api.post(`/api/preceptors/${preceptorId}/patterns`, pattern2);

			const response = await api.get(`/api/preceptors/${preceptorId}/patterns`);
			const patterns = await api.expectData<any[]>(response);

			assertions.hasMinLength(patterns, 2);
		});

		test('should get specific pattern by id', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId);
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectData(createResponse, 201);

			const response = await api.get(`/api/preceptors/${preceptorId}/patterns/${created.id}`);
			const pattern = await api.expectData(response);

			expect(pattern.id).toBe(created.id);
			expect(pattern.pattern_type).toBe(patternData.pattern_type);
		});

		test('should update pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId, {
				pattern_type: 'weekly',
				config: { days_of_week: [0, 1, 2, 3, 4] }
			});
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectData(createResponse, 201);

			const updates = {
				config: {
					days_of_week: [1, 3, 5] // Tue, Thu, Sat
				},
				reason: 'Updated availability'
			};

			const response = await api.put(`/api/preceptors/${preceptorId}/patterns/${created.id}`, updates);
			const updated = await api.expectData(response);

			expect(updated.config.days_of_week).toEqual([1, 3, 5]);
			expect(updated.reason).toBe('Updated availability');
		});

		test('should delete pattern', async ({ request }) => {
			const api = createApiClient(request);

			const patternData = fixtures.pattern(preceptorId);
			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const created = await api.expectData(createResponse, 201);

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
				pattern_type: 'weekly',
				is_available: true,
				date_range_start: '2025-01-06', // Monday
				date_range_end: '2025-01-17', // Two weeks
				config: {
					days_of_week: [0, 1, 2, 3, 4] // Monday-Friday
				}
			});

			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectData(createResponse, 201);

			// Generate availability from all patterns
			const generateResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/generate`);
			const result = await api.expectData(generateResponse);

			// Check that dates were generated
			expect(result.generated_dates || result.preview?.length || 0).toBeGreaterThan(0);
		});

		test('should save generated pattern dates as availability', async ({ request }) => {
			const api = createApiClient(request);

			// Create a pattern
			const patternData = fixtures.pattern(preceptorId, {
				pattern_type: 'weekly',
				is_available: true,
				date_range_start: '2025-02-03', // Use different date range to avoid conflicts
				date_range_end: '2025-02-14',
				config: {
					days_of_week: [0, 2, 4] // Mon, Wed, Fri
				}
			});

			await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);

			// Save generated dates to availability table
			const saveResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/save`, {
				clear_existing: true
			});
			const result = await api.expectData(saveResponse);

			expect(result.saved_dates || result.message).toBeDefined();
		});
	});

	test.describe('Error Handling', () => {
		test('should reject pattern with invalid date range', async ({ request }) => {
			const api = createApiClient(request);

			const invalidPattern = fixtures.pattern(preceptorId, {
				date_range_start: '2025-12-31',
				date_range_end: '2025-01-01' // End before start
			});

			const response = await api.post(`/api/preceptors/${preceptorId}/patterns`, invalidPattern);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should return 404 when creating pattern for non-existent preceptor', async ({ request }) => {
			const api = createApiClient(request);

			// Use valid UUID format that doesn't exist
			const nonExistentId = '00000000-0000-0000-0000-000000000000';
			const patternData = fixtures.pattern(nonExistentId);

			const response = await api.post(`/api/preceptors/${nonExistentId}/patterns`, patternData);
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});

		test('should reject weekly pattern without days_of_week', async ({ request }) => {
			const api = createApiClient(request);

			const invalidPattern = {
				preceptor_id: preceptorId,
				pattern_type: 'weekly',
				is_available: true,
				date_range_start: '2025-01-06',
				date_range_end: '2025-01-31',
				config: {} // Missing days_of_week
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
				pattern_type: 'weekly',
				is_available: true,
				date_range_start: '2025-01-06',
				date_range_end: '2025-01-31',
				config: {
					days_of_week: [0, 2, 4] // Mon, Wed, Fri
				}
			});

			const createResponse = await api.post(`/api/preceptors/${preceptorId}/patterns`, patternData);
			const pattern = await api.expectData(createResponse, 201);
			const patternId = assertions.hasId(pattern);

			// 2. Generate availability (preview only - doesn't save)
			const generateResponse = await api.post(`/api/preceptors/${preceptorId}/patterns/generate`);
			const genResult = await api.expectData(generateResponse);
			expect(genResult.generated_dates || genResult.preview?.length || 0).toBeGreaterThan(0);

			// 4. Update pattern
			const updateResponse = await api.put(`/api/preceptors/${preceptorId}/patterns/${patternId}`, {
				reason: 'Updated Mon-Wed-Fri schedule'
			});
			const updated = await api.expectData(updateResponse);
			expect(updated.reason).toBe('Updated Mon-Wed-Fri schedule');

			// 5. Delete pattern
			const deleteResponse = await api.delete(`/api/preceptors/${preceptorId}/patterns/${patternId}`);
			await api.expectSuccess(deleteResponse);

			// 6. Verify pattern deleted
			const verifyResponse = await api.get(`/api/preceptors/${preceptorId}/patterns/${patternId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
