// @coverage @req(R9.1) @req(R9.2) @req(R3.4)
/**
 * J4.5 — Dashboard and readiness checklist (e2e plan Phase 4).
 *
 * Two dashboard promises:
 *   1. The setup checklist links each unfinished step to its fix page and ticks
 *      the item once done. The availability step clears only when a preceptor
 *      has *materialised* availability rows, not merely a pattern (R3.6).
 *   2. The student-status card moves a student none → partial → full as
 *      assignments accrue, and "Most days remaining" names the at-risk student.
 *
 * Both run on a bare sandbox schedule so the counts are unambiguous.
 */

import { test, expect, apiOf, type Api, type Page } from '../../fixtures';
import { createAssignment, freeWeekdayForStudents } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const SAFETY = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];

/** Read a checklist item's done-state from the dashboard. */
async function itemDone(page: Page, id: string): Promise<boolean> {
	const li = page.getByTestId(`checklist-${id}`);
	await expect(li).toBeVisible({ timeout: 15000 });
	return (await li.getAttribute('data-done')) === 'true';
}

async function reloadDashboard(page: Page) {
	await page.goto('/dashboard');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
}

/** Minimal locations/clerkship/preceptor/student, each via the API. */
async function makeHealthSystem(api: Api, name: string): Promise<string> {
	const r = await api.post<{ id: string }>('/api/health-systems', { name });
	return r.data!.id;
}

