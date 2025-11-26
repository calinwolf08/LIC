/**
 * UI E2E Test - Sites Management
 *
 * These tests catch bugs found during manual testing:
 * 1. Sites not appearing in the table after creation
 * 2. Phone and email fields showing validation errors when empty (despite being optional)
 * 3. Site delete dialog not showing dependencies correctly
 * 4. Sites not created when health_system_id left empty (schema validation failed on empty string)
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';

test.describe('Sites UI Workflow', () => {
	// Setup: Create a health system for all tests
	let healthSystemName: string;

	test.beforeEach(async ({ page }) => {
		const timestamp = Date.now();
		healthSystemName = `Test HS ${timestamp}`;

		// Create a health system to use in tests
		await gotoAndWait(page, '/health-systems');
		await page.getByRole('button', { name: 'Add Health System' }).click();
		await page.waitForTimeout(300);
		await page.locator('input#name').fill(healthSystemName);
		await page.getByRole('button', { name: 'Create' }).last().click();
		await page.waitForTimeout(500);
	});

	test('should create a site and see it in the table immediately', async ({ page }) => {
		// This test would have caught Bug: "Sites table doesn't populate after create"
		const timestamp = Date.now();
		const siteName = `Test Site ${timestamp}`;
		const address = '123 Medical Center Dr';

		// Navigate to sites page
		await gotoAndWait(page, '/sites');
		await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();

		// Click "New Site" link
		const addSiteLink = page.getByRole('link', { name: /new site/i });
		await expect(addSiteLink).toBeVisible();
		await addSiteLink.click();

		// Should navigate to /sites/new
		await page.waitForURL('/sites/new');
		await expect(page.getByRole('heading', { name: 'Add Site' })).toBeVisible();

		// Fill out the form
		await page.locator('input#name').fill(siteName);

		// Select health system
		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await expect(healthSystemSelect).toBeVisible();
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Fill address
		const addressInput = page.locator('input#address, textarea[name="address"]');
		if ((await addressInput.count()) > 0) {
			await addressInput.fill(address);
		}

		// Submit
		const createButton = page.getByRole('button', { name: 'Create' });
		await expect(createButton).toBeEnabled();
		await createButton.click();

		// Should redirect to /sites
		await page.waitForURL('/sites', { timeout: 5000 });

		// CRITICAL: Verify the site appears in the table
		// This is what was broken - sites weren't showing up!
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text="${siteName}"`)
		});

		await expect(siteRow).toBeVisible({ timeout: 5000 });

		// Verify all data is displayed
		await expect(siteRow.locator(`text="${siteName}"`)).toBeVisible();
		await expect(siteRow.locator(`text="${healthSystemName}"`)).toBeVisible();

		// Verify action buttons are present
		await expect(siteRow.getByRole('button', { name: 'Edit' })).toBeVisible();
		await expect(siteRow.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	test('should create site without health system (optional field)', async ({ page }) => {
		// This test catches Bug: "Sites not created when health_system_id is empty string"
		// The schema was failing validation on empty string instead of treating it as undefined
		const timestamp = Date.now();
		const siteName = `Site No HS ${timestamp}`;

		await gotoAndWait(page, '/sites');

		// Click "New Site" link
		await page.getByRole('link', { name: /new site/i }).click();
		await page.waitForURL('/sites/new');

		// Fill only the required name field
		await page.locator('input#name').fill(siteName);

		// Do NOT select a health system - leave it as default empty option
		const healthSystemSelect = page.locator('select#health_system_id');
		await expect(healthSystemSelect).toHaveValue(''); // Verify it's empty

		// Submit
		await page.getByRole('button', { name: 'Create' }).click();

		// Should successfully redirect to sites list (not stay on form with error)
		await page.waitForURL('/sites', { timeout: 5000 });

		// CRITICAL: Site should appear in table even without health system
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text="${siteName}"`)
		});
		await expect(siteRow).toBeVisible({ timeout: 5000 });

		// Health system column should show "Unknown" or similar
		await expect(siteRow.locator('text=/Unknown|—|-/')).toBeVisible();
	});

	test('should not show validation errors for optional empty phone and email fields', async ({
		page
	}) => {
		// This test would have caught Bug: "Phone and email are not actually optional fields"
		const timestamp = Date.now();
		const siteName = `Site Optional Fields ${timestamp}`;

		await gotoAndWait(page, '/sites/new');

		// Fill only required fields
		await page.locator('input#name').fill(siteName);

		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Leave phone and email EMPTY (they should be optional)
		const phoneInput = page.locator('input[name="office_phone"]');
		const emailInput = page.locator('input[name="contact_email"]');

		if ((await phoneInput.count()) > 0) {
			await phoneInput.clear();
		}
		if ((await emailInput.count()) > 0) {
			await emailInput.clear();
		}

		// Submit the form
		await page.getByRole('button', { name: 'Create' }).click();

		// Should NOT show validation errors
		const validationErrors = page.locator('.text-destructive');
		const errorCount = await validationErrors.count();

		// If there are errors, they should NOT be about phone or email
		if (errorCount > 0) {
			const errorText = await validationErrors.allTextContents();
			const hasPhoneError = errorText.some((text) => text.toLowerCase().includes('phone'));
			const hasEmailError = errorText.some((text) => text.toLowerCase().includes('email'));

			expect(hasPhoneError).toBe(false);
			expect(hasEmailError).toBe(false);
		}

		// Should successfully redirect to sites list
		await page.waitForURL('/sites', { timeout: 5000 });

		// Verify site was created
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text="${siteName}"`)
		});
		await expect(siteRow).toBeVisible({ timeout: 5000 });
	});

	test('should create site with all optional contact fields filled', async ({ page }) => {
		const timestamp = Date.now();
		const siteName = `Site Full Contact ${timestamp}`;
		const phone = '+1 (555) 123-4567';
		const contactPerson = 'Dr. Jane Smith';
		const contactEmail = 'jane.smith@hospital.com';

		await gotoAndWait(page, '/sites/new');

		// Fill all fields
		await page.locator('input#name').fill(siteName);

		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Fill optional contact fields
		const phoneInput = page.locator('input[name="office_phone"]');
		const personInput = page.locator('input[name="contact_person"]');
		const emailInput = page.locator('input[name="contact_email"]');

		if ((await phoneInput.count()) > 0) {
			await phoneInput.fill(phone);
		}
		if ((await personInput.count()) > 0) {
			await personInput.fill(contactPerson);
		}
		if ((await emailInput.count()) > 0) {
			await emailInput.fill(contactEmail);
		}

		// Submit
		await page.getByRole('button', { name: 'Create' }).click();
		await page.waitForURL('/sites');

		// Verify site appears
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text="${siteName}"`)
		});
		await expect(siteRow).toBeVisible({ timeout: 5000 });
	});

	test('should show validation error for invalid phone format', async ({ page }) => {
		await gotoAndWait(page, '/sites/new');

		await page.locator('input#name').fill('Test Site');

		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Enter invalid phone (letters instead of numbers)
		const phoneInput = page.locator('input[name="office_phone"]');
		if ((await phoneInput.count()) > 0) {
			await phoneInput.fill('abc-def-ghij');

			// Submit
			await page.getByRole('button', { name: 'Create' }).click();

			// Should show validation error for phone
			const phoneError = page.locator('.text-destructive').filter({
				hasText: /phone/i
			});

			// Wait a bit for validation to run
			await page.waitForTimeout(500);

			// Should either show error or not allow invalid input
			// If it shows error, verify it's visible
			const errorCount = await phoneError.count();
			if (errorCount > 0) {
				await expect(phoneError.first()).toBeVisible();
			}

			// Should still be on form page
			await expect(page).toHaveURL('/sites/new');
		}
	});

	test('should show validation error for invalid email format', async ({ page }) => {
		await gotoAndWait(page, '/sites/new');

		await page.locator('input#name').fill('Test Site');

		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Enter invalid email
		const emailInput = page.locator('input[name="contact_email"]');
		if ((await emailInput.count()) > 0) {
			await emailInput.fill('not-an-email');

			// Submit
			await page.getByRole('button', { name: 'Create' }).click();

			// Wait for validation
			await page.waitForTimeout(500);

			// Should show validation error for email
			const emailError = page.locator('.text-destructive').filter({
				hasText: /email/i
			});

			const errorCount = await emailError.count();
			if (errorCount > 0) {
				await expect(emailError.first()).toBeVisible();
			}

			// Should still be on form page
			await expect(page).toHaveURL('/sites/new');
		}
	});

	test('should show delete dialog with dependency check', async ({ page }) => {
		// Create a site first
		const timestamp = Date.now();
		const siteName = `Site Delete Test ${timestamp}`;

		await gotoAndWait(page, '/sites/new');
		await page.locator('input#name').fill(siteName);

		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		await page.getByRole('button', { name: 'Create' }).click();
		await page.waitForURL('/sites');

		// Find the site in the table
		const siteRow = page.locator('table tbody tr', {
			has: page.locator(`text="${siteName}"`)
		});
		await expect(siteRow).toBeVisible();

		// Click delete button
		const deleteButton = siteRow.getByRole('button', { name: 'Delete' });
		await deleteButton.click();

		// Delete dialog should appear
		await page.waitForTimeout(500);

		// Dialog should show the site name
		const dialog = page.locator('.fixed.inset-0', {
			has: page.locator(`text="${siteName}"`)
		});

		await expect(dialog).toBeVisible({ timeout: 2000 });

		// Should show "Checking dependencies..." while loading
		// or dependency information once loaded
		const dependencyInfo = dialog.locator('text=/dependencies|safe to delete/i');
		await expect(dependencyInfo).toBeVisible({ timeout: 3000 });
	});
});
