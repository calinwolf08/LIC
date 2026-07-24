import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * End-to-end "whole app" journey.
 *
 * Unlike the per-feature specs, this test walks a single continuous session the
 * way a real coordinator would use the app, carrying the SAME entities through
 * every stage:
 *
 *   add locations → add a preceptor → add a clerkship → add two students →
 *   onboard them → make an assignment → validate (clean) → hit a HARD conflict
 *   (double-book) → hit a SOFT conflict (preceptor capacity) → edit an entity →
 *   make another assignment → re-validate (clean) → confirm requirement status.
 *
 * The seeded active schedule ("My Schedule") runs 2026-07-01 → 2027-06-30, so
 * D1/D2 below are in range and in the future (they count as "scheduled").
 */

// Unique names so the run is independent on the shared test DB.
const STAMP = Date.now();
const HS = `E2E-HS ${STAMP}`;
const SITE = `E2E-Site ${STAMP}`;
const PRECEPTOR = `Dr. E2E ${STAMP}`;
const CLERKSHIP = `E2E-Clerkship ${STAMP}`;
const STUDENT_A = `E2E Student A ${STAMP}`;
const STUDENT_A2 = `${STUDENT_A} (renamed)`;
const STUDENT_B = `E2E Student B ${STAMP}`;
const EMAIL_A = `e2e_a_${STAMP}@example.com`;
const EMAIL_B = `e2e_b_${STAMP}@example.com`;
const D1 = '2026-10-05';
const D2 = '2026-10-06';

