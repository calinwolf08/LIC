import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN, monthStart, monthEnd } from './helpers';
import {
	openAssignmentDialog,
	pickDay,
	selectClerkship,
	selectPreceptor,
	submitAcceptingOverrides,
	fromToday
} from './assignment-helpers';

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
 * The journey first creates a deliberately short schedule and switches into it,
 * so the whole arc also exercises the range plumbing (step 15). D1/D2 sit inside
 * that window and in the future, so they count as "scheduled", not "completed".
 */

// Unique names so the run is independent on the shared test DB.
const STAMP = Date.now();
const SCHEDULE = `E2E Schedule ${STAMP}`;
const HS = `E2E-HS ${STAMP}`;
const SITE = `E2E-Site ${STAMP}`;
const PRECEPTOR = `Dr. E2E ${STAMP}`;
const CLERKSHIP = `E2E-Clerkship ${STAMP}`;
const STUDENT_A = `E2E Student A ${STAMP}`;
const STUDENT_A2 = `${STUDENT_A} (renamed)`;
const STUDENT_B = `E2E Student B ${STAMP}`;
const EMAIL_A = `e2e_a_${STAMP}@example.com`;
const EMAIL_B = `e2e_b_${STAMP}@example.com`;
const D1 = fromToday(45);
const D2 = fromToday(46);

/** Set by the test so afterEach can restore the seeded active schedule. */
let scheduleCleanup: (() => Promise<void>) | null = null;

async function activeScheduleId(page: Page): Promise<string | null> {
	const res = await page.request.get('/api/user/active-schedule');
	if (!res.ok()) return null;
	return (await res.json()).data?.schedule?.id ?? null;
}

test.afterEach(async () => {
	if (scheduleCleanup) {
		await scheduleCleanup().catch(() => {});
		scheduleCleanup = null;
	}
});

/** Open a student's detail page from the students list. */
async function openStudent(page: Page, name: string) {
	await page.goto('/students');
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

/**
 * Drive the unified assignment dialog on a student's page (student is locked).
 * `outcome` controls the expectation: a clean create, an overridable warning, or
 * a hard conflict that can never be submitted.
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
	await openAssignmentDialog(page);
	await selectClerkship(page, opts.clerkship);
	await selectPreceptor(page, opts.preceptor);
	await pickDay(page, opts.date);

	if (opts.outcome === 'clean') {
		await expect(page.getByTestId('override-summary')).toHaveCount(0);
		await page.getByRole('button', { name: /^create$/i }).click();
		await expect(page.getByText(/day\(s\) assigned/i)).toBeVisible({ timeout: 15000 });
	} else if (opts.outcome === 'soft') {
		if (opts.warning) await expect(page.getByTestId('override-summary')).toContainText(opts.warning);
		await submitAcceptingOverrides(page);
		await expect(page.getByText(/day\(s\) assigned/i)).toBeVisible({ timeout: 15000 });
	} else {
		// Hard: the day is listed as skipped and nothing can be submitted.
		await expect(page.getByTestId('blocked-days')).toBeVisible();
		if (opts.warning) await expect(page.getByTestId('blocked-days')).toContainText(opts.warning);
		await expect(page.getByRole('button', { name: /^create$/i })).toBeDisabled();
		await page.getByRole('button', { name: 'Cancel' }).first().click();
	}
}

test(
	'end-to-end: build entities, assign, validate, edit, reassign, revalidate',
	{ tag: ['@smoke', '@stage1', '@long'] },
	async ({ page }) => {
	test.setTimeout(180000);
	await login(page, ADMIN);

	// --- 0. Work inside a purpose-made, deliberately short schedule ---
	// Creating and switching into it up front means the whole arc below also
	// exercises the range plumbing (step 15): everything that follows must stay
	// bounded to this window rather than a fabricated calendar year.
	const baselineId = await activeScheduleId(page);
	const created = await page.request.post('/api/scheduling-periods', {
		data: { name: SCHEDULE, start_date: monthStart(0), end_date: monthEnd(2) }
	});
	expect(created.ok()).toBeTruthy();
	const scheduleId = (await created.json()).data.id;
	await page.request.put('/api/user/active-schedule', { data: { scheduleId } });

	// Restore the seeded schedule afterwards so sibling specs stay isolated.
	scheduleCleanup = async () => {
		if (baselineId) {
			await page.request.put('/api/user/active-schedule', { data: { scheduleId: baselineId } });
		}
		await page.request.delete(`/api/scheduling-periods/${scheduleId}`);
	};

	await page.goto('/dashboard');
	await expect(page.getByRole('button', { name: SCHEDULE })).toBeVisible();

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
		warning: /already has a student/i
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
	}
);
