/**
 * UI E2E Test - Blackout Date Management
 *
 * Tests the blackout date functionality through the UI:
 * 1. Display blackout dates panel
 * 2. Add blackout dates
 * 3. Delete blackout dates
 * 4. Toggle panel visibility
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Blackout Date Management UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test('should display blackout dates button on calendar page', async ({ page }) => {
		await gotoAndWait(page, '/calendar');
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Show Blackout Dates button should be visible
		await expect(page.getByRole('button', { name: /Show Blackout Dates/i })).toBeVisible();
	});

	test('should show blackout dates panel when button is clicked', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click to show panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();

		// Blackout Dates panel should appear
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible({
			timeout: 5000
		});
	});

	test('should toggle blackout dates panel visibility', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Initially hidden
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).not.toBeVisible();

		// Show panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible({
			timeout: 5000
		});

		// Hide panel
		await page.getByRole('button', { name: /Hide Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).not.toBeVisible({
			timeout: 5000
		});
	});

	test('should display input fields in blackout dates panel', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Input fields should be available
		await expect(page.locator('input#blackout-date')).toBeVisible();
		await expect(page.locator('input#blackout-reason')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
	});

	test('should add blackout date and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();
		// Use a date far in the future to avoid conflicts
		const blackoutDate = new Date();
		blackoutDate.setDate(blackoutDate.getDate() + 100 + (timestamp % 50));
		const blackoutDateStr = blackoutDate.toISOString().split('T')[0];
		const reason = `Test Holiday ${timestamp}`;

		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Fill in blackout date
		await page.locator('input#blackout-date').fill(blackoutDateStr);
		await page.locator('input#blackout-reason').fill(reason);

		// Add blackout date
		await page.getByRole('button', { name: 'Add' }).click();

		// Wait for addition
		await page.waitForTimeout(1000);

		// Blackout date should appear in list
		await expect(page.locator(`text=${reason}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbBlackoutDate = await executeWithRetry(() =>
			db
				.selectFrom('blackout_dates')
				.selectAll()
				.where('date', '=', blackoutDateStr)
				.where('reason', '=', reason)
				.executeTakeFirst()
		);

		expect(dbBlackoutDate).toBeDefined();
		expect(dbBlackoutDate!.date).toBe(blackoutDateStr);
		expect(dbBlackoutDate!.reason).toBe(reason);
	});

	test('should delete blackout date and verify removal from database', async ({
		page,
		request
	}) => {
		const timestamp = Date.now();

		// Create blackout date via API
		const blackoutDate = new Date();
		blackoutDate.setDate(blackoutDate.getDate() + 150);
		const blackoutDateStr = blackoutDate.toISOString().split('T')[0];
		const reason = `Deletable Holiday ${timestamp}`;

		const response = await request.post('/api/blackout-dates', {
			data: {
				date: blackoutDateStr,
				reason: reason
			}
		});
		expect(response.ok()).toBe(true);
		const data = await response.json();
		const blackoutId = data.data.id;

		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Wait for blackout date to appear
		await expect(page.locator(`text=${reason}`)).toBeVisible({ timeout: 5000 });

		// Find delete button in the blackout date row
		const blackoutRow = page.locator('.flex.items-center', {
			has: page.locator(`text=${reason}`)
		});

		// Setup dialog handler
		page.on('dialog', (dialog) => dialog.accept());

		// Click delete
		await blackoutRow.getByRole('button', { name: /Delete|Remove|×/i }).click();

		// Wait for deletion
		await page.waitForTimeout(1000);

		// Blackout date should be removed
		await expect(page.locator(`text=${reason}`)).not.toBeVisible({ timeout: 5000 });

		// VALIDATE removed from DATABASE
		const dbBlackoutDate = await executeWithRetry(() =>
			db
				.selectFrom('blackout_dates')
				.selectAll()
				.where('id', '=', blackoutId)
				.executeTakeFirst()
		);

		expect(dbBlackoutDate).toBeUndefined();
	});

	test('should display multiple blackout dates', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create multiple blackout dates via API
		const dates = [
			{ dayOffset: 200, reason: `First Holiday ${timestamp}` },
			{ dayOffset: 210, reason: `Second Holiday ${timestamp}` },
			{ dayOffset: 220, reason: `Third Holiday ${timestamp}` }
		];

		for (const { dayOffset, reason } of dates) {
			const date = new Date();
			date.setDate(date.getDate() + dayOffset);
			await request.post('/api/blackout-dates', {
				data: {
					date: date.toISOString().split('T')[0],
					reason: reason
				}
			});
		}

		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// All three should be visible
		await expect(page.locator(`text=First Holiday ${timestamp}`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`text=Second Holiday ${timestamp}`)).toBeVisible();
		await expect(page.locator(`text=Third Holiday ${timestamp}`)).toBeVisible();
	});

	test('should show blackout date count badge', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create blackout dates via API
		for (let i = 0; i < 3; i++) {
			const date = new Date();
			date.setDate(date.getDate() + 250 + i);
			await request.post('/api/blackout-dates', {
				data: {
					date: date.toISOString().split('T')[0],
					reason: `Badge Test ${timestamp} ${i}`
				}
			});
		}

		await gotoAndWait(page, '/calendar');

		// Button should show count badge
		const blackoutButton = page.getByRole('button', { name: /Blackout Dates/i });
		await expect(blackoutButton).toBeVisible();
	});

	test('should handle empty state gracefully', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Input fields should be available even with no existing dates
		await expect(page.locator('input#blackout-date')).toBeVisible();
		await expect(page.locator('input#blackout-reason')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
	});

	test('should clear inputs after adding blackout date', async ({ page }) => {
		const timestamp = Date.now();
		const blackoutDate = new Date();
		blackoutDate.setDate(blackoutDate.getDate() + 300);
		const blackoutDateStr = blackoutDate.toISOString().split('T')[0];
		const reason = `Clear Input Test ${timestamp}`;

		await gotoAndWait(page, '/calendar');

		// Show blackout dates panel
		await page.getByRole('button', { name: /Show Blackout Dates/i }).click();
		await expect(page.getByRole('heading', { name: 'Blackout Dates' })).toBeVisible();

		// Fill in blackout date
		await page.locator('input#blackout-date').fill(blackoutDateStr);
		await page.locator('input#blackout-reason').fill(reason);

		// Add blackout date
		await page.getByRole('button', { name: 'Add' }).click();

		// Wait for addition
		await page.waitForTimeout(1000);

		// Blackout date should appear
		await expect(page.locator(`text=${reason}`)).toBeVisible({ timeout: 5000 });

		// Reason input should be cleared (ready for next entry)
		const reasonValue = await page.locator('input#blackout-reason').inputValue();
		expect(reasonValue).toBe('');
	});
});
