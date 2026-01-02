/**
 * UI E2E Tests - Complete Onboarding Workflow
 *
 * Tests the full user journey of setting up a new scheduling program through the UI:
 * 1. Create students
 * 2. Create health systems
 * 3. Create sites
 * 4. Create preceptors with availability
 * 5. Create clerkships
 * 6. Generate schedule
 * 7. Verify schedule
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';

test.describe('Complete Onboarding UI Workflow', () => {
	test('Step 1: Create a student through the UI', async ({ page }) => {
		const timestamp = Date.now();
		const studentName = `Onboarding Student ${timestamp}`;
		const studentEmail = `onboarding.${timestamp}@medical.edu`;

		// Navigate to students page
		await gotoAndWait(page, '/students');
		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

		// Click Add Student
		await page.getByRole('link', { name: 'Add Student' }).click();
		await page.waitForURL('/students/new');

		// Fill out form
		await page.locator('input#name').fill(studentName);
		await page.locator('input#email').fill(studentEmail);

		// Submit
		await page.getByRole('button', { name: 'Create' }).click();

		// Verify redirect and student in list
		await page.waitForURL('/students');
		const studentRow = page.locator('table tbody tr', {
			has: page.locator(`text=${studentName}`)
		});
		await expect(studentRow).toBeVisible({ timeout: 5000 });
		await expect(studentRow.locator(`text=${studentEmail}`)).toBeVisible();
	});

	test('Step 2: Create a health system through the UI', async ({ page }) => {
		const timestamp = Date.now();
		const hsName = `University Medical Center ${timestamp}`;

		// Navigate to health systems page
		await gotoAndWait(page, '/health-systems');
		await expect(page.getByRole('heading', { name: 'Health Systems' })).toBeVisible();

		// Click Add Health System to open modal
		await page.getByRole('button', { name: 'Add Health System' }).click();

		// Wait for modal form to appear
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(hsName);
		await page.locator('input#location').fill('Downtown Campus');
		await page.locator('textarea#description').fill('Main teaching hospital');

		// Submit form
		await page.getByRole('button', { name: 'Create' }).click();

		// Wait for modal to close and verify health system appears in table
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify the health system appears in the table
		const hsRow = page.locator('table tbody tr', {
			has: page.locator(`text=${hsName}`)
		});
		await expect(hsRow).toBeVisible({ timeout: 5000 });
	});

	test('Step 3: Create a site through the UI', async ({ page, request }) => {
		const timestamp = Date.now();
		const siteName = `Family Medicine Clinic ${timestamp}`;

		// First, create a health system via API (prerequisite)
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Test Health System ${timestamp}` }
		});
		const hsResult = await hsResponse.json();
		const healthSystemId = hsResult.data.id;

		// Navigate to sites page
		await gotoAndWait(page, '/sites');
		await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

		// Click New Site button
		await page.getByRole('link', { name: '+ New Site' }).click();
		await page.waitForURL('/sites/new');

		// Fill out form
		await page.locator('input#name').fill(siteName);

		// Select health system from dropdown
		await page.locator('select#health_system_id').selectOption(healthSystemId);

		await page.locator('textarea#address').fill('123 Main St, City, ST 12345');

		// Submit form
		await page.getByRole('button', { name: 'Create Site' }).click();

		// Verify redirect to sites list
		await page.waitForURL('/sites');

		// Verify the site appears in the table
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text=${siteName}`)
		});
		await expect(siteRow).toBeVisible({ timeout: 5000 });
	});

	test('Step 4: Create a preceptor through the UI', async ({ page, request }) => {
		const timestamp = Date.now();
		const preceptorName = `Dr. Smith ${timestamp}`;
		const preceptorEmail = `dr.smith.${timestamp}@hospital.edu`;

		// Create prerequisites via API
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Test Health System ${timestamp}` }
		});
		const hsResult = await hsResponse.json();
		const healthSystemId = hsResult.data.id;

		// Navigate to preceptors page
		await gotoAndWait(page, '/preceptors');
		await expect(page.getByRole('heading', { name: 'Preceptors & Teams' })).toBeVisible();

		// Click Add Preceptor to open modal
		await page.getByRole('button', { name: 'Add Preceptor' }).click();

		// Wait for modal form to appear
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(preceptorName);
		await page.locator('input#email').fill(preceptorEmail);
		await page.locator('select#health_system_id').selectOption(healthSystemId);
		await page.locator('input#max_students').fill('2');

		// Submit form
		await page.getByRole('button', { name: 'Create Preceptor' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify the preceptor appears in the list
		const preceptorRow = page.locator('table tbody tr', {
			has: page.locator(`text=${preceptorName}`)
		});
		await expect(preceptorRow).toBeVisible({ timeout: 5000 });
	});

	test('Step 5: Create a clerkship through the UI', async ({ page }) => {
		const timestamp = Date.now();
		const clerkshipName = `Family Medicine ${timestamp}`;

		// Navigate to clerkships page
		await gotoAndWait(page, '/clerkships');
		await expect(page.getByRole('heading', { name: 'Clerkships' })).toBeVisible();

		// Click Add Clerkship to open modal
		await page.getByRole('button', { name: 'Add Clerkship' }).click();

		// Wait for modal form to appear
		await expect(page.locator('input#name')).toBeVisible();

		// Fill out form
		await page.locator('input#name').fill(clerkshipName);
		await page.locator('input[value="outpatient"]').click(); // Select outpatient type
		await page.locator('input#required_days').fill('20');
		await page.locator('input#description').fill('Family Medicine rotation');

		// Submit form
		await page.getByRole('button', { name: 'Create' }).click();

		// Wait for modal to close
		await expect(page.locator('input#name')).not.toBeVisible({ timeout: 5000 });

		// Verify the clerkship appears in the list
		const clerkshipRow = page.locator('table tbody tr', {
			has: page.locator(`text=${clerkshipName}`)
		});
		await expect(clerkshipRow).toBeVisible({ timeout: 5000 });
	});
});
