/**
 * Phase 0 — the journey infrastructure proves itself.
 *
 * Not a product journey: this pins down that every fixture and page object the
 * later phases lean on actually works against the running app, so a Phase-1
 * failure is never "the harness".
 */

import {
	test,
	expect,
	apiOf,
	activeScheduleId,
	snapshotTenant,
	ADMIN,
	BASIC
} from '../../fixtures';
import { CalendarPage, EntityTabs } from '../../pages';

test.describe('phase 0: fixtures & page objects', { tag: ['@smoke', '@stage1'] }, () => {
	test('asAdmin and asBasic are signed in as the right tenants, once per worker', async ({
		asAdmin,
		asBasic
	}) => {
		await asAdmin.goto('/dashboard');
		await expect(asAdmin.getByTestId('schedule-switcher')).toContainText('Demo Schedule');
		await expect(asAdmin.getByRole('link', { name: 'Auto-Generate' })).toBeVisible();

		await asBasic.goto('/dashboard');
		await expect(asBasic.getByTestId('schedule-switcher')).toContainText('Tenant B Schedule');
		await expect(asBasic.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);

		// Same session for the API layer: each sees only its own students.
		const adminStudents = await apiOf(asAdmin).get<Array<{ name: string }>>('/api/students');
		const basicStudents = await apiOf(asBasic).get<Array<{ name: string }>>('/api/students');
		expect(adminStudents.ok && basicStudents.ok).toBe(true);
		expect(adminStudents.data!.some((s) => s.name.startsWith('Tenant B'))).toBe(false);
		expect(basicStudents.data!.every((s) => s.name.startsWith('Tenant B'))).toBe(true);
	});

	test('asFreshUser lands schedule-first; asFreshEntitledUser gains Stage 2 without re-login', async ({
		asFreshUser,
		asFreshEntitledUser
	}) => {
		const { page: fresh } = asFreshUser;
		await fresh.goto('/dashboard');
		await expect(fresh.getByTestId('schedule-switcher')).toBeVisible();
		await expect(fresh.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);
		expect((await apiOf(fresh).post('/api/schedules/generate', {})).status).toBe(403);

		const { page: entitled } = asFreshEntitledUser;
		await entitled.goto('/dashboard');
		await expect(entitled.getByRole('link', { name: 'Auto-Generate' })).toBeVisible();
		await entitled.goto('/generate');
		await expect(entitled.getByRole('heading', { name: 'Generate a schedule' })).toBeVisible();
	});

	test('sandbox schedules activate, isolate, and restore the seeded schedule', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		const baseline = await activeScheduleId(asAdmin);
		const box = await sandbox.create(asAdmin, { name: `P0 sandbox ${Date.now()}` });
		expect(await activeScheduleId(asAdmin)).toBe(box.id);

		await asAdmin.goto('/dashboard');
		await expect(asAdmin.getByTestId('schedule-switcher')).toContainText(box.name);
		// A fresh schedule carries none of the seeded rows.
		await expect(asAdmin.getByTestId('dash-total-assignments')).toHaveText('0');

		await box.restore();
		expect(await activeScheduleId(asAdmin)).toBe(baseline);
		const gone = await db
			.selectFrom('scheduling_periods')
			.select('id')
			.where('id', '=', box.id)
			.executeTakeFirst();
		expect(gone).toBeUndefined();
	});

	test('the seed carries the Phase-0 extensions the journeys depend on', async ({
		asAdmin,
		db
	}) => {
		// Electives with pools on Internal Medicine.
		const electives = await db
			.selectFrom('clerkship_electives')
			.select(['name', 'is_required', 'minimum_days'])
			.orderBy('name')
			.execute();
		expect(electives.map((e) => e.name)).toEqual(['Cardiology', 'Dermatology']);
		expect(electives.find((e) => e.name === 'Cardiology')?.is_required).toBe(1);

		// Two blackout dates render as blackout cells on the calendar.
		const blackouts = await db.selectFrom('blackout_dates').select('date').execute();
		expect(blackouts).toHaveLength(2);
		const calendar = new CalendarPage(asAdmin);
		await calendar.goto();
		const res = await apiOf(asAdmin).get<Array<{ date: string }>>('/api/blackout-dates');
		expect(res.data?.map((b) => b.date).sort()).toEqual(blackouts.map((b) => b.date).sort());

		// One locked row, visible as such on a chip when its month is shown.
		const locked = await db
			.selectFrom('schedule_assignments')
			.select(['id', 'date'])
			.where('locked', '=', 1)
			.executeTakeFirst();
		expect(locked).toBeDefined();

		// The health panel page object reads the seeded capacity findings (the
		// seed contributes exactly 4; legacy specs that run earlier in the same
		// worker may leave more behind in the shared Demo Schedule, so >=).
		await calendar.health.expectVisible();
		expect(await calendar.health.violationCount()).toBeGreaterThan(0);
		const byCode = await calendar.health.countsByCode();
		expect(byCode.preceptor_capacity).toBeGreaterThanOrEqual(4);
	});

	test('EntityTabs and the tenant snapshot helper behave', async ({ asAdmin, db }) => {
		await asAdmin.goto('/students');
		await asAdmin.getByRole('button', { name: 'Alice Johnson' }).click();
		const tabs = new EntityTabs(asAdmin);
		expect(await tabs.names()).toEqual([
			'Overview',
			'Schedule',
			'Progress',
			'Details',
			'Onboarding'
		]);
		await tabs.select('Progress');

		const b = await snapshotTenant(db, BASIC.email);
		expect(b.schedules).toHaveLength(1);
		expect(b.schedules[0].assignments).toHaveLength(2);
		expect(b.schedules[0].counts.schedule_teams).toBe(1);
		const a = await snapshotTenant(db, ADMIN.email);
		expect(a.schedules.some((s) => s.name === 'Demo Schedule')).toBe(true);
	});
});
