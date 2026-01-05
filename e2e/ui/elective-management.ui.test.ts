/**
 * UI E2E Test - Elective Management
 *
 * Tests the complete elective lifecycle through the UI:
 * 1. Create elective under a clerkship
 * 2. Edit elective details
 * 3. Delete elective
 * 4. Display elective information
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Elective Management UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test('should create elective and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();
		const electiveName = `Sports Medicine Elective ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Elective Parent Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for electives panel
		await expect(page.locator('text=/No electives|Create/i').first()).toBeVisible({
			timeout: 5000
		});

		// Click Create Elective
		await page.getByRole('button', { name: /Create.*Elective/i }).click();

		// Wait for form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible({
			timeout: 5000
		});

		// Fill form
		await page.locator('input#name').fill(electiveName);
		await page.locator('input#specialty').fill('Sports Medicine');
		await page.locator('input#minimumDays').clear();
		await page.locator('input#minimumDays').fill('10');

		// Submit
		await page.getByRole('button', { name: 'Create' }).last().click();

		// Wait for form to close
		await expect(page.getByRole('heading', { name: 'Create Elective' })).not.toBeVisible({
			timeout: 5000
		});

		// Elective should appear in list
		await expect(page.locator(`text=${electiveName}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbElective = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('name', '=', electiveName)
				.executeTakeFirst()
		);

		expect(dbElective).toBeDefined();
		expect(dbElective!.specialty).toBe('Sports Medicine');
		expect(dbElective!.minimum_days).toBe(10);
	});

	test('should edit elective and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();
		const originalName = `Original Elective ${timestamp}`;
		const updatedName = `Updated Elective ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Edit Elective Parent ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		// Create elective via API
		const electiveResponse = await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: originalName,
				specialty: 'Original Specialty',
				minimum_days: 5
			}
		});
		expect(electiveResponse.ok()).toBe(true);
		const electiveData = await electiveResponse.json();
		const electiveId = electiveData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for elective to appear
		await expect(page.locator(`text=${originalName}`)).toBeVisible({ timeout: 5000 });

		// Click Edit button
		const electiveRow = page.locator('.border.rounded', {
			has: page.locator(`text=${originalName}`)
		});
		await electiveRow.getByRole('button', { name: 'Edit' }).click();

		// Wait for edit form
		await expect(page.getByRole('heading', { name: 'Edit Elective' })).toBeVisible({
			timeout: 5000
		});

		// Update details
		await page.locator('input#name').clear();
		await page.locator('input#name').fill(updatedName);
		await page.locator('input#specialty').clear();
		await page.locator('input#specialty').fill('Updated Specialty');
		await page.locator('input#minimumDays').clear();
		await page.locator('input#minimumDays').fill('15');

		// Save
		await page.getByRole('button', { name: 'Save' }).click();

		// Wait for form to close
		await expect(page.getByRole('heading', { name: 'Edit Elective' })).not.toBeVisible({
			timeout: 5000
		});

		// Updated name should appear
		await expect(page.locator(`text=${updatedName}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbElective = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('id', '=', electiveId)
				.executeTakeFirst()
		);

		expect(dbElective).toBeDefined();
		expect(dbElective!.name).toBe(updatedName);
		expect(dbElective!.specialty).toBe('Updated Specialty');
		expect(dbElective!.minimum_days).toBe(15);
	});

	test('should delete elective and verify removal from database', async ({ page, request }) => {
		const timestamp = Date.now();
		const electiveName = `Deletable Elective ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Delete Elective Parent ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		// Create elective via API
		const electiveResponse = await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: electiveName,
				specialty: 'Test',
				minimum_days: 5
			}
		});
		expect(electiveResponse.ok()).toBe(true);
		const electiveData = await electiveResponse.json();
		const electiveId = electiveData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for elective to appear
		await expect(page.locator(`text=${electiveName}`)).toBeVisible({ timeout: 5000 });

		// Click Delete button
		const electiveRow = page.locator('.border.rounded', {
			has: page.locator(`text=${electiveName}`)
		});

		// Setup dialog handler
		page.on('dialog', (dialog) => dialog.accept());

		await electiveRow.getByRole('button', { name: 'Delete' }).click();

		// Wait for deletion
		await page.waitForTimeout(1000);

		// Elective should be removed
		await expect(page.locator(`text=${electiveName}`)).not.toBeVisible({ timeout: 5000 });

		// VALIDATE removed from DATABASE
		const dbElective = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('id', '=', electiveId)
				.executeTakeFirst()
		);

		expect(dbElective).toBeUndefined();
	});

	test('should show validation error for missing required fields', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Validation Test Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Click Create Elective
		await page.getByRole('button', { name: /Create.*Elective/i }).click();

		// Wait for form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible({
			timeout: 5000
		});

		// Try to submit with empty name
		await page.locator('input#minimumDays').fill('5');
		await page.getByRole('button', { name: 'Create' }).last().click();

		// Should still be on form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible();

		// VALIDATE nothing created in DATABASE
		const count = await executeWithRetry(async () => {
			const result = await db
				.selectFrom('clerkship_electives')
				.where('clerkship_id', '=', clerkshipId)
				.select(db.fn.countAll().as('count'))
				.executeTakeFirst();
			return Number(result?.count || 0);
		});

		expect(count).toBe(0);
	});

	test('should display multiple electives under same clerkship', async ({ page, request }) => {
		const timestamp = Date.now();
		const elective1Name = `Elective One ${timestamp}`;
		const elective2Name = `Elective Two ${timestamp}`;
		const elective3Name = `Elective Three ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Multi Elective Parent ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		// Create multiple electives via API
		await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: elective1Name,
				specialty: 'Cardiology',
				minimum_days: 5
			}
		});

		await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: elective2Name,
				specialty: 'Neurology',
				minimum_days: 7
			}
		});

		await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: elective3Name,
				specialty: 'Oncology',
				minimum_days: 10
			}
		});

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// All three electives should be visible
		await expect(page.locator(`text=${elective1Name}`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`text=${elective2Name}`)).toBeVisible();
		await expect(page.locator(`text=${elective3Name}`)).toBeVisible();

		// Their specialties should also be visible
		await expect(page.locator('text=Cardiology')).toBeVisible();
		await expect(page.locator('text=Neurology')).toBeVisible();
		await expect(page.locator('text=Oncology')).toBeVisible();
	});

	test('should show minimum days in elective listing', async ({ page, request }) => {
		const timestamp = Date.now();
		const electiveName = `Elective With Days ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Min Days Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		// Create elective via API
		await request.post('/api/scheduling-config/electives', {
			data: {
				clerkship_id: clerkshipId,
				name: electiveName,
				specialty: 'Dermatology',
				minimum_days: 12
			}
		});

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for elective to appear
		await expect(page.locator(`text=${electiveName}`)).toBeVisible({ timeout: 5000 });

		// Minimum days should be displayed
		await expect(page.locator('text=/12.*day/i')).toBeVisible();
	});

	test('should show empty state when no electives exist', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API (with no electives)
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Empty Electives Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Should show empty state or create button
		await expect(page.locator('text=/No electives|Create.*Elective/i').first()).toBeVisible({
			timeout: 5000
		});
	});
});