/** Open a student's detail page from the students list. */
async function openStudent(page: Page, name: string) {
	await page.goto('/students');
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

/**
 * Drive the create-assignment dialog on a student's page (student is locked).
 * `outcome` controls the expectation: a clean create, a soft-warning "create
 * anyway", or a hard block that cannot be submitted.
 */
async function addAssignment(
	page: Page,
	opts: {
		clerkship: string;
		preceptor: string;
		date: string;
		outcome: 'clean' | 'soft' | 'hard';
		warning?: RegExp;
	}
) {
	await page.getByRole('button', { name: 'Add assignment' }).first().click();
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toBeVisible();

	// Option lists load async from the API; wait for our entities to appear.
	await expect(page.locator('#ca-clerkship option', { hasText: opts.clerkship })).toHaveCount(1, {
		timeout: 20000
	});
	await expect(page.locator('#ca-preceptor option', { hasText: opts.preceptor })).toHaveCount(1, {
		timeout: 20000
	});
	await page.locator('#ca-clerkship').selectOption({ label: opts.clerkship });
	await page.locator('#ca-preceptor').selectOption({ label: opts.preceptor });
	await page.locator('#ca-date').fill(opts.date);
	await page.waitForTimeout(700); // debounced dry-run validation

	if (opts.outcome === 'clean') {
		await expect(page.getByText('No conflicts.')).toBeVisible();
		await page.getByRole('button', { name: /^create$/i }).click();
		await expect(page.getByText(/assignment created/i)).toBeVisible({ timeout: 15000 });
	} else if (opts.outcome === 'soft') {
		if (opts.warning) await expect(page.getByText(opts.warning)).toBeVisible();
		await page.getByRole('button', { name: /create anyway/i }).click();
		await expect(page.getByText(/assignment created/i)).toBeVisible({ timeout: 15000 });
	} else {
		// hard: cannot create, dialog stays open
		await expect(page.getByText('Cannot create:')).toBeVisible();
		if (opts.warning) await expect(page.getByText(opts.warning)).toBeVisible();
		await expect(page.getByRole('button', { name: /^create$/i })).toBeDisabled();
		await page.getByRole('button', { name: 'Cancel' }).click();
	}
}

test('end-to-end: build entities, assign, validate, edit, reassign, revalidate', async ({
	page
}) => {
	test.setTimeout(120000);
	await login(page, ADMIN);

	// --- 1. Add a location (health system + site) ---
	await page.goto('/locations');
	await page.getByRole('button', { name: 'Add health system' }).click();
	let dialog = page.getByRole('dialog');
	await dialog.locator('#name').fill(HS);
	await dialog.getByRole('button', { name: 'Create' }).click();
	await expect(page.locator('tr', { hasText: HS })).toBeVisible();

	await page.getByRole('tab', { name: 'Sites' }).click();
	await page.getByRole('button', { name: 'Add site' }).click();
	dialog = page.getByRole('dialog');
	await dialog.locator('#name').fill(SITE);
	await dialog.locator('#health_system_id').selectOption({ label: HS });
	await dialog.getByRole('button', { name: 'Create Site' }).click();
	await expect(page.getByText(SITE).first()).toBeVisible();

	// --- 2. Add a preceptor (capacity 1) in that health system/site ---
	await page.goto('/preceptors/new');
	await page.locator('#name').fill(PRECEPTOR);
	await page.locator('#email').fill(`precept_${STAMP}@example.com`);
	await page.locator('#max_students').fill('1');
	await page.getByRole('button', { name: /next/i }).click();
	await expect(page.getByRole('heading', { name: 'Health System & Sites' })).toBeVisible();
	await page.locator('#health_system_id').selectOption({ label: HS });
	const siteCheckbox = page.getByRole('checkbox').first();
	if (await siteCheckbox.isVisible().catch(() => false)) await siteCheckbox.check();
	await page.getByRole('button', { name: /create & continue/i }).click();
	// Availability step — leave it: either "Skip for now" (has sites) or
	// "Go to Preceptors List" (no sites) takes us back to the list.
	const skip = page.getByRole('button', { name: /skip for now/i });
	const goList = page.getByRole('button', { name: /go to preceptors list/i });
	await expect(skip.or(goList)).toBeVisible({ timeout: 15000 });
	if (await skip.isVisible().catch(() => false)) {
		await skip.click();
	} else {
		await goList.click();
	}
	await expect(page).toHaveURL(/\/preceptors$/);
	await expect(page.locator('tr', { hasText: PRECEPTOR })).toBeVisible();

	// --- 3. Add a clerkship (2 required days) ---
	await page.goto('/clerkships/new');
	await page.locator('#name').fill(CLERKSHIP);
	await page.locator('#required_days').fill('2');
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/clerkships$/);
	await expect(page.locator('tr', { hasText: CLERKSHIP })).toBeVisible();

	// --- 4. Add two students ---
	for (const [name, email] of [
		[STUDENT_A, EMAIL_A],
		[STUDENT_B, EMAIL_B]
	]) {
		await page.goto('/students/new');
		await page.locator('#name').fill(name);
		await page.locator('#email').fill(email);
		await page.getByRole('button', { name: /^create$/i }).click();
		await expect(page).toHaveURL(/\/students$/);
	}

	// --- 5. Onboard both students to our health system ---
	for (const name of [STUDENT_A, STUDENT_B]) {
		await openStudent(page, name);
		await page.getByRole('tab', { name: 'Onboarding' }).click();
		await page.getByLabel(HS, { exact: true }).check();
		await expect(page.locator('div', { hasText: HS }).getByText('Completed').first()).toBeVisible({
			timeout: 10000
		});
	}

	// --- 6. Student A: first assignment validates clean, then create ---
	await openStudent(page, STUDENT_A);
	await addAssignment(page, {
		clerkship: CLERKSHIP,
		preceptor: PRECEPTOR,
		date: D1,
		outcome: 'clean'
	});

	// --- 7. HARD conflict: same student, same date is double-booked & blocked ---
	await addAssignment(page, {
		clerkship: CLERKSHIP,
		preceptor: PRECEPTOR,
		date: D1,
		outcome: 'hard',
		warning: /already has an assignment/i
	});

	// --- 8. SOFT conflict: Student B on the same preceptor/date exceeds capacity ---
	await openStudent(page, STUDENT_B);
	await addAssignment(page, {
		clerkship: CLERKSHIP,
		preceptor: PRECEPTOR,
		date: D1,
		outcome: 'soft',
		warning: /capacity/i
	});

	// --- 9. Edit an entity mid-flow (rename Student A) ---
	await openStudent(page, STUDENT_A);
	await page.getByRole('tab', { name: 'Details' }).click();
	await page.locator('#name').fill(STUDENT_A2);
	await page.getByRole('button', { name: /^update$/i }).click();
	await expect(page.getByText('Student updated')).toBeVisible({ timeout: 10000 });

	// --- 10. New assignment on a fresh date re-validates clean ---
	await page.getByRole('tab', { name: 'Overview' }).click();
	await addAssignment(page, {
		clerkship: CLERKSHIP,
		preceptor: PRECEPTOR,
		date: D2,
		outcome: 'clean'
	});

	// --- 11. Requirement status reflects the two scheduled days ---
	await page.getByRole('tab', { name: 'Overview' }).click();
	// The clerkship's progress row: 0 done · 2 scheduled · 0 left / 2 required.
	await expect(page.getByText(/2 scheduled · 0 left \/ 2/i)).toBeVisible();
});
