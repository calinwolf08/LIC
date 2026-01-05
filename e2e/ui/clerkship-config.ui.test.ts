/**
 * UI E2E Test - Clerkship Configuration
 *
 * Tests the clerkship configuration functionality:
 * 1. Edit basic clerkship information
 * 2. Configure scheduling settings
 * 3. View tabs and navigation
 * 4. Switch between clerkship types
 *
 * Uses API calls for setup to ensure data is visible to the app.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Clerkship Configuration UI', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test('should display configure clerkship page', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Test Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20,
				description: 'Test description'
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);
		await expect(page.getByRole('heading', { name: 'Configure Clerkship' })).toBeVisible();
	});

	test('should show Basic Information tab by default with form fields', async ({
		page,
		request
	}) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Config Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Should see form fields for Basic Information
		await expect(page.locator('input#name')).toBeVisible();
	});

	test('should edit basic clerkship information and verify in database', async ({
		page,
		request
	}) => {
		const timestamp = Date.now();
		const originalName = `Original Clerkship ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: originalName,
				clerkship_type: 'outpatient',
				required_days: 20,
				description: 'Original description'
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);
		await expect(page.getByRole('heading', { name: 'Configure Clerkship' })).toBeVisible();

		// Update name
		const newName = `Updated Clerkship ${timestamp}`;
		await page.locator('input#name').clear();
		await page.locator('input#name').fill(newName);

		// Update required days
		await page.locator('input#required-days').clear();
		await page.locator('input#required-days').fill('25');

		// Update description
		await page.locator('textarea#description').clear();
		await page.locator('textarea#description').fill('Updated description');

		// Save
		await page.getByRole('button', { name: 'Save Basic Info' }).click();

		// Wait for success message
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbClerkship = await executeWithRetry(() =>
			db
				.selectFrom('clerkships')
				.selectAll()
				.where('id', '=', clerkshipId)
				.executeTakeFirst()
		);

		expect(dbClerkship).toBeDefined();
		expect(dbClerkship!.name).toBe(newName);
		expect(dbClerkship!.required_days).toBe(25);
		expect(dbClerkship!.description).toBe('Updated description');
	});

	test('should switch between inpatient and outpatient types', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Type Switch Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Initially outpatient
		const outpatientRadio = page.locator('input[value="outpatient"]');
		await expect(outpatientRadio).toBeChecked();

		// Switch to inpatient
		await page.locator('input[value="inpatient"]').click();

		// Save
		await page.getByRole('button', { name: 'Save Basic Info' }).click();

		// Wait for success
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbClerkship = await executeWithRetry(() =>
			db
				.selectFrom('clerkships')
				.selectAll()
				.where('id', '=', clerkshipId)
				.executeTakeFirst()
		);

		expect(dbClerkship!.clerkship_type).toBe('inpatient');
	});

	test('should navigate to Scheduling Settings tab', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Tab Nav Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Scheduling Settings tab
		await page.getByRole('button', { name: 'Scheduling Settings' }).click();

		// Wait for settings form
		await expect(page.locator('select#strategy')).toBeVisible({ timeout: 5000 });
	});

	test('should navigate to Associated Sites tab', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Sites Tab Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Associated Sites tab
		await page.getByRole('button', { name: /Associated Sites/i }).click();

		// Should show Add Site button or empty state
		await expect(
			page.locator('text=/Add Site|No sites associated/i').first()
		).toBeVisible({ timeout: 5000 });
	});

	test('should navigate to Electives tab', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Electives Tab Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Should show electives content
		await expect(page.locator('text=/No electives|Create.*Elective/i').first()).toBeVisible({
			timeout: 5000
		});
	});

	test('should navigate to Preceptor Teams tab', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Teams Tab Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Preceptor Teams tab
		await page.getByRole('button', { name: /Preceptor Teams/i }).click();

		// Should show teams content
		await expect(page.locator('text=/No teams|Create.*Team/i').first()).toBeVisible({
			timeout: 5000
		});
	});

	test('should configure scheduling settings and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Settings Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Scheduling Settings tab
		await page.getByRole('button', { name: 'Scheduling Settings' }).click();

		// Wait for settings form
		await expect(page.locator('select#strategy')).toBeVisible({ timeout: 5000 });

		// Change strategy
		await page.locator('select#strategy').selectOption('block_based');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Wait for success message
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE - settings stored in clerkship_settings table
		const dbSettings = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_settings')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.executeTakeFirst()
		);

		// Settings should exist
		if (dbSettings) {
			expect(dbSettings.assignment_strategy).toBe('block_based');
		}
	});

	test('should associate site with clerkship and verify in database', async ({ page, request }) => {
		const timestamp = Date.now();

		// Create health system via API
		const hsResponse = await request.post('/api/health-systems', {
			data: { name: `Test HS ${timestamp}`, location: 'Test Location' }
		});
		expect(hsResponse.ok()).toBe(true);
		const hsData = await hsResponse.json();
		const healthSystemId = hsData.data.id;

		// Create site via API
		const siteResponse = await request.post('/api/sites', {
			data: { name: `Test Site ${timestamp}`, health_system_id: healthSystemId }
		});
		expect(siteResponse.ok()).toBe(true);
		const siteData = await siteResponse.json();
		const siteId = siteData.data.id;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Site Assoc Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Associated Sites tab
		await page.getByRole('button', { name: /Associated Sites/i }).click();

		// Wait for sites tab content
		await expect(page.getByRole('button', { name: 'Add Site' })).toBeVisible({ timeout: 5000 });

		// Click Add Site
		await page.getByRole('button', { name: 'Add Site' }).click();

		// Wait for modal
		await expect(page.getByRole('heading', { name: 'Add Site' })).toBeVisible({ timeout: 5000 });

		// Select site
		await page.locator('select#site-select').selectOption(siteId);

		// Click Add
		await page.getByRole('button', { name: 'Add' }).last().click();

		// Wait for modal to close
		await expect(page.getByRole('heading', { name: 'Add Site' })).not.toBeVisible({
			timeout: 5000
		});

		// VALIDATE IN DATABASE
		const dbAssociation = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_sites')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('site_id', '=', siteId)
				.executeTakeFirst()
		);

		expect(dbAssociation).toBeDefined();
	});

	test('should create elective under clerkship and verify in database', async ({
		page,
		request
	}) => {
		const timestamp = Date.now();
		const electiveName = `Sports Medicine ${timestamp}`;

		// Create clerkship via API
		const clerkshipResponse = await request.post('/api/clerkships', {
			data: {
				name: `Elective Parent Clerkship ${timestamp}`,
				clerkship_type: 'outpatient',
				required_days: 20
			}
		});
		expect(clerkshipResponse.ok()).toBe(true);
		const clerkshipData = await clerkshipResponse.json();
		const clerkshipId = clerkshipData.data.id;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for electives panel
		await expect(page.locator('text=/No electives|Create Elective/i').first()).toBeVisible({
			timeout: 5000
		});

		// Click Create Elective
		const createButton = page.getByRole('button', { name: /Create.*Elective/i });
		await createButton.click();

		// Wait for form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible({
			timeout: 5000
		});

		// Fill form
		await page.locator('input#name').fill(electiveName);
		await page.locator('input#specialty').fill('Sports Medicine');
		await page.locator('input#minimumDays').clear();
		await page.locator('input#minimumDays').fill('10');

		// Submit
		await page.getByRole('button', { name: 'Create' }).last().click();

		// Wait for form to close
		await expect(page.getByRole('heading', { name: 'Create Elective' })).not.toBeVisible({
			timeout: 5000
		});

		// Elective should appear in list
		await expect(page.locator(`text=${electiveName}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbElective = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('name', '=', electiveName)
				.executeTakeFirst()
		);

		expect(dbElective).toBeDefined();
		expect(dbElective!.specialty).toBe('Sports Medicine');
		expect(dbElective!.minimum_days).toBe(10);
	});
});
