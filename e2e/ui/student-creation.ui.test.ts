/**
 * UI E2E Test - Student Creation
 *
 * This test validates the complete student creation workflow through the UI,
 * demonstrating the difference between API tests and UI tests.
 *
 * Unlike API tests which directly POST to endpoints, this test:
 * - Opens a real browser
 * - Navigates to pages
 * - Fills out forms
 * - Clicks buttons
 * - Verifies UI updates
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';

test.describe('Student Creation UI Workflow', () => {
	test('should create a student through the UI and see it in the list', async ({ page }) => {
		// Generate unique student data
		const timestamp = Date.now();
		const studentName = `Test Student ${timestamp}`;
		const studentEmail = `test.student.${timestamp}@example.com`;

		// Step 1: Navigate to students list page
		await gotoAndWait(page, '/students');
		await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

		// Step 2: Click "Add Student" button
		const addButton = page.getByRole('link', { name: 'Add Student' });
		await expect(addButton).toBeVisible();
		await addButton.click();

		// Step 3: Verify we're on the new student page
		await page.waitForURL('/students/new');
		await expect(page.getByRole('heading', { name: 'Add Student' })).toBeVisible();

		// Step 4: Fill out the form
		const nameInput = page.locator('input#name');
		const emailInput = page.locator('input#email');

		await expect(nameInput).toBeVisible();
		await expect(emailInput).toBeVisible();

		await nameInput.fill(studentName);
		await emailInput.fill(studentEmail);

		// Step 5: Submit the form
		const createButton = page.getByRole('button', { name: 'Create' });
		await expect(createButton).toBeVisible();
		await expect(createButton).toBeEnabled(); // Not disabled

		await createButton.click();

		// Step 6: Verify redirect to students list
		await page.waitForURL('/students');

		// Step 7: Verify the student appears in the table
		// This is the key difference from API tests - we're checking the UI updated!
		const studentRow = page.locator('table tbody tr', {
			has: page.locator(`text=${studentName}`)
		});

		await expect(studentRow).toBeVisible({ timeout: 5000 });

		// Step 8: Verify both name and email are displayed correctly
		await expect(studentRow.locator(`text=${studentName}`)).toBeVisible();
		await expect(studentRow.locator(`text=${studentEmail}`)).toBeVisible();

		// Step 9: Verify the row has Edit and Delete buttons
		await expect(studentRow.getByRole('button', { name: 'Edit' })).toBeVisible();
		await expect(studentRow.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	test('should show validation errors when submitting empty form', async ({ page }) => {
		// Step 1: Navigate to new student page
		await gotoAndWait(page, '/students/new');

		// Step 2: Try to submit empty form
		const createButton = page.getByRole('button', { name: 'Create' });
		await createButton.click();

		// Step 3: Wait a bit for validation to run
		await page.waitForTimeout(500);

		// Step 4: Verify we're still on the form page (didn't submit due to validation)
		await expect(page).toHaveURL('/students/new');

		// Step 5: Form should show validation errors for required fields
		const errors = page.locator('.text-destructive');
		const errorCount = await errors.count();
		expect(errorCount).toBeGreaterThan(0); // Should have at least one error
	});
});
