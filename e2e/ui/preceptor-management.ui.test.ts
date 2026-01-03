/**
 * UI E2E Test - Preceptor Management
 *
 * Tests the complete preceptor lifecycle through the UI:
 * 1. Create preceptor with health system association
 * 2. Edit preceptor details
 * 3. Set preceptor availability patterns
 * 4. Delete preceptor (with dependency checks)
 *
 * All operations validate actual DB state after UI actions.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Preceptor Management UI', () => {
	let healthSystemId: string;
	let healthSystemName: string;
	let siteId: string;
	let siteName: string;

	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test.beforeEach(async () => {
		const timestamp = Date.now();
		healthSystemName = `Test HS ${timestamp}`;
		siteName = `Test Site ${timestamp}`;

		// Create health system via DB for test setup
		healthSystemId = `hs_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('health_systems')
				.values({
					id: healthSystemId,
					name: healthSystemName,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create site via DB for test setup
		siteId = `site_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('sites')
				.values({
					id: siteId,
					name: siteName,
					health_system_id: healthSystemId,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);
	});

	test('should create a preceptor and verify in database', async ({ page }) => {
		const timestamp = Date.now();
		const preceptorName = `Dr. Test Preceptor ${timestamp}`;
		const preceptorEmail = `dr.test.${timestamp}@hospital.edu`;

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');
		await expect(page.getByRole('heading', { name: 'Preceptors & Teams' })).toBeVisible();

		// Click Add Preceptor to open modal
		await page.getByRole('button', { name: 'Add Preceptor' }).click();
		await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });

		// Fill out form
		await page.locator('input#name').fill(preceptorName);
		await page.locator('input#email').fill(preceptorEmail);
		await page.locator('select#health_system_id').selectOption(healthSystemId);
		await page.locator('input#max_students').clear();
		await page.locator('input#max_students').fill('3');

		// Submit form
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for form to process and modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 10000 });

		// Verify preceptor appears in UI
		await expect(page.locator(`text=${preceptorName}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbPreceptor = await executeWithRetry(() =>
			db
				.selectFrom('preceptors')
				.selectAll()
				.where('email', '=', preceptorEmail)
				.executeTakeFirst()
		);

		expect(dbPreceptor).toBeDefined();
		expect(dbPreceptor!.name).toBe(preceptorName);
		expect(dbPreceptor!.email).toBe(preceptorEmail);
		expect(dbPreceptor!.health_system_id).toBe(healthSystemId);
		expect(dbPreceptor!.max_students).toBe(3);
	});

	test('should edit preceptor details and verify in database', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB first
		const preceptorId = `preceptor_${timestamp}`;
		const originalName = `Dr. Original ${timestamp}`;
		const originalEmail = `original.${timestamp}@hospital.edu`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: originalName,
					email: originalEmail,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');

		// Find the preceptor and click Edit
		await expect(page.locator(`text=${originalName}`)).toBeVisible({ timeout: 5000 });

		// Find the row containing the preceptor and click edit
		const row = page.locator('tr', { has: page.locator(`text=${originalName}`) });
		await row.getByRole('button', { name: 'Edit' }).click();

		// Wait for edit modal
		await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });

		// Update details
		const updatedName = `Dr. Updated ${timestamp}`;
		await page.locator('input#name').clear();
		await page.locator('input#name').fill(updatedName);
		await page.locator('input#max_students').clear();
		await page.locator('input#max_students').fill('5');

		// Submit changes
		await page.getByRole('button', { name: 'Update Preceptor' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 10000 });

		// VALIDATE IN DATABASE
		const dbPreceptor = await executeWithRetry(() =>
			db
				.selectFrom('preceptors')
				.selectAll()
				.where('id', '=', preceptorId)
				.executeTakeFirst()
		);

		expect(dbPreceptor).toBeDefined();
		expect(dbPreceptor!.name).toBe(updatedName);
		expect(dbPreceptor!.max_students).toBe(5);
	});

	test('should set preceptor availability via API and verify in database', async ({ request }) => {
		const timestamp = Date.now();

		// Create preceptor via DB first
		const preceptorId = `preceptor_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: `Dr. Availability ${timestamp}`,
					email: `avail.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Associate preceptor with site
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_sites')
				.values({
					id: `ps_${timestamp}`,
					preceptor_id: preceptorId,
					site_id: siteId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		// Set availability for next 7 days via API
		const today = new Date();
		const dates: string[] = [];
		for (let i = 1; i <= 7; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);
			dates.push(date.toISOString().split('T')[0]);
		}

		const availResponse = await request.post(`/api/preceptors/${preceptorId}/availability`, {
			data: {
				site_id: siteId,
				availability: dates.map((date) => ({ date, is_available: true }))
			}
		});
		expect(availResponse.ok()).toBe(true);

		// VALIDATE IN DATABASE
		const dbAvailability = await executeWithRetry(() =>
			db
				.selectFrom('preceptor_availability')
				.selectAll()
				.where('preceptor_id', '=', preceptorId)
				.execute()
		);

		expect(dbAvailability.length).toBe(7);
		dbAvailability.forEach((avail) => {
			expect(avail.is_available).toBe(1);
			expect(avail.site_id).toBe(siteId);
		});
	});

	test('should show delete confirmation dialog', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB
		const preceptorId = `preceptor_${timestamp}`;
		const preceptorName = `Dr. ToDelete ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: preceptorName,
					email: `todelete.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');

		// Find the preceptor
		await expect(page.locator(`text=${preceptorName}`)).toBeVisible({ timeout: 5000 });

		// Find the row and click delete
		const row = page.locator('tr', { has: page.locator(`text=${preceptorName}`) });
		await row.getByRole('button', { name: 'Delete' }).click();

		// Delete dialog should appear with "Delete Preceptor" heading
		await expect(page.getByRole('heading', { name: 'Delete Preceptor' })).toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=Are you sure')).toBeVisible();
	});

	test('should delete preceptor and verify removal from database', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB (no dependencies)
		const preceptorId = `preceptor_${timestamp}`;
		const preceptorName = `Dr. Deletable ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: preceptorName,
					email: `deletable.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');

		// Find the preceptor
		await expect(page.locator(`text=${preceptorName}`)).toBeVisible({ timeout: 5000 });

		// Find the row and click delete
		const row = page.locator('tr', { has: page.locator(`text=${preceptorName}`) });
		await row.getByRole('button', { name: 'Delete' }).click();

		// Wait for delete dialog
		await expect(page.getByRole('heading', { name: 'Delete Preceptor' })).toBeVisible({ timeout: 5000 });

		// Click the Delete button in the dialog (the destructive one)
		await page.locator('.fixed button:has-text("Delete")').click();

		// Wait for deletion
		await page.waitForTimeout(2000);

		// Verify preceptor removed from UI
		await expect(page.locator(`text=${preceptorName}`)).not.toBeVisible({ timeout: 5000 });

		// VALIDATE removed from DATABASE
		const dbPreceptor = await executeWithRetry(() =>
			db
				.selectFrom('preceptors')
				.selectAll()
				.where('id', '=', preceptorId)
				.executeTakeFirst()
		);
		expect(dbPreceptor).toBeUndefined();
	});

	test('should not submit form with invalid email format', async ({ page }) => {
		await gotoAndWait(page, '/preceptors');

		// Click Add Preceptor
		await page.getByRole('button', { name: 'Add Preceptor' }).click();
		await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });

		// Fill with invalid email
		await page.locator('input#name').fill('Dr. Invalid Email');
		await page.locator('input#email').fill('not-an-email');

		// Try to submit
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for validation
		await page.waitForTimeout(1000);

		// Should still be on form (not closed)
		await expect(page.locator('input#name')).toBeVisible();

		// VALIDATE nothing created in DATABASE
		const dbPreceptor = await executeWithRetry(() =>
			db
				.selectFrom('preceptors')
				.selectAll()
				.where('name', '=', 'Dr. Invalid Email')
				.executeTakeFirst()
		);
		expect(dbPreceptor).toBeUndefined();
	});

	test('should display preceptor list with columns', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB
		const preceptorId = `preceptor_${timestamp}`;
		const preceptorName = `Dr. Listed ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: preceptorName,
					email: `listed.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 4,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');

		// Should see table headers
		await expect(page.locator('th:has-text("Name")')).toBeVisible();
		await expect(page.locator('th:has-text("Email")')).toBeVisible();
		await expect(page.locator('th:has-text("Health System")')).toBeVisible();
		await expect(page.locator('th:has-text("Max Students")')).toBeVisible();

		// Should see preceptor in list
		await expect(page.locator(`text=${preceptorName}`)).toBeVisible({ timeout: 5000 });
	});
});
