/**
 * UI E2E Test - Multi-Schedule Management
 *
 * Tests the scheduling period (multi-schedule) functionality through the UI:
 * 1. View list of schedules
 * 2. Create new schedule via wizard
 * 3. Set active schedule
 * 4. Duplicate existing schedule
 * 5. Delete schedule
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Multi-Schedule Management UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test('should display schedules list page', async ({ page }) => {
		await gotoAndWait(page, '/schedules');
		await expect(page.getByRole('heading', { name: 'Schedules' })).toBeVisible();
	});

	test('should show info box about schedules', async ({ page }) => {
		await gotoAndWait(page, '/schedules');

		// Info box should be visible
		await expect(page.locator('text=About Schedules')).toBeVisible({ timeout: 5000 });
	});

	test('should display New Schedule button', async ({ page }) => {
		await gotoAndWait(page, '/schedules');

		// New Schedule button should be visible
		await expect(page.getByRole('button', { name: '+ New Schedule' })).toBeVisible();
	});

	test('should navigate to new schedule wizard', async ({ page }) => {
		await gotoAndWait(page, '/schedules');

		// Click New Schedule button
		await page.getByRole('button', { name: '+ New Schedule' }).click();

		// Should navigate to wizard
		await page.waitForURL('/schedules/new');
		await expect(page.getByRole('heading', { name: 'Create New Schedule' })).toBeVisible({
			timeout: 5000
		});
	});

	test('should display existing schedules in list', async ({ page, request }) => {
		const timestamp = Date.now();
		const scheduleName = `Existing Schedule ${timestamp}`;

		// Create schedule via API
		const response = await request.post('/api/scheduling-periods', {
			data: {
				name: scheduleName,
				start_date: '2026-01-01',
				end_date: '2026-06-30'
			}
		});
		expect(response.ok()).toBe(true);

		await gotoAndWait(page, '/schedules');

		// Schedule should appear in list
		await expect(page.locator(`text=${scheduleName}`)).toBeVisible({ timeout: 5000 });
	});

	test('should set schedule as active and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create two schedules via API
		const schedule1Name = `Schedule One ${timestamp}`;
		const schedule2Name = `Schedule Two ${timestamp}`;

		const response1 = await request.post('/api/scheduling-periods', {
			data: {
				name: schedule1Name,
				start_date: '2026-01-01',
				end_date: '2026-06-30'
			}
		});
		expect(response1.ok()).toBe(true);

		const response2 = await request.post('/api/scheduling-periods', {
			data: {
				name: schedule2Name,
				start_date: '2026-07-01',
				end_date: '2026-12-31'
			}
		});
		expect(response2.ok()).toBe(true);
		const schedule2Data = await response2.json();
		const schedule2Id = schedule2Data.data.id;

		await gotoAndWait(page, '/schedules');

		// Both schedules should be visible
		await expect(page.locator(`text=${schedule1Name}`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`text=${schedule2Name}`)).toBeVisible();

		// Find the card for schedule 2 and click Set Active
		const schedule2Card = page.locator('.rounded-lg', {
			has: page.locator(`text=${schedule2Name}`)
		});
		await schedule2Card.getByRole('button', { name: 'Set Active' }).click();

		// Wait for update
		await page.waitForTimeout(1000);

		// Schedule 2 should now show Active badge
		await expect(schedule2Card.locator('text=Active')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbSchedule = await executeWithRetry(() =>
			db
				.selectFrom('scheduling_periods')
				.selectAll()
				.where('id', '=', schedule2Id)
				.executeTakeFirst()
		);

		expect(dbSchedule).toBeDefined();
		expect(dbSchedule!.is_active).toBe(1);
	});

	test('should delete schedule and verify removal from database', async ({ page, request }) => {
		const timestamp = Date.now();
		const scheduleName = `Deletable Schedule ${timestamp}`;

		// Create schedule via API
		const response = await request.post('/api/scheduling-periods', {
			data: {
				name: scheduleName,
				start_date: '2026-01-01',
				end_date: '2026-06-30'
			}
		});
		expect(response.ok()).toBe(true);
		const data = await response.json();
		const scheduleId = data.data.id;

		await gotoAndWait(page, '/schedules');

		// Find the schedule card
		const scheduleCard = page.locator('.rounded-lg', {
			has: page.locator(`text=${scheduleName}`)
		});
		await expect(scheduleCard).toBeVisible({ timeout: 5000 });

		// Click Delete
		await scheduleCard.getByRole('button', { name: 'Delete' }).click();

		// Confirm deletion
		await expect(page.locator('text=Delete?')).toBeVisible({ timeout: 5000 });
		await scheduleCard.getByRole('button', { name: 'Yes' }).click();

		// Wait for deletion
		await page.waitForTimeout(1000);

		// Schedule should be removed
		await expect(page.locator(`text=${scheduleName}`)).not.toBeVisible({ timeout: 5000 });

		// VALIDATE removed from DATABASE
		const dbSchedule = await executeWithRetry(() =>
			db
				.selectFrom('scheduling_periods')
				.selectAll()
				.where('id', '=', scheduleId)
				.executeTakeFirst()
		);

		expect(dbSchedule).toBeUndefined();
	});

	test('should cancel schedule deletion', async ({ page, request }) => {
		const timestamp = Date.now();
		const scheduleName = `Non-Deleted Schedule ${timestamp}`;

		// Create schedule via API
		const response = await request.post('/api/scheduling-periods', {
			data: {
				name: scheduleName,
				start_date: '2026-01-01',
				end_date: '2026-06-30'
			}
		});
		expect(response.ok()).toBe(true);
		const data = await response.json();
		const scheduleId = data.data.id;

		await gotoAndWait(page, '/schedules');

		// Find the schedule card
		const scheduleCard = page.locator('.rounded-lg', {
			has: page.locator(`text=${scheduleName}`)
		});

		// Click Delete
		await scheduleCard.getByRole('button', { name: 'Delete' }).click();

		// Cancel deletion
		await expect(page.locator('text=Delete?')).toBeVisible({ timeout: 5000 });
		await scheduleCard.getByRole('button', { name: 'No' }).click();

		// Schedule should still be visible
		await expect(page.locator(`text=${scheduleName}`)).toBeVisible();

		// VALIDATE still exists in DATABASE
		const dbSchedule = await executeWithRetry(() =>
			db
				.selectFrom('scheduling_periods')
				.selectAll()
				.where('id', '=', scheduleId)
				.executeTakeFirst()
		);

		expect(dbSchedule).toBeDefined();
	});

	test('should navigate to duplicate schedule', async ({ page, request }) => {
		const timestamp = Date.now();
		const scheduleName = `Source Schedule ${timestamp}`;

		// Create schedule via API
		const response = await request.post('/api/scheduling-periods', {
			data: {
				name: scheduleName,
				start_date: '2026-01-01',
				end_date: '2026-06-30'
			}
		});
		expect(response.ok()).toBe(true);

		await gotoAndWait(page, '/schedules');

		// Find the schedule card
		const scheduleCard = page.locator('.rounded-lg', {
			has: page.locator(`text=${scheduleName}`)
		});

		// Click Duplicate
		await scheduleCard.getByRole('button', { name: 'Duplicate' }).click();

		// Should navigate to new schedule page with source param
		await page.waitForURL(/\/schedules\/new\?source=/);
	});

	test('should display schedule date range', async ({ page, request }) => {
		const timestamp = Date.now();
		const scheduleName = `Date Range Schedule ${timestamp}`;

		// Create schedule via API
		const response = await request.post('/api/scheduling-periods', {
			data: {
				name: scheduleName,
				start_date: '2026-03-15',
				end_date: '2026-09-30'
			}
		});
		expect(response.ok()).toBe(true);

		await gotoAndWait(page, '/schedules');

		// Find the schedule card
		const scheduleCard = page.locator('.rounded-lg', {
			has: page.locator(`text=${scheduleName}`)
		});
		await expect(scheduleCard).toBeVisible({ timeout: 5000 });

		// Should show date range
		await expect(scheduleCard.locator('text=/Mar.*2026/i')).toBeVisible();
		await expect(scheduleCard.locator('text=/Sep.*2026/i')).toBeVisible();
	});

	test('should show schedule wizard steps', async ({ page }) => {
		await gotoAndWait(page, '/schedules/new');
		await expect(page.getByRole('heading', { name: 'Create New Schedule' })).toBeVisible();

		// First step should be Schedule Details
		await expect(page.locator('input#name')).toBeVisible();
		await expect(page.locator('input#startDate')).toBeVisible();
		await expect(page.locator('input#endDate')).toBeVisible();
	});

	test('should navigate to next step in wizard', async ({ page, request }) => {
		const timestamp = Date.now();

		// First create some entities so the wizard has data to display
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Wizard HS ${timestamp}`, location: 'Test Location' }
		});
		expect(hsResponse.ok()).toBe(true);
		const hsData = await hsResponse.json();
		const healthSystemId = hsData.data.id;

		const studentResponse = await request.post('/api/students', {
			data: { name: `Wizard Student ${timestamp}`, email: `wizard.${timestamp}@test.edu` }
		});
		expect(studentResponse.ok()).toBe(true);

		await gotoAndWait(page, '/schedules/new');

		// Fill first step
		await page.locator('input#name').fill(`Wizard Test ${timestamp}`);
		await page.locator('input#startDate').fill('2026-01-01');
		await page.locator('input#endDate').fill('2026-12-31');

		// Click Next
		await page.getByRole('button', { name: 'Next' }).click();

		// Should be on Students step
		await expect(page.getByRole('heading', { name: 'Select Students' })).toBeVisible({
			timeout: 5000
		});
	});

	test('should allow going back in wizard', async ({ page }) => {
		const timestamp = Date.now();

		await gotoAndWait(page, '/schedules/new');

		// Fill first step
		await page.locator('input#name').fill(`Back Test ${timestamp}`);
		await page.locator('input#startDate').fill('2026-01-01');
		await page.locator('input#endDate').fill('2026-12-31');

		// Click Next
		await page.getByRole('button', { name: 'Next' }).click();

		// Should be on Students step
		await expect(page.getByRole('heading', { name: 'Select Students' })).toBeVisible({
			timeout: 5000
		});

		// Click Back
		await page.getByRole('button', { name: 'Back' }).click();

		// Should be back on first step
		await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });
	});
});
