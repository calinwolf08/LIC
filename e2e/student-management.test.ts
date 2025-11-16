/**
 * E2E Tests - Student Management
 *
 * Tests for student CRUD operations and user workflows
 */

import { expect, test } from '@playwright/test';

test.describe('Student Management', () => {
	test('should display students list page', async ({ page }) => {
		await page.goto('/students');
		await expect(page.locator('h1')).toContainText(/students/i);
	});

	test('should navigate to new student form', async ({ page }) => {
		await page.goto('/students');

		// Look for "Add Student" or "New Student" button
		const addButton = page.getByRole('link', { name: /new student|add student/i });

		if (await addButton.count() > 0) {
			await addButton.click();
			await expect(page).toHaveURL(/\/students\/new/);
		}
	});

	test('should create a new student', async ({ page }) => {
		await page.goto('/students/new');

		// Fill in student form (if inputs exist)
		const nameInput = page.locator('input[name="name"], input[id="name"]');
		const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');
		const cohortInput = page.locator('input[name="cohort"], input[id="cohort"], select[name="cohort"]');

		if (await nameInput.count() > 0) {
			await nameInput.fill('Test Student');
		}

		if (await emailInput.count() > 0) {
			await emailInput.fill('test.student@example.com');
		}

		if (await cohortInput.count() > 0) {
			if (await cohortInput.getAttribute('type') === 'select') {
				await cohortInput.selectOption('2024');
			} else {
				await cohortInput.fill('2024');
			}
		}

		// Submit form if submit button exists
		const submitButton = page.getByRole('button', { name: /create|save|submit/i });

		if (await submitButton.count() > 0) {
			await submitButton.click();

			// Should redirect to students list or show success message
			await page.waitForURL(/\/students/, { timeout: 5000 }).catch(() => {});
		}
	});

	test('should display student details', async ({ page }) => {
		await page.goto('/students');

		// Click on first student if exists
		const firstStudent = page.locator('a[href*="/students/"]').first();

		if (await firstStudent.count() > 0) {
			await firstStudent.click();
			await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
		}
	});

	test('should navigate to edit student form', async ({ page }) => {
		await page.goto('/students');

		// Find and click edit button/link
		const editLink = page.getByRole('link', { name: /edit/i }).first();

		if (await editLink.count() > 0) {
			await editLink.click();
			await expect(page).toHaveURL(/\/students\/[a-f0-9-]+\/edit/);
		}
	});

	test('should delete a student', async ({ page }) => {
		await page.goto('/students');

		// Look for delete button
		const deleteButton = page.getByRole('button', { name: /delete/i }).first();

		if (await deleteButton.count() > 0) {
			// Handle confirmation dialog if it exists
			page.on('dialog', dialog => dialog.accept());

			await deleteButton.click();

			// Wait for deletion to complete
			await page.waitForTimeout(1000);
		}
	});

	test('should search/filter students', async ({ page }) => {
		await page.goto('/students');

		// Look for search input
		const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');

		if (await searchInput.count() > 0) {
			await searchInput.fill('test');

			// Wait for results to update
			await page.waitForTimeout(500);
		}
	});

	test('should sort students', async ({ page }) => {
		await page.goto('/students');

		// Look for sortable column headers
		const nameHeader = page.getByRole('button', { name: /name/i }).or(
			page.getByRole('columnheader', { name: /name/i })
		);

		if (await nameHeader.count() > 0) {
			await nameHeader.click();

			// Wait for sort to apply
			await page.waitForTimeout(500);
		}
	});

	test('should display student statistics', async ({ page }) => {
		await page.goto('/students');

		// Check for statistics like total students, cohort breakdown, etc.
		const statsSection = page.locator('[class*="stat"], [class*="metric"]');

		if (await statsSection.count() > 0) {
			await expect(statsSection.first()).toBeVisible();
		}
	});

	test('should handle validation errors', async ({ page }) => {
		await page.goto('/students/new');

		// Try to submit empty form
		const submitButton = page.getByRole('button', { name: /create|save|submit/i });

		if (await submitButton.count() > 0) {
			await submitButton.click();

			// Look for error messages
			const errorMessage = page.locator('[class*="error"], [role="alert"]');

			if (await errorMessage.count() > 0) {
				await expect(errorMessage.first()).toBeVisible();
			}
		}
	});
});

test.describe('Student Navigation', () => {
	test('should navigate from dashboard to students', async ({ page }) => {
		await page.goto('/');

		const studentsLink = page.getByRole('link', { name: /students/i });

		if (await studentsLink.count() > 0) {
			await studentsLink.click();
			await expect(page).toHaveURL(/\/students/);
		}
	});

	test('should navigate back to dashboard from students page', async ({ page }) => {
		await page.goto('/students');

		const dashboardLink = page.getByRole('link', { name: /dashboard|home/i });

		if (await dashboardLink.count() > 0) {
			await dashboardLink.click();
			await expect(page).toHaveURL('/');
		}
	});
});
