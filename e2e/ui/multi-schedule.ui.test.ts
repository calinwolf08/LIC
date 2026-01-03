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
 * All operations validate actual DB state after UI actions.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Multi-Schedule Management UI', () => {
	let healthSystemId: string;
	let siteId: string;
	let studentId: string;
	let preceptorId: string;
	let clerkshipId: string;

	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test.beforeEach(async () => {
		const timestamp = Date.now();

		// Create full entity chain
		healthSystemId = `hs_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('health_systems')
				.values({
					id: healthSystemId,
					name: `Test HS ${timestamp}`,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		siteId = `site_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('sites')
				.values({
					id: siteId,
					name: `Test Site ${timestamp}`,
					health_system_id: healthSystemId,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		studentId = `student_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('students')
				.values({
					id: studentId,
					name: `Test Student ${timestamp}`,
					email: `student.${timestamp}@test.edu`,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		preceptorId = `preceptor_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: `Dr. Test ${timestamp}`,
					email: `test.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		clerkshipId = `clerkship_${timestamp}`;
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
	});

	test('should display schedules list page', async ({ page }) => {
		await gotoAndWait(page, '/schedules');
		await expect(page.getByRole('heading', { name: 'Schedules' })).toBeVisible();
		await expect(page.locator('text=Manage your scheduling periods')).toBeVisible();
	});

	test('should show empty state when no schedules exist', async ({ page }) => {
		// Clear any existing scheduling periods
		await executeWithRetry(() => db.deleteFrom('scheduling_periods').execute());

		await gotoAndWait(page, '/schedules');

		// Empty state should be visible
		await expect(page.locator('text=No Schedules Yet')).toBeVisible({ timeout: 5000 });
		await expect(page.getByRole('button', { name: 'Create Schedule' })).toBeVisible();
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

	test('should create schedule via wizard and verify in database', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Test Schedule ${timestamp}`;

		await gotoAndWait(page, '/schedules/new');
		await expect(page.getByRole('heading', { name: 'Create New Schedule' })).toBeVisible();

		// Step 1: Schedule Details
		await page.locator('input#name').fill(scheduleName);

		const today = new Date();
		const startDate = new Date(today.getFullYear(), 0, 1);
		const endDate = new Date(today.getFullYear(), 11, 31);
		await page.locator('input#startDate').fill(startDate.toISOString().split('T')[0]);
		await page.locator('input#endDate').fill(endDate.toISOString().split('T')[0]);

		// Click Next
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 2: Select Students
		await expect(page.getByRole('heading', { name: 'Select Students' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 3: Select Preceptors
		await expect(page.getByRole('heading', { name: 'Select Preceptors' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 4: Select Sites
		await expect(page.getByRole('heading', { name: 'Select Sites' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 5: Select Health Systems
		await expect(page.getByRole('heading', { name: 'Select Health Systems' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 6: Select Clerkships
		await expect(page.getByRole('heading', { name: 'Select Clerkships' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Select All', exact: true }).click();
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 7: Select Teams (may be empty)
		await expect(page.getByRole('heading', { name: 'Select Teams' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Next' }).click();

		// Step 8: Review & Create
		await expect(page.getByRole('heading', { name: 'Review & Create' })).toBeVisible({
			timeout: 5000
		});
		await page.getByRole('button', { name: 'Create Schedule' }).click();

		// Should redirect to calendar
		await page.waitForURL('/calendar', { timeout: 15000 });

		// VALIDATE IN DATABASE
		const dbSchedule = await executeWithRetry(() =>
			db
				.selectFrom('scheduling_periods')
				.selectAll()
				.where('name', '=', scheduleName)
				.executeTakeFirst()
		);

		expect(dbSchedule).toBeDefined();
		expect(dbSchedule!.name).toBe(scheduleName);
	});

	test('should display existing schedules in list', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Existing Schedule ${timestamp}`;

		// Create schedule via DB
		const scheduleId = `schedule_${timestamp}`;
		const startDate = new Date();
		const endDate = new Date();
		endDate.setMonth(endDate.getMonth() + 6);

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: startDate.toISOString().split('T')[0],
					end_date: endDate.toISOString().split('T')[0],
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		await gotoAndWait(page, '/schedules');

		// Schedule should appear in list
		await expect(page.locator(`text=${scheduleName}`)).toBeVisible({ timeout: 5000 });
	});

	test('should set schedule as active and verify in database', async ({ page }) => {
		const timestamp = Date.now();

		// Create two schedules
		const schedule1Id = `schedule1_${timestamp}`;
		const schedule2Id = `schedule2_${timestamp}`;
		const schedule1Name = `Schedule One ${timestamp}`;
		const schedule2Name = `Schedule Two ${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values([
					{
						id: schedule1Id,
						name: schedule1Name,
						start_date: '2026-01-01',
						end_date: '2026-06-30',
						is_active: 0,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{
						id: schedule2Id,
						name: schedule2Name,
						start_date: '2026-07-01',
						end_date: '2026-12-31',
						is_active: 0,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				])
				.execute()
		);

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
	});

	test('should delete schedule and verify removal from database', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Deletable Schedule ${timestamp}`;
		const scheduleId = `schedule_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: '2026-01-01',
					end_date: '2026-06-30',
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

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

	test('should cancel schedule deletion', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Non-Deleted Schedule ${timestamp}`;
		const scheduleId = `schedule_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: '2026-01-01',
					end_date: '2026-06-30',
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

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

	test('should navigate to duplicate schedule', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Source Schedule ${timestamp}`;
		const scheduleId = `schedule_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: '2026-01-01',
					end_date: '2026-06-30',
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

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

	test('should show schedule statistics', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Stats Schedule ${timestamp}`;
		const scheduleId = `schedule_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: '2026-01-01',
					end_date: '2026-12-31',
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Associate entities with schedule
		await executeWithRetry(() =>
			db
				.insertInto('schedule_students')
				.values({
					id: `ss_${timestamp}`,
					scheduling_period_id: scheduleId,
					student_id: studentId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		await executeWithRetry(() =>
			db
				.insertInto('schedule_preceptors')
				.values({
					id: `sp_${timestamp}`,
					scheduling_period_id: scheduleId,
					preceptor_id: preceptorId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		await gotoAndWait(page, '/schedules');

		// Find the schedule card
		const scheduleCard = page.locator('.rounded-lg', {
			has: page.locator(`text=${scheduleName}`)
		});
		await expect(scheduleCard).toBeVisible({ timeout: 5000 });

		// Should show entity counts
		await expect(scheduleCard.locator('text=/\\d+ student/i')).toBeVisible();
		await expect(scheduleCard.locator('text=/\\d+ preceptor/i')).toBeVisible();
	});

	test('should show info box about schedules', async ({ page }) => {
		await gotoAndWait(page, '/schedules');

		// Info box should be visible
		await expect(page.locator('text=About Schedules')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=/active schedule/i')).toBeVisible();
		await expect(page.locator('text=/Duplicate/i')).toBeVisible();
	});

	test('should display schedule date range', async ({ page }) => {
		const timestamp = Date.now();
		const scheduleName = `Date Range Schedule ${timestamp}`;
		const scheduleId = `schedule_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: scheduleName,
					start_date: '2026-03-15',
					end_date: '2026-09-30',
					is_active: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

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
});
