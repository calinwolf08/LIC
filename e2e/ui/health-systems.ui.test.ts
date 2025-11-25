/**
 * UI E2E Test - Health Systems Management
 *
 * These tests would have caught the bugs found during manual testing:
 * 1. Health system delete 400 error when dependencies exist
 * 2. Missing dependency warnings in UI
 * 3. Delete button not being disabled when it should be
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';

test.describe('Health Systems UI Workflow', () => {
	test('should create a health system and see it in the list', async ({ page }) => {
		const timestamp = Date.now();
		const healthSystemName = `Test Health System ${timestamp}`;
		const location = `Test Location ${timestamp}`;

		// Navigate to health systems page
		await gotoAndWait(page, '/health-systems');
		await expect(page.getByRole('heading', { name: 'Health Systems' })).toBeVisible();

		// Click "Add Health System" button
		const addButton = page.getByRole('button', { name: 'Add Health System' });
		await expect(addButton).toBeVisible();
		await addButton.click();

		// Modal should appear
		await page.waitForTimeout(300);

		// Fill out the form in the modal
		const nameInput = page.locator('input#name');
		const locationInput = page.locator('input#location');

		await expect(nameInput).toBeVisible();
		await nameInput.fill(healthSystemName);
		await locationInput.fill(location);

		// Submit the form
		const createButton = page.getByRole('button', { name: 'Create' }).last();
		await createButton.click();

		// Wait for the modal to close and list to update
		await page.waitForTimeout(500);

		// Verify the health system appears in the list
		const healthSystemCard = page.locator('.rounded-lg.border', {
			has: page.locator(`text="${healthSystemName}"`)
		});

		await expect(healthSystemCard).toBeVisible({ timeout: 5000 });
		await expect(healthSystemCard.locator(`text="${location}"`)).toBeVisible();

		// Verify Edit and Delete buttons are present
		await expect(healthSystemCard.getByRole('button', { name: 'Edit' })).toBeVisible();
		await expect(healthSystemCard.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	test('should disable delete button when health system has dependencies', async ({ page }) => {
		const timestamp = Date.now();
		const healthSystemName = `HS With Site ${timestamp}`;

		// Step 1: Create a health system
		await gotoAndWait(page, '/health-systems');
		const addButton = page.getByRole('button', { name: 'Add Health System' });
		await addButton.click();
		await page.waitForTimeout(300);

		const nameInput = page.locator('input#name');
		await nameInput.fill(healthSystemName);

		const createButton = page.getByRole('button', { name: 'Create' }).last();
		await createButton.click();
		await page.waitForTimeout(500);

		// Step 2: Navigate to sites and create a site under this health system
		await gotoAndWait(page, '/sites');
		await page.getByRole('link', { name: /new site/i }).click();
		await page.waitForURL('/sites/new');

		// Fill site form
		await page.locator('input#name').fill(`Test Site ${timestamp}`);

		// Select the health system we just created from dropdown
		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });

		// Submit
		await page.getByRole('button', { name: 'Create' }).click();
		await page.waitForURL('/sites');

		// Step 3: Go back to health systems page
		await gotoAndWait(page, '/health-systems');

		// Wait for dependencies to load
		await page.waitForTimeout(1000);

		// Step 4: Find the health system card
		const healthSystemCard = page.locator('.rounded-lg.border', {
			has: page.locator(`text="${healthSystemName}"`)
		});

		await expect(healthSystemCard).toBeVisible();

		// Step 5: Verify delete button is disabled
		const deleteButton = healthSystemCard.getByRole('button', { name: 'Delete' });
		await expect(deleteButton).toBeDisabled();

		// Step 6: Verify dependency info is shown
		// Should show "(1 dependency)" or similar
		await expect(healthSystemCard.locator('text=/\\(\\d+ (dependency|dependencies)\\)/')).toBeVisible();
	});

	test('should show dependency tooltip on disabled delete button', async ({ page }) => {
		const timestamp = Date.now();
		const healthSystemName = `HS Tooltip Test ${timestamp}`;

		// Create health system
		await gotoAndWait(page, '/health-systems');
		await page.getByRole('button', { name: 'Add Health System' }).click();
		await page.waitForTimeout(300);
		await page.locator('input#name').fill(healthSystemName);
		await page.getByRole('button', { name: 'Create' }).last().click();
		await page.waitForTimeout(500);

		// Create a site under this health system
		await gotoAndWait(page, '/sites');
		await page.getByRole('link', { name: /new site/i }).click();
		await page.waitForURL('/sites/new');
		await page.locator('input#name').fill(`Site ${timestamp}`);
		const healthSystemSelect = page.locator('select[name="health_system_id"]');
		await healthSystemSelect.selectOption({ label: healthSystemName });
		await page.getByRole('button', { name: 'Create' }).click();
		await page.waitForURL('/sites');

		// Back to health systems
		await gotoAndWait(page, '/health-systems');
		await page.waitForTimeout(1000);

		// Find the card
		const healthSystemCard = page.locator('.rounded-lg.border', {
			has: page.locator(`text="${healthSystemName}"`)
		});

		// Check the delete button has a title attribute (tooltip)
		const deleteButton = healthSystemCard.getByRole('button', { name: 'Delete' });
		const title = await deleteButton.getAttribute('title');

		expect(title).toBeTruthy();
		expect(title).toMatch(/Cannot delete/i);
		expect(title).toMatch(/site/i);
	});

	test('should allow delete when health system has no dependencies', async ({ page }) => {
		const timestamp = Date.now();
		const healthSystemName = `HS No Deps ${timestamp}`;

		// Create health system
		await gotoAndWait(page, '/health-systems');
		await page.getByRole('button', { name: 'Add Health System' }).click();
		await page.waitForTimeout(300);
		await page.locator('input#name').fill(healthSystemName);
		await page.getByRole('button', { name: 'Create' }).last().click();
		await page.waitForTimeout(1000);

		// Find the card (should be freshly created, no dependencies)
		const healthSystemCard = page.locator('.rounded-lg.border', {
			has: page.locator(`text="${healthSystemName}"`)
		});

		await expect(healthSystemCard).toBeVisible();

		// Delete button should be enabled
		const deleteButton = healthSystemCard.getByRole('button', { name: 'Delete' });
		await expect(deleteButton).toBeEnabled({ timeout: 2000 });

		// Click delete
		await deleteButton.click();

		// Confirm in the dialog
		page.once('dialog', (dialog) => {
			expect(dialog.message()).toContain(healthSystemName);
			dialog.accept();
		});

		// Wait for deletion
		await page.waitForTimeout(500);

		// Verify it's gone from the list
		await expect(healthSystemCard).not.toBeVisible();
	});
});
