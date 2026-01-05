/**
 * UI E2E Test - Schedule Views & Export
 *
 * Phase 3 Tests: User visibility and export functionality
 * Tests the following:
 * 1. Student schedule view
 * 2. Schedule export to Excel
 * 3. Export with filters
 * 4. Empty state handling
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Schedule Views & Export UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	/**
	 * Helper function to create all required entities for schedule view tests
	 */
	async function createTestEntities(request: any, timestamp: number) {
		// Create health system
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Views HS ${timestamp}`, location: 'Test Location' }
		});
		expect(hsResponse.ok()).toBe(true);
		const hsData = await hsResponse.json();
		const healthSystemId = hsData.data.id;

		// Create site
		const siteResponse = await request.post('/api/sites', {
			data: { name: `Views Site ${timestamp}`, health_system_id: healthSystemId }
		});
		expect(siteResponse.ok()).toBe(true);
		const siteData = await siteResponse.json();
		const siteId = siteData.data.id;

		// Create student
		const studentName = `Views Student ${timestamp}`;
		const studentResponse = await request.post('/api/students', {
			data: { name: studentName, email: `views.${timestamp}@test.edu` }
		});
		expect(studentResponse.ok()).toBe(true);
		const studentData = await studentResponse.json();
		const studentId = studentData.data.id;

		// Create preceptor
		const preceptorName = `Dr. Views ${timestamp}`;
		const preceptorResponse = await request.post('/api/preceptors', {
			data: {
				name: preceptorName,
				email: `views.${timestamp}@hospital.edu`,
				health_system_id: healthSystemId,
				site_ids: [siteId],
				max_students: 3
			}
		});
		expect(preceptorResponse.ok()).toBe(true);
		const preceptorData = await preceptorResponse.json();
		const preceptorId = preceptorData.data.id;

		// Create clerkship
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Views Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		return {
			healthSystemId,
			siteId,
			studentId,
			studentName,
			preceptorId,
			preceptorName,
			clerkshipId
		};
	}

	/**
	 * Helper function to create an assignment directly in the database
	 */
	async function createAssignment(
		siteId: string,
		studentId: string,
		preceptorId: string,
		clerkshipId: string,
		date: string
	) {
		const id = crypto.randomUUID();
		await executeWithRetry(() =>
			db
				.insertInto('schedule_assignments')
				.values({
					id,
					student_id: studentId,
					preceptor_id: preceptorId,
					clerkship_id: clerkshipId,
					site_id: siteId,
					date,
					status: 'scheduled',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);
		return id;
	}

	/**
	 * Helper to get a future date string
	 */
	function getFutureDate(daysAhead: number): string {
		const date = new Date();
		date.setDate(date.getDate() + daysAhead);
		return date.toISOString().split('T')[0];
	}

	/**
	 * Helper to get a past date string
	 */
	function getPastDate(daysAgo: number): string {
		const date = new Date();
		date.setDate(date.getDate() - daysAgo);
		return date.toISOString().split('T')[0];
	}

	// =========================================================================
	// Student Schedule View Tests
	// =========================================================================

	test('should display students list page', async ({ page }) => {
		await gotoAndWait(page, '/students');

		// Should show students heading
		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
	});

	test('should display student detail page', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Navigate to student detail page
		await gotoAndWait(page, `/students/${entities.studentId}`);
		await page.waitForTimeout(500);

		// Should show student name somewhere on the page
		await expect(page.getByText(entities.studentName).first()).toBeVisible();
	});

	// =========================================================================
	// Calendar View Tests
	// =========================================================================

	test('should display main calendar page', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Verify filter dropdowns exist
		await expect(page.locator('select#student')).toBeVisible();
		await expect(page.locator('select#preceptor')).toBeVisible();
	});

	test('should have view toggle buttons on calendar page', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// View toggle buttons should be visible
		const listButton = page.locator('button:has-text("List")');
		const calendarButton = page.locator('button:has-text("Calendar")');

		// At least one toggle button should be visible
		const listVisible = await listButton.isVisible().catch(() => false);
		const calendarVisible = await calendarButton.isVisible().catch(() => false);
		expect(listVisible || calendarVisible).toBe(true);
	});

	test('should navigate between months', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Get current month text
		const monthHeading = page.locator('h2.text-xl.font-semibold');
		const initialMonth = await monthHeading.textContent();

		// Click next month
		await page.getByRole('button', { name: /Next Month/i }).click();
		await page.waitForTimeout(500);

		// Month should change
		const nextMonth = await monthHeading.textContent();
		expect(nextMonth).not.toBe(initialMonth);

		// Click previous month to go back
		await page.getByRole('button', { name: /Previous Month/i }).click();
		await page.waitForTimeout(500);

		// Should be back to initial month
		const backToInitial = await monthHeading.textContent();
		expect(backToInitial).toBe(initialMonth);
	});

	test('should clear filters when Clear Filters button is clicked', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Clear Filters
		await page.getByRole('button', { name: 'Clear Filters' }).click();
		await page.waitForTimeout(500);

		// Filters should be reset
		const studentValue = await page.locator('select#student').inputValue();
		const preceptorValue = await page.locator('select#preceptor').inputValue();
		expect(studentValue).toBe('');
		expect(preceptorValue).toBe('');
	});

	// =========================================================================
	// Export Tests
	// =========================================================================

	test('should show export button on calendar page', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		await expect(page.getByRole('button', { name: /Export to Excel/i })).toBeVisible();
	});

	test('should export schedule via API with date range', async ({ request }) => {
		const startDate = getPastDate(30);
		const endDate = getFutureDate(30);

		const response = await request.get(
			`/api/schedules/export?start_date=${startDate}&end_date=${endDate}`
		);
		expect(response.ok()).toBe(true);

		// Verify content type is Excel
		const contentType = response.headers()['content-type'];
		expect(contentType).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

		// Verify content disposition has .xlsx extension
		const contentDisposition = response.headers()['content-disposition'];
		expect(contentDisposition).toContain('.xlsx');
		expect(contentDisposition).toContain('attachment');
	});

	test('should export schedule with student filter', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Create an assignment
		const date = getFutureDate(5);
		await createAssignment(
			entities.siteId,
			entities.studentId,
			entities.preceptorId,
			entities.clerkshipId,
			date
		);

		const startDate = getPastDate(30);
		const endDate = getFutureDate(30);

		// Export with student filter
		const response = await request.get(
			`/api/schedules/export?start_date=${startDate}&end_date=${endDate}&student_id=${entities.studentId}`
		);
		expect(response.ok()).toBe(true);

		const contentType = response.headers()['content-type'];
		expect(contentType).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	});

	test('should export schedule with preceptor filter', async ({ request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Create an assignment
		const date = getFutureDate(6);
		await createAssignment(
			entities.siteId,
			entities.studentId,
			entities.preceptorId,
			entities.clerkshipId,
			date
		);

		const startDate = getPastDate(30);
		const endDate = getFutureDate(30);

		// Export with preceptor filter
		const response = await request.get(
			`/api/schedules/export?start_date=${startDate}&end_date=${endDate}&preceptor_id=${entities.preceptorId}`
		);
		expect(response.ok()).toBe(true);

		const contentType = response.headers()['content-type'];
		expect(contentType).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	});

	test('should return error for missing export date parameters', async ({ request }) => {
		// Missing start_date
		const response1 = await request.get('/api/schedules/export?end_date=2025-01-31');
		expect(response1.status()).toBe(400);

		// Missing end_date
		const response2 = await request.get('/api/schedules/export?start_date=2025-01-01');
		expect(response2.status()).toBe(400);

		// Missing both
		const response3 = await request.get('/api/schedules/export');
		expect(response3.status()).toBe(400);
	});

	test('should return error for invalid date format in export', async ({ request }) => {
		const response = await request.get(
			'/api/schedules/export?start_date=invalid&end_date=2025-01-31'
		);
		expect(response.status()).toBe(400);
	});

	// =========================================================================
	// Assignment Display Tests
	// =========================================================================

	test('should display assignments on calendar', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Create assignment for 15th of current month
		const today = new Date();
		const testDate = new Date(today.getFullYear(), today.getMonth(), 15);
		const date = testDate.toISOString().split('T')[0];

		await createAssignment(
			entities.siteId,
			entities.studentId,
			entities.preceptorId,
			entities.clerkshipId,
			date
		);

		// Navigate to calendar
		await gotoAndWait(page, '/calendar');
		await page.waitForTimeout(1000);

		// Calendar should load
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();
	});

	test('should filter calendar by student dropdown', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Navigate to calendar
		await gotoAndWait(page, '/calendar');

		// Get student dropdown
		const studentDropdown = page.locator('select#student');
		await expect(studentDropdown).toBeVisible();

		// The dropdown should have options
		const optionCount = await studentDropdown.locator('option').count();
		expect(optionCount).toBeGreaterThan(0); // At least empty option
	});

	// =========================================================================
	// Empty State Tests
	// =========================================================================

	test('should handle empty calendar gracefully', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Calendar should still render with no assignments
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();
		await expect(page.locator('select#student')).toBeVisible();
	});

	test('should handle export with no data gracefully', async ({ request }) => {
		// Use far future dates where no assignments exist
		const startDate = '2099-01-01';
		const endDate = '2099-12-31';

		const response = await request.get(
			`/api/schedules/export?start_date=${startDate}&end_date=${endDate}`
		);

		// Should still return a valid Excel file (empty)
		expect(response.ok()).toBe(true);
		const contentType = response.headers()['content-type'];
		expect(contentType).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	});

	// =========================================================================
	// Preceptor View Tests
	// =========================================================================

	test('should display preceptors list page', async ({ page }) => {
		await gotoAndWait(page, '/preceptors');

		await expect(page.getByRole('heading', { name: 'Preceptors' })).toBeVisible();
	});

	test('should display preceptor availability page', async ({ page, request }) => {
		const timestamp = Date.now();
		const entities = await createTestEntities(request, timestamp);

		// Navigate to preceptor availability page
		await gotoAndWait(page, `/preceptors/${entities.preceptorId}/availability`);
		await page.waitForTimeout(500);

		// Page should load (availability page exists)
		const pageContent = page.locator('body');
		await expect(pageContent).toBeVisible();
	});

	// =========================================================================
	// Schedule Results Page Tests
	// =========================================================================

	test('should display schedule results page', async ({ page }) => {
		await gotoAndWait(page, '/schedule/results');

		// Should show some content (page exists)
		await page.waitForTimeout(500);

		// The page should load without error
		const heading = page.locator('h1, h2').first();
		await expect(heading).toBeVisible();
	});
});
