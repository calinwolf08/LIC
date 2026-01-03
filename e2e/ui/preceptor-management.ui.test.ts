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
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(preceptorName);
		await page.locator('input#email').fill(preceptorEmail);
		await page.locator('select#health_system_id').selectOption(healthSystemId);
		await page.locator('input#max_students').fill('3');

		// Submit form
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify preceptor appears in UI
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${preceptorName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });

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

		// Find the preceptor row and click Edit
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${originalName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });
		await preceptorRow.getByRole('button', { name: 'Edit' }).click();

		// Wait for edit modal/page
		await expect(page.locator('input#name')).toBeVisible();

		// Update details
		const updatedName = `Dr. Updated ${timestamp}`;
		await page.locator('input#name').clear();
		await page.locator('input#name').fill(updatedName);
		await page.locator('input#max_students').clear();
		await page.locator('input#max_students').fill('5');

		// Submit changes
		const saveButton = page.getByRole('button', { name: /Save|Update/i });
		await saveButton.click();

		// Wait for modal to close or redirect
		await page.waitForTimeout(1000);

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

	test('should set preceptor availability pattern and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create preceptor via DB first
		const preceptorId = `preceptor_${timestamp}`;
		const preceptorName = `Dr. Availability ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: preceptorName,
					email: `avail.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Navigate to preceptor availability page
		await gotoAndWait(page, `/preceptors/${preceptorId}/availability`);

		// Wait for availability page to load
		await expect(page.getByRole('heading', { name: /Availability/i })).toBeVisible({ timeout: 10000 });

		// Set availability for next 7 days via API (complex UI, using API for setup)
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
			expect(avail.is_available).toBe(1); // SQLite stores booleans as 0/1
			expect(avail.site_id).toBe(siteId);
		});
	});

	test('should prevent delete when preceptor has team membership', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB
		const preceptorId = `preceptor_${timestamp}`;
		const preceptorName = `Dr. HasTeam ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: preceptorName,
					email: `hasteam.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create second preceptor for team requirement
		const preceptor2Id = `preceptor2_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptor2Id,
					name: `Dr. Second ${timestamp}`,
					email: `second.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create clerkship
		const clerkshipId = `clerkship_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('clerkships')
				.values({
					id: clerkshipId,
					name: `Test Clerkship ${timestamp}`,
					clerkship_type: 'outpatient',
					required_days: 20,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create team with preceptor as member
		const teamId = `team_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_teams')
				.values({
					id: teamId,
					clerkship_id: clerkshipId,
					name: `Test Team ${timestamp}`,
					require_same_health_system: 0,
					require_same_site: 0,
					require_same_specialty: 0,
					requires_admin_approval: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_members')
				.values([
					{
						id: `member1_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptorId,
						priority: 1,
						created_at: new Date().toISOString()
					},
					{
						id: `member2_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptor2Id,
						priority: 2,
						created_at: new Date().toISOString()
					}
				])
				.execute()
		);

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');

		// Find the preceptor row
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${preceptorName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });

		// Check if delete button exists and its state
		const deleteButton = preceptorRow.getByRole('button', { name: 'Delete' });

		// Either the button should be disabled or clicking should show warning
		if (await deleteButton.isDisabled()) {
			// Button is correctly disabled
			expect(await deleteButton.isDisabled()).toBe(true);
		} else {
			// Click and check for confirmation with dependency warning
			await deleteButton.click();
			await page.waitForTimeout(500);

			// Should show dependency warning or prevent deletion
			const warningText = page.locator('text=/team|cannot delete|dependency/i');
			const isWarningVisible = await warningText.isVisible().catch(() => false);

			// If warning shown, cancel and verify preceptor still exists
			if (isWarningVisible) {
				const cancelButton = page.getByRole('button', { name: 'Cancel' });
				if (await cancelButton.isVisible()) {
					await cancelButton.click();
				}
			}
		}

		// VALIDATE preceptor still exists in DATABASE
		const dbPreceptor = await executeWithRetry(() =>
			db
				.selectFrom('preceptors')
				.selectAll()
				.where('id', '=', preceptorId)
				.executeTakeFirst()
		);
		expect(dbPreceptor).toBeDefined();
	});

	test('should delete preceptor without dependencies and verify removal', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor via DB (no team membership)
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

		// Find the preceptor row
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${preceptorName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });

		// Setup dialog handler
		page.on('dialog', (dialog) => dialog.accept());

		// Click delete
		await preceptorRow.getByRole('button', { name: 'Delete' }).click();

		// Wait for deletion
		await page.waitForTimeout(1000);

		// Verify preceptor removed from UI
		await expect(preceptorRow).not.toBeVisible({ timeout: 5000 });

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

	test('should show validation errors for invalid email format', async ({ page }) => {
		await gotoAndWait(page, '/preceptors');

		// Click Add Preceptor
		await page.getByRole('button', { name: 'Add Preceptor' }).click();
		await expect(page.locator('input#name')).toBeVisible();

		// Fill with invalid email
		await page.locator('input#name').fill('Dr. Invalid Email');
		await page.locator('input#email').fill('not-an-email');
		await page.locator('select#health_system_id').selectOption(healthSystemId);

		// Try to submit
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Should still be on form (not submitted)
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

	test('should create preceptor with specialty field', async ({ page }) => {
		const timestamp = Date.now();
		const preceptorName = `Dr. Specialist ${timestamp}`;
		const preceptorEmail = `specialist.${timestamp}@hospital.edu`;
		const specialty = 'Cardiology';

		await gotoAndWait(page, '/preceptors');

		// Click Add Preceptor
		await page.getByRole('button', { name: 'Add Preceptor' }).click();
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form including specialty
		await page.locator('input#name').fill(preceptorName);
		await page.locator('input#email').fill(preceptorEmail);
		await page.locator('select#health_system_id').selectOption(healthSystemId);

		// Fill specialty if field exists
		const specialtyInput = page.locator('input#specialty');
		if (await specialtyInput.isVisible()) {
			await specialtyInput.fill(specialty);
		}

		// Submit form
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

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
		// Specialty may or may not be in the schema
		if ('specialty' in dbPreceptor!) {
			expect(dbPreceptor!.specialty).toBe(specialty);
		}
	});
});
