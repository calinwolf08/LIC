/**
 * UI E2E Test - Schedule Regeneration Modes
 *
 * Tests all schedule regeneration functionality:
 * 1. Full Regeneration - delete all and regenerate from scratch
 * 2. Smart Regeneration - preserve past assignments, regenerate future
 * 3. Completion Mode - fill gaps only with constraint bypassing
 *
 * All operations validate actual DB state after UI actions.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Schedule Regeneration UI', () => {
	let healthSystemId: string;
	let siteId: string;
	let studentId: string;
	let student2Id: string;
	let preceptorId: string;
	let clerkshipId: string;
	let teamId: string;

	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test.beforeEach(async () => {
		const timestamp = Date.now();

		// Create full entity chain for schedule testing
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

		student2Id = `student2_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('students')
				.values({
					id: student2Id,
					name: `Test Student 2 ${timestamp}`,
					email: `student2.${timestamp}@test.edu`,
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
					required_days: 10,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		teamId = `team_${timestamp}`;
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
				.values({
					id: `member_${timestamp}`,
					team_id: teamId,
					preceptor_id: preceptorId,
					priority: 1,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		// Set preceptor availability for the next 30 days
		const today = new Date();
		const availabilityValues = [];
		for (let i = 1; i <= 30; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);
			availabilityValues.push({
				id: `avail_${timestamp}_${i}`,
				preceptor_id: preceptorId,
				site_id: siteId,
				date: date.toISOString().split('T')[0],
				is_available: 1,
				created_at: new Date().toISOString()
			});
		}

		await executeWithRetry(() =>
			db.insertInto('preceptor_availability').values(availabilityValues).execute()
		);
	});

	test('should display regenerate dialog with all mode options', async ({ page }) => {
		await gotoAndWait(page, '/calendar');
		await expect(page.getByRole('heading', { name: 'Schedule Calendar' })).toBeVisible();

		// Click Regenerate Schedule button
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();

		// Dialog should appear
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible({
			timeout: 5000
		});

		// All three modes should be visible
		await expect(page.locator('text=Full Regeneration')).toBeVisible();
		await expect(page.locator('text=Smart Regeneration')).toBeVisible();
		await expect(page.locator('text=Completion Mode')).toBeVisible();
	});

	test('should perform full regeneration and verify assignments created', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Full Regeneration
		await page.locator('input[value="full"]').click();

		// Warning should appear
		await expect(page.locator('text=delete all existing assignments')).toBeVisible();

		// Set date range
		const today = new Date();
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() + 1);
		const endDate = new Date(today);
		endDate.setDate(endDate.getDate() + 14);

		await page.locator('input#start_date').fill(startDate.toISOString().split('T')[0]);
		await page.locator('input#end_date').fill(endDate.toISOString().split('T')[0]);

		// Apply regeneration
		await page.getByRole('button', { name: 'Apply Regeneration' }).click();

		// Wait for regeneration
		await expect(page.locator('text=Regenerating schedule')).toBeVisible({ timeout: 10000 });

		// Wait for success or dialog to close
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).not.toBeVisible({
			timeout: 30000
		});

		// VALIDATE IN DATABASE - assignments should exist
		const dbAssignments = await executeWithRetry(() =>
			db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('student_id', '=', studentId)
				.execute()
		);

		// Should have created some assignments
		expect(dbAssignments.length).toBeGreaterThan(0);
	});

	test('should perform smart regeneration preserving past assignments', async ({ page }) => {
		const timestamp = Date.now();

		// First create some "past" assignments in the database
		const pastDate1 = new Date();
		pastDate1.setDate(pastDate1.getDate() - 5);
		const pastDate2 = new Date();
		pastDate2.setDate(pastDate2.getDate() - 4);

		const pastAssignment1Id = `past1_${timestamp}`;
		const pastAssignment2Id = `past2_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('schedule_assignments')
				.values([
					{
						id: pastAssignment1Id,
						student_id: studentId,
						preceptor_id: preceptorId,
						clerkship_id: clerkshipId,
						site_id: siteId,
						date: pastDate1.toISOString().split('T')[0],
						assignment_type: 'outpatient',
						status: 'scheduled',
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{
						id: pastAssignment2Id,
						student_id: studentId,
						preceptor_id: preceptorId,
						clerkship_id: clerkshipId,
						site_id: siteId,
						date: pastDate2.toISOString().split('T')[0],
						assignment_type: 'outpatient',
						status: 'scheduled',
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				])
				.execute()
		);

		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Smart Regeneration
		await page.locator('input[value="smart"]').click();

		// Smart mode options should appear
		await expect(page.locator('text=Regenerate From Date')).toBeVisible();
		await expect(page.locator('text=Minimal Change')).toBeVisible();

		// Set cutoff date to today
		const today = new Date();
		await page.locator('input#cutoff_date').fill(today.toISOString().split('T')[0]);

		// Select minimal-change strategy
		await page.locator('input[value="minimal-change"]').click();

		// Set date range (year range)
		const startOfYear = new Date(today.getFullYear(), 0, 1);
		const endOfYear = new Date(today.getFullYear(), 11, 31);
		await page.locator('input#start_date').fill(startOfYear.toISOString().split('T')[0]);
		await page.locator('input#end_date').fill(endOfYear.toISOString().split('T')[0]);

		// Apply regeneration
		await page.getByRole('button', { name: 'Apply Regeneration' }).click();

		// Wait for regeneration
		await expect(page.locator('text=Regenerating schedule')).toBeVisible({ timeout: 10000 });

		// Wait for dialog to close
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).not.toBeVisible({
			timeout: 30000
		});

		// VALIDATE IN DATABASE - past assignments should still exist
		const pastAssignment1 = await executeWithRetry(() =>
			db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('id', '=', pastAssignment1Id)
				.executeTakeFirst()
		);

		const pastAssignment2 = await executeWithRetry(() =>
			db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('id', '=', pastAssignment2Id)
				.executeTakeFirst()
		);

		expect(pastAssignment1).toBeDefined();
		expect(pastAssignment2).toBeDefined();
	});

	test('should perform completion mode with constraint bypass', async ({ page }) => {
		const timestamp = Date.now();

		// Create existing assignments (the schedule that completion mode should preserve)
		const existingDate = new Date();
		existingDate.setDate(existingDate.getDate() + 5);

		const existingAssignmentId = `existing_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('schedule_assignments')
				.values({
					id: existingAssignmentId,
					student_id: studentId,
					preceptor_id: preceptorId,
					clerkship_id: clerkshipId,
					site_id: siteId,
					date: existingDate.toISOString().split('T')[0],
					assignment_type: 'outpatient',
					status: 'scheduled',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// Completion mode options should appear
		await expect(page.locator('text=Constraints to Relax')).toBeVisible();

		// Select a constraint to bypass
		await page.locator('input[value="preceptor-capacity"]').check();

		// Set date range
		const today = new Date();
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() + 1);
		const endDate = new Date(today);
		endDate.setDate(endDate.getDate() + 30);

		await page.locator('input#start_date').fill(startDate.toISOString().split('T')[0]);
		await page.locator('input#end_date').fill(endDate.toISOString().split('T')[0]);

		// Apply regeneration
		await page.getByRole('button', { name: 'Apply Regeneration' }).click();

		// Wait for regeneration
		await expect(page.locator('text=Regenerating schedule')).toBeVisible({ timeout: 10000 });

		// Wait for dialog to close
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).not.toBeVisible({
			timeout: 30000
		});

		// VALIDATE IN DATABASE - existing assignment should still exist
		const existingAssignment = await executeWithRetry(() =>
			db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('id', '=', existingAssignmentId)
				.executeTakeFirst()
		);

		expect(existingAssignment).toBeDefined();
	});

	test('should show warning only for full regeneration mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Default might be smart mode - check for no warning
		await page.locator('input[value="smart"]').click();
		await expect(page.locator('text=delete all existing assignments')).not.toBeVisible();

		// Switch to completion mode - should have no warning
		await page.locator('input[value="completion"]').click();
		await expect(page.locator('text=delete all existing assignments')).not.toBeVisible();

		// Switch to full mode - warning should appear
		await page.locator('input[value="full"]').click();
		await expect(page.locator('text=delete all existing assignments')).toBeVisible();
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

		// Minimal Change description
		await expect(
			page.locator('text=Try to keep as many future assignments as possible')
		).toBeVisible();

		// Full Reoptimize description
		await expect(
			page.locator('text=Find completely new optimal solution for future dates')
		).toBeVisible();
	});

	test('should show all constraint bypass options in completion mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// All constraint options should be visible
		await expect(page.locator('text=Preceptor Capacity')).toBeVisible();
		await expect(page.locator('text=Site Capacity')).toBeVisible();
		await expect(page.locator('text=Specialty Matching')).toBeVisible();
		await expect(page.locator('text=Health System Continuity')).toBeVisible();
		await expect(page.locator('text=Double Booking')).toBeVisible();
	});

	test('should use full-reoptimize strategy in smart mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Smart Regeneration
		await page.locator('input[value="smart"]').click();

		// Select full-reoptimize strategy
		await page.locator('input[value="full-reoptimize"]').click();

		// Set date range
		const today = new Date();
		const startDate = new Date(today.getFullYear(), 0, 1);
		const endDate = new Date(today.getFullYear(), 11, 31);
		await page.locator('input#start_date').fill(startDate.toISOString().split('T')[0]);
		await page.locator('input#end_date').fill(endDate.toISOString().split('T')[0]);

		// Apply regeneration
		await page.getByRole('button', { name: 'Apply Regeneration' }).click();

		// Wait for regeneration
		await expect(page.locator('text=Regenerating schedule')).toBeVisible({ timeout: 10000 });

		// Wait for dialog to close
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).not.toBeVisible({
			timeout: 30000
		});
	});

	test('should select multiple constraints in completion mode', async ({ page }) => {
		await gotoAndWait(page, '/calendar');

		// Click Regenerate Schedule
		await page.getByRole('button', { name: 'Regenerate Schedule' }).click();
		await expect(page.getByRole('heading', { name: 'Regenerate Schedule' })).toBeVisible();

		// Select Completion Mode
		await page.locator('input[value="completion"]').click();

		// Select multiple constraints
		await page.locator('input[value="preceptor-capacity"]').check();
		await page.locator('input[value="specialty-match"]').check();
		await page.locator('input[value="health-system-continuity"]').check();

		// Verify they are checked
		await expect(page.locator('input[value="preceptor-capacity"]')).toBeChecked();
		await expect(page.locator('input[value="specialty-match"]')).toBeChecked();
		await expect(page.locator('input[value="health-system-continuity"]')).toBeChecked();

		// Others should not be checked
		await expect(page.locator('input[value="site-capacity"]')).not.toBeChecked();
		await expect(page.locator('input[value="no-double-booking"]')).not.toBeChecked();
	});
});