test.describe('J4.5 dashboard & readiness', { tag: ['@stage1'] }, () => {
	test('checklist links to fixes, ticks as done, and availability needs materialisation (R3.6)', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		await sandbox.create(asAdmin, { name: `J4.5 checklist ${Date.now()}` });
		const api = apiOf(asAdmin);

		await reloadDashboard(asAdmin);

		// The naming/dates step is already satisfied by the sandbox; the rest are not.
		expect(await itemDone(asAdmin, 'schedule-dates')).toBe(true);
		for (const id of ['locations', 'clerkships', 'preceptors', 'availability', 'students']) {
			expect(await itemDone(asAdmin, id)).toBe(false);
		}
		// Each unfinished item links to its exact fix page.
		const href = (id: string) =>
			asAdmin.getByTestId(`checklist-${id}`).locator('a').getAttribute('href');
		expect(await href('locations')).toBe('/locations');
		expect(await href('clerkships')).toBe('/clerkships');
		expect(await href('preceptors')).toBe('/preceptors');
		expect(await href('students')).toBe('/students');

		// --- Fix locations (health system + site) ---
		const hsId = await makeHealthSystem(api, `HS ${Date.now()}`);
		await api.post('/api/sites', { name: `Site ${Date.now()}`, health_system_id: hsId });
		await reloadDashboard(asAdmin);
		expect(await itemDone(asAdmin, 'locations')).toBe(true);

		// --- Fix clerkships ---
		await api.post('/api/clerkships', {
			name: `Clerkship ${Date.now()}`,
			required_days: 2,
			clerkship_type: 'outpatient'
		});
		await reloadDashboard(asAdmin);
		expect(await itemDone(asAdmin, 'clerkships')).toBe(true);

		// --- Add a preceptor: the preceptor step ticks but availability does NOT ---
		const site = (await api.get<Array<{ id: string }>>('/api/sites')).data![0].id;
		const precRes = await api.post<{ id: string }>('/api/preceptors', {
			name: `Dr. Ready ${Date.now()}`,
			email: `ready_${Date.now()}@example.com`,
			max_students: 2,
			site_ids: [site]
		});
		const precId = precRes.data!.id;
		await reloadDashboard(asAdmin);
		expect(await itemDone(asAdmin, 'preceptors')).toBe(true);
		expect(await itemDone(asAdmin, 'availability')).toBe(false);

		// --- Add a student → the students step ticks (availability still pending) ---
		await api.post('/api/students', {
			name: `Stu ${Date.now()}`,
			email: `stu_${Date.now()}@example.com`
		});
		await reloadDashboard(asAdmin);
		expect(await itemDone(asAdmin, 'students')).toBe(true);
		expect(await itemDone(asAdmin, 'availability')).toBe(false);

		// --- Materialise availability last (R3.6: a real availability row, not a
		// pattern) → the last step ticks and the checklist reports complete ---
		const kysely = db as Kysely<DB>;
		const ts = new Date().toISOString();
		await kysely
			.insertInto('preceptor_availability')
			.values({
				id: crypto.randomUUID(),
				preceptor_id: precId,
				site_id: site,
				date: '2026-10-05',
				is_available: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await reloadDashboard(asAdmin);
		await expect(asAdmin.getByText(/setup complete/i)).toBeVisible({ timeout: 15000 });

		// Quick action lands on the right page.
		await asAdmin.getByRole('button', { name: 'Add student' }).click();
		await expect(asAdmin).toHaveURL(/\/students\/new/, { timeout: 10000 });
	});

	test('student status moves none → partial → full and names the at-risk student', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		await sandbox.create(asAdmin, { name: `J4.5 status ${Date.now()}` });
		const api = apiOf(asAdmin);

		// Minimal roster: one clerkship needing 2 days, one preceptor+site, one student.
		const hsId = await makeHealthSystem(api, `HS ${Date.now()}`);
		const siteId = (
			await api.post<{ id: string }>('/api/sites', {
				name: `Site ${Date.now()}`,
				health_system_id: hsId
			})
		).data!.id;
		const clerkId = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `Clerkship ${Date.now()}`,
				required_days: 2,
				clerkship_type: 'outpatient'
			})
		).data!.id;
		const precId = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr. Status ${Date.now()}`,
				email: `status_${Date.now()}@example.com`,
				max_students: 2,
				site_ids: [siteId]
			})
		).data!.id;
		const stuName = `At Risk ${Date.now()}`;
		const stuId = (
			await api.post<{ id: string }>('/api/students', {
				name: stuName,
				email: `atrisk_${Date.now()}@example.com`
			})
		).data!.id;

		const dash = async () => {
			await reloadDashboard(asAdmin);
			const num = async (tid: string) =>
				Number((await asAdmin.getByTestId(tid).textContent()) ?? '0');
			return {
				fully: await num('dash-fully'),
				partially: await num('dash-partially'),
				unscheduled: await num('dash-unscheduled')
			};
		};

		// --- No assignments: the student owes both days → unscheduled ---
		let s = await dash();
		expect(s.unscheduled).toBe(1);
		expect(s.partially).toBe(0);
		expect(s.fully).toBe(0);

		// --- One of two days → partially, and named under "Most days remaining" ---
		const kysely = db as Kysely<DB>;
		const d1 = await freeWeekdayForStudents(kysely, [stuId], 8);
		await createAssignment(asAdmin, {
			student_id: stuId,
			preceptor_id: precId,
			clerkship_id: clerkId,
			site_id: siteId,
			date: d1,
			override_codes: SAFETY
		});
		s = await dash();
		expect(s.partially).toBe(1);
		expect(s.unscheduled).toBe(0);
		expect(s.fully).toBe(0);
		await expect(asAdmin.getByRole('link', { name: new RegExp(stuName) })).toBeVisible({
			timeout: 10000
		});

		// --- Both days → fully scheduled ---
		const d2 = await freeWeekdayForStudents(kysely, [stuId], 8, [d1]);
		await createAssignment(asAdmin, {
			student_id: stuId,
			preceptor_id: precId,
			clerkship_id: clerkId,
			site_id: siteId,
			date: d2,
			override_codes: SAFETY
		});
		s = await dash();
		expect(s.fully).toBe(1);
		expect(s.partially).toBe(0);
		expect(s.unscheduled).toBe(0);
	});
});
