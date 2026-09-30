// @coverage @finding(CF-DEL) @req(R2)
/**
 * Deleting core entities (students, preceptors, clerkships) — the destructive
 * flow a coordinator reaches from each list page.
 *
 * This is a real-user, non-happy path that had no e2e coverage: the entity
 * delete dialogs (`delete-student-dialog`, `delete-preceptor-dialog`,
 * `delete-clerkship-dialog`) are only reachable from the list pages, and the
 * interesting behaviour is the *refusal* — the service blocks a delete when the
 * entity still has schedule assignments and returns a 409, which the dialog must
 * surface inline rather than failing silently or wiping the row.
 *
 *  1. blocked path — an entity that holds an assignment cannot be deleted; the
 *     dialog shows "…existing schedule assignments" and the row survives;
 *  2. clean path — a freshly-created entity with no assignments deletes and
 *     drops out of the list.
 *
 * The underlying guards (`canDeleteStudent` / `canDeletePreceptor` /
 * `canDeleteClerkship`) are unit-proven in the service tests; this proves the
 * whole dialog → API → refresh loop from the UI.
 */

import { test, expect, apiOf, fromToday, type Page } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

/** Every soft code, so a deliberately-placed assignment lands regardless of the
 * seeded fixture's availability/eligibility quirks. */
const SAFETY = [
	'block_week_conflict',
	'session_clash',
	'mutual_exclusion',
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule'
];

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return d;
		n++;
	}
}

/** Locate the list row that names `name`. */
function rowFor(page: Page, name: string) {
	return page.locator('tr', { hasText: name });
}

/** Open the delete dialog for `name` on the current list page and confirm it. */
async function confirmDelete(page: Page, name: string) {
	const row = rowFor(page, name);
	await expect(row).toBeVisible({ timeout: 15000 });
	await row.getByRole('button', { name: /^delete$/i }).click();
	// The confirm dialog is a plain overlay (not role=dialog); anchor on its heading.
	await expect(page.getByRole('heading', { name: /^delete (student|preceptor|clerkship)$/i })).toBeVisible();
	// The dialog's confirm button is the last "Delete" in the DOM (rendered after the list).
	await page.getByRole('button', { name: /^delete$/i }).last().click();
}

async function attach(
	api: ReturnType<typeof apiOf>,
	scheduleId: string,
	entityType: string,
	ids: string[]
) {
	if (!ids.length) return;
	await api.post(`/api/scheduling-periods/${scheduleId}/entities`, { entityType, entityIds: ids });
}

test.describe('CF-DEL entity deletion', { tag: ['@stage2', '@long'] }, () => {
	test('refuses to delete a student / preceptor / clerkship that still holds an assignment', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-DEL blocked ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const site = roster.sites[0];
		const student = roster.students[0];
		expect(amanda && fm && site && student).toBeTruthy();

		// One clinical day ties all three entities to an assignment.
		const created = await api.post('/api/schedules/assignments', {
			student_id: student.id,
			preceptor_id: amanda.id,
			clerkship_id: fm.id,
			site_id: site.id,
			date: futureWeekday(9),
			override_codes: SAFETY
		});
		expect(created.ok, 'seed assignment created').toBe(true);

		const blocked = /existing schedule assignments/i;

		// Student
		await asAdmin.goto('/students');
		await confirmDelete(asAdmin, student.name);
		await expect(asAdmin.getByText(blocked)).toBeVisible({ timeout: 15000 });
		await asAdmin.getByRole('button', { name: /^cancel$/i }).last().click();
		await expect(rowFor(asAdmin, student.name)).toBeVisible();

		// Preceptor
		await asAdmin.goto('/preceptors');
		await confirmDelete(asAdmin, amanda.name);
		await expect(asAdmin.getByText(blocked)).toBeVisible({ timeout: 15000 });
		await asAdmin.getByRole('button', { name: /^cancel$/i }).last().click();
		await expect(rowFor(asAdmin, amanda.name)).toBeVisible();

		// Clerkship
		await asAdmin.goto('/clerkships');
		await confirmDelete(asAdmin, fm.name);
		await expect(asAdmin.getByText(blocked)).toBeVisible({ timeout: 15000 });
		await asAdmin.getByRole('button', { name: /^cancel$/i }).last().click();
		await expect(rowFor(asAdmin, fm.name)).toBeVisible();
	});

	test('deletes an unassigned student / preceptor / clerkship and drops it from the list', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-DEL clean ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const scheduleId = roster.sandbox.id;
		const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

		// Fresh entities with no assignments — safe to remove entirely.
		const studentName = `Delete Me Student ${stamp}`;
		const student = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: studentName,
				email: `delme_stu_${stamp}@x.com`
			})
		).data as { id?: string; student?: { id: string } };
		const studentId = student?.student?.id ?? student?.id;
		expect(studentId, 'fresh student created').toBeTruthy();
		await attach(api, scheduleId, 'students', [studentId!]);

		const preceptorName = `Delete Me Preceptor ${stamp}`;
		const preceptor = (
			await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
				name: preceptorName,
				email: `delme_prec_${stamp}@x.com`,
				max_students: 2,
				site_ids: [roster.sites[0].id]
			})
		).data as { id?: string; preceptor?: { id: string } };
		const preceptorId = preceptor?.preceptor?.id ?? preceptor?.id;
		expect(preceptorId, 'fresh preceptor created').toBeTruthy();
		await attach(api, scheduleId, 'preceptors', [preceptorId!]);

		const clerkshipName = `Delete Me Clerkship ${stamp}`;
		const clerkship = (
			await api.post<{ id?: string; clerkship?: { id: string } }>('/api/clerkships', {
				name: clerkshipName,
				required_days: 3,
				clerkship_type: 'outpatient'
			})
		).data as { id?: string; clerkship?: { id: string } };
		const clerkshipId = clerkship?.clerkship?.id ?? clerkship?.id;
		expect(clerkshipId, 'fresh clerkship created').toBeTruthy();
		await attach(api, scheduleId, 'clerkships', [clerkshipId!]);

		// Student
		await asAdmin.goto('/students');
		await confirmDelete(asAdmin, studentName);
		await expect(rowFor(asAdmin, studentName)).toHaveCount(0, { timeout: 15000 });

		// Preceptor
		await asAdmin.goto('/preceptors');
		await confirmDelete(asAdmin, preceptorName);
		await expect(rowFor(asAdmin, preceptorName)).toHaveCount(0, { timeout: 15000 });

		// Clerkship
		await asAdmin.goto('/clerkships');
		await confirmDelete(asAdmin, clerkshipName);
		await expect(rowFor(asAdmin, clerkshipName)).toHaveCount(0, { timeout: 15000 });
	});
});
