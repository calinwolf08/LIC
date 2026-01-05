/**
 * UI E2E Test - Schedule Regeneration Modes
 *
 * Tests the schedule regeneration dialog functionality:
 * 1. Display regeneration dialog with mode options
 * 2. Full Regeneration mode selection
 * 3. Smart Regeneration mode selection
 * 4. Completion Mode selection
 * 5. Dialog controls and navigation
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Schedule Regeneration UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test('should display regenerate button on calendar page', async ({ page }) => {
		await gotoAndWait(page, '/calendar');
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Regenerate button should be visible
		await expect(page.getByRole('button', { name: 'Regenerate Schedule' })).toBeVisible();
	});

	test('should open regenerate dialog when button is clicked', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule button
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();

		// Dialog should appear
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible({
			timeout: 5000
		});
	});

	test('should display all regeneration mode options', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// All three modes should be visible
		await expect(page.locator('text=Full Regeneration')).toBeVisible();
		await expect(page.locator('text=Smart Regeneration')).toBeVisible();
		await expect(page.locator('text=Completion Mode')).toBeVisible();
	});

	test('should show warning when selecting full regeneration mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Full Regeneration
		await page.locator('input[value="full"]').click();

		// Warning should appear
		await expect(page.locator('text=delete all existing assignments')).toBeVisible();
	});

	test('should not show warning for smart regeneration mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Smart Regeneration
		await page.locator('input[value="smart"]').click();

		// No warning about deleting all assignments
		await expect(page.locator('text=delete all existing assignments')).not.toBeVisible();
	});

	test('should not show warning for completion mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// No warning about deleting all assignments
		await expect(page.locator('text=delete all existing assignments')).not.toBeVisible();
	});

	test('should show smart regeneration strategy options', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Smart Regeneration
		await page.locator('input[value="smart"]').click();

		// Both strategies should be visible
		await expect(page.locator('text=Minimal Change')).toBeVisible();
		await expect(page.locator('text=Full Reoptimize')).toBeVisible();
	});

	test('should show constraint bypass options in completion mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// Constraint bypass section should appear
		await expect(page.locator('text=Constraints to Relax')).toBeVisible();

		// All constraint options should be visible
		await expect(page.locator('text=Preceptor Capacity')).toBeVisible();
		await expect(page.locator('text=Site Capacity')).toBeVisible();
	});

	test('should allow selecting multiple constraints in completion mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// Select multiple constraints
		await page.locator('input[value="preceptor-capacity"]').check();
		await page.locator('input[value="specialty-match"]').check();

		// Verify they are checked
		await expect(page.locator('input[value="preceptor-capacity"]')).toBeChecked();
		await expect(page.locator('input[value="specialty-match"]')).toBeChecked();
	});

	test('should allow canceling regeneration dialog', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Click Cancel
		await page.getByRole('button', { name: 'Cancel' }).click();

		// Dialog should close
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).not.toBeVisible({
			timeout: 5000
		});
	});

	test('should show date range inputs', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Date inputs should be visible
		await expect(page.locator('input#start_date')).toBeVisible();
		await expect(page.locator('input#end_date')).toBeVisible();
	});

	test('should show Apply Regeneration button', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Apply button should be visible
		await expect(page.getByRole('button', { name: 'Apply Regeneration' })).toBeVisible();
	});

	test('should show cutoff date input for smart mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Smart Regeneration
		await page.locator('input[value="smart"]').click();

		// Cutoff date options should appear
		await expect(page.locator('text=Regenerate From Date')).toBeVisible();
	});

	test('should switch between regeneration modes', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Full mode - warning appears
		await page.locator('input[value="full"]').click();
		await expect(page.locator('text=delete all existing assignments')).toBeVisible();

		// Switch to Smart mode - warning disappears
		await page.locator('input[value="smart"]').click();
		await expect(page.locator('text=delete all existing assignments')).not.toBeVisible();
		await expect(page.locator('text=Minimal Change')).toBeVisible();

		// Switch to Completion mode
		await page.locator('input[value="completion"]').click();
		await expect(page.locator('text=Constraints to Relax')).toBeVisible();
	});
});
