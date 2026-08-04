import { test, expect } from '@playwright/test';
import { login, ADMIN, fromToday } from './helpers';
import {
	openAssignmentDialog,
	selectClerkship,
	selectPreceptor,
	selectSite,
	selectStudent,
	pickDay,
	submitAcceptingOverrides,
	dayState
} from './assignment-helpers';

/**
 * Step 24 — the override lifecycle end to end.
 *
 * Proves the two override branches actually change the world (not just record a
 * code), and that both land in the calendar's reviewable override log:
 *   1. assigning on an unavailable day, choosing "mark the preceptor available"
 *   2. double-booking a full preceptor, choosing "raise the limit"
 */

/** Build an isolated cast so no other spec's data changes the conversations. */
async function fixture(page: import('@playwright/test').Page, tag: string) {
	const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
	const site = (await (await page.request.get('/api/sites')).json()).data[0];

	const clerkship = `OV Clerk ${tag} ${stamp}`;
	await page.request.post('/api/clerkships', {
		data: { name: clerkship, clerkship_type: 'outpatient', required_days: 10 }
	});

	const preceptor = `Dr. OV ${tag} ${stamp}`;
	const precRes = await page.request.post('/api/preceptors', {
		data: {
			name: preceptor,
			email: `ov_${tag}_${stamp}@example.com`,
			max_students: 1,
			health_system_id: site.health_system_id,
			site_ids: [site.id]
		}
	});
	const preceptorId = (await precRes.json()).data.id;

	async function makeStudent(suffix: string) {
		const name = `OV Student ${tag}${suffix} ${stamp}`;
		await page.goto('/students/new');
		await page.locator('#name').fill(name);
		await page.locator('#email').fill(`ov_stu_${tag}${suffix}_${stamp}@example.com`);
		await page.getByRole('button', { name: /^create$/i }).click();
		await expect(page).toHaveURL(/\/students$/);
		return name;
	}

	return { site, clerkship, preceptor, preceptorId, makeStudent };
}

test('override: assigning on an unavailable day can update the preceptor availability', async ({
	page
}) => {
	test.setTimeout(120000);
	await login(page, ADMIN);

	const f = await fixture(page, 'A');
	const student = await f.makeStudent('');
	const date = fromToday(35);

	// Mark the preceptor explicitly unavailable on the target day.
	const set = await page.request.post(`/api/preceptors/${f.preceptorId}/availability`, {
		data: { site_id: f.site.id, availability: [{ date, is_available: false }] }
	});
	expect(set.ok()).toBeTruthy();

	await page.goto('/students');
	await page.getByRole('button', { name: student }).click();
	await openAssignmentDialog(page);
	await selectClerkship(page, f.clerkship);
	await selectPreceptor(page, f.preceptor);
	await selectSite(page, f.site.name);

	// The picker reflects the real availability we just wrote.
	await pickDay(page, date);
	expect(await dayState(page, date)).toBe('unavailable');

	// Choose the branch that also updates the preceptor's availability.
	await submitAcceptingOverrides(page, { prefer: [/assign and mark available/i] });
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toHaveCount(0, {
		timeout: 15000
	});

	// The side effect landed: that day is now available for the preceptor.
	const avail = await (
		await page.request.get(`/api/preceptors/${f.preceptorId}/availability`)
	).json();
	const row = (avail.data ?? []).find((a: { date: string }) => a.date === date);
	expect(row?.is_available).toBe(1);

	// And the exception is reviewable on the calendar.
	await page.goto('/calendar');
	const health = page.getByTestId('schedule-health');
	await health.getByRole('button', { name: /show details/i }).click();
	await expect(health.getByTestId('override-list')).toContainText(student, { timeout: 15000 });
});

test('override: double-booking a full preceptor can raise their student limit', async ({
	page
}) => {
	test.setTimeout(120000);
	await login(page, ADMIN);

	const f = await fixture(page, 'B');
	const first = await f.makeStudent('1');
	const second = await f.makeStudent('2');
	const date = fromToday(37);

	// Fill the preceptor's single slot from the calendar (student dropdown lives
	// here — the only difference between this dialog and the student page's).
	await page.goto('/calendar');
	await page.getByRole('button', { name: 'Add assignment' }).first().click();
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toBeVisible();
	await selectStudent(page, first);
	await selectClerkship(page, f.clerkship);
	await selectPreceptor(page, f.preceptor);
	await pickDay(page, date);
	await submitAcceptingOverrides(page);
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toHaveCount(0, {
		timeout: 15000
	});

	// Second student, same preceptor and day: capacity (max_students = 1) is hit.
	await page.goto('/students');
	await page.getByRole('button', { name: second }).click();
	await openAssignmentDialog(page);
	await selectClerkship(page, f.clerkship);
	await selectPreceptor(page, f.preceptor);
	await pickDay(page, date);

	// Take the double-book branch, then choose to raise the limit rather than
	// making a one-off exception.
	await submitAcceptingOverrides(page, {
		prefer: [/double-book this day/i, /raise .*limit/i]
	});
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toHaveCount(0, {
		timeout: 15000
	});

	// The side effect landed: capacity went up.
	const prec = await (await page.request.get(`/api/preceptors/${f.preceptorId}`)).json();
	expect(prec.data.max_students).toBeGreaterThan(1);

	// Both students now sit on that day, and the override is logged.
	await page.goto('/calendar');
	const health = page.getByTestId('schedule-health');
	await health.getByRole('button', { name: /show details/i }).click();
	await expect(health.getByTestId('override-list')).toContainText(second, { timeout: 15000 });
});
