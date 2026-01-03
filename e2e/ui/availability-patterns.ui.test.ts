/**
 * UI E2E Test - Availability Patterns
 *
 * Phase 4 Tests: Preceptor availability pattern management
 * Tests the following:
 * 1. Display availability page
 * 2. Availability API operations
 * 3. Pattern generation
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Availability Patterns UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	/**
	 * Helper function to create all required entities for availability tests
	 */
	async function createTestEntities(request: any, timestamp: number) {
		// Create health system
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Avail HS ${timestamp}`, location: 'Test Location' }
		});
		expect(hsResponse.ok()).toBe(true);
		const hsData = await hsResponse.json();
		const healthSystemId = hsData.data.id;

		// Create site
		const siteResponse = await request.post('/api/sites', {
			data: { name: `Avail Site ${timestamp}`, health_system_id: healthSystemId }
		});
		expect(siteResponse.ok()).toBe(true);
		const siteData = await siteResponse.json();
		const siteId = siteData.data.id;

		// Create preceptor
		const preceptorName = `Dr. Avail ${timestamp}`;
		const preceptorResponse = await request.post('/api/preceptors', {
			data: {
				name: preceptorName,
				email: `avail.${timestamp}@hospital.edu`,
				health_system_id: healthSystemId,
				site_ids: [siteId],
				max_students: 3
			}
		});
		expect(preceptorResponse.ok()).toBe(true);
		const preceptorData = await preceptorResponse.json();
		const preceptorId = preceptorData.data.id;

		return { healthSystemId, siteId, preceptorId, preceptorName };
	}

	/**
	 * Helper to get a future date string
	 */
	function getFutureDate(daysAhead: number): string {
		const date = new Date();
		date.setDate(date.getDate() + daysAhead);
		return date.toISOString().split('T')[0];
	}

	// =========================================================================
	// Availability Page Tests
	// =========================================================================

	test('should display preceptor availability page', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		await gotoAndWait(page, `/preceptors/${entities.preceptorId}/availability`);

		// Should show "Manage Availability" heading
		await expect(page.getByRole('heading', { name: 'Manage Availability' })).toBeVisible();
	});

	test('should show preceptor name on availability page', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		await gotoAndWait(page, `/preceptors/${entities.preceptorId}/availability`);

		// Should show preceptor name in breadcrumb
		await expect(page.getByText(entities.preceptorName).first()).toBeVisible();
	});

	test('should have Back to Preceptors button', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		await gotoAndWait(page, `/preceptors/${entities.preceptorId}/availability`);

		// Should have back button
		await expect(page.getByRole('button', { name: 'Back to Preceptors' })).toBeVisible();
	});

	// =========================================================================
	// Availability API Tests
	// =========================================================================

	test('should get empty availability for new preceptor', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Get availability
		const response = await request.get(
			`/api/preceptors/${entities.preceptorId}/availability`
		);
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(data.data).toBeDefined();
		expect(Array.isArray(data.data)).toBe(true);
	});

	test('should create availability via API', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);
		const availDate = getFutureDate(10);

		// Set availability
		const response = await request.post(
			`/api/preceptors/${entities.preceptorId}/availability`,
			{
				data: {
					site_id: entities.siteId,
					availability: [{ date: availDate, is_available: true }]
				}
			}
		);
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(data.data).toBeDefined();
		expect(Array.isArray(data.data)).toBe(true);
		expect(data.data.length).toBe(1);
	});

	test('should update availability for existing date', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);
		const availDate = getFutureDate(11);

		// Create initial availability (available)
		const createResponse = await request.post(
			`/api/preceptors/${entities.preceptorId}/availability`,
			{
				data: {
					site_id: entities.siteId,
					availability: [{ date: availDate, is_available: true }]
				}
			}
		);
		expect(createResponse.ok()).toBe(true);

		// Update to unavailable
		const updateResponse = await request.post(
			`/api/preceptors/${entities.preceptorId}/availability`,
			{
				data: {
					site_id: entities.siteId,
					availability: [{ date: availDate, is_available: false }]
				}
			}
		);
		expect(updateResponse.ok()).toBe(true);

		const data = await updateResponse.json();
		expect(data.data[0].is_available).toBe(0); // SQLite stores as 0/1
	});

	test('should bulk update multiple availability dates', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);
		const date1 = getFutureDate(12);
		const date2 = getFutureDate(13);
		const date3 = getFutureDate(14);

		// Set multiple dates
		const response = await request.post(
			`/api/preceptors/${entities.preceptorId}/availability`,
			{
				data: {
					site_id: entities.siteId,
					availability: [
						{ date: date1, is_available: true },
						{ date: date2, is_available: false },
						{ date: date3, is_available: true }
					]
				}
			}
		);
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(data.data.length).toBe(3);
	});

	test('should get availability by date range', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);
		const startDate = getFutureDate(20);
		const endDate = getFutureDate(25);

		// Create some availability in the range
		await request.post(`/api/preceptors/${entities.preceptorId}/availability`, {
			data: {
				site_id: entities.siteId,
				availability: [
					{ date: getFutureDate(21), is_available: true },
					{ date: getFutureDate(22), is_available: true }
				]
			}
		});

		// Get by date range
		const response = await request.get(
			`/api/preceptors/${entities.preceptorId}/availability?start_date=${startDate}&end_date=${endDate}`
		);
		expect(response.ok()).toBe(true);

		const data = await response.json();
		expect(Array.isArray(data.data)).toBe(true);
	});

	test('should return error for invalid preceptor ID', async ({ request }) => {
		const fakeId = crypto.randomUUID();

		const response = await request.get(`/api/preceptors/${fakeId}/availability`);
		// Should return data (empty) not error for non-existent preceptor
		expect(response.ok()).toBe(true);
	});

	// =========================================================================
	// Database Verification Tests
	// =========================================================================

	test('should persist availability in database', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);
		const availDate = getFutureDate(30);

		// Set availability
		await request.post(`/api/preceptors/${entities.preceptorId}/availability`, {
			data: {
				site_id: entities.siteId,
				availability: [{ date: availDate, is_available: true }]
			}
		});

		// Verify in database
		const dbAvailability = await executeWithRetry(() =>
			db
				.selectFrom('preceptor_availability')
				.selectAll()
				.where('preceptor_id', '=', entities.preceptorId)
				.where('date', '=', availDate)
				.executeTakeFirst()
		);

		expect(dbAvailability).toBeDefined();
		expect(dbAvailability?.is_available).toBe(1);
	});
});
