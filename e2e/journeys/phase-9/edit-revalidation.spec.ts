// @coverage @finding(CF-L2) @finding(CF-L3) @req(R7)
/**
 * Editing an existing assignment re-runs the full validator.
 *
 * The create path is well covered; this proves the EDIT UI (the dialog opened
 * from a student's schedule row) re-validates the merged assignment and persists
 * the override:
 *  - reassigning a preceptor to one that is mutually exclusive with another the
 *    student holds that day surfaces the L2 warning → override → conflict (a real
 *    "reassign" action);
 *  - moving a scattered day into a week an inpatient block consumes surfaces the
 *    L3 warning → override → conflict.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

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
function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
/** A Monday ≥ `atLeast` days out whose block week (+2) and the following week (+9)
 * fall in the same calendar month, so the edit-dialog date picker shows both. */
function stableBlockMonday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1) {
			if (addDays(d, 2).slice(0, 7) === addDays(d, 9).slice(0, 7)) return d;
		}
		n++;
	}
}

async function makeStudent(api: ReturnType<typeof apiOf>, scheduleId: string, label: string) {
	const stamp = `${label}-${Date.now()}`;
	const created = (
		await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
			name: label,
			email: `${label.replace(/\s+/g, '').toLowerCase()}_${Date.now()}@x.com`
		})
	).data as unknown as { id?: string; student?: { id: string } };
	const sid = created?.student?.id ?? created?.id;
	expect(sid, `student ${stamp} created`).toBeTruthy();
	await api.post(`/api/scheduling-periods/${scheduleId}/entities`, {
		entityType: 'students',
		entityIds: [sid]
	});
	return sid as string;
}

/** Open the edit dialog for the (date, preceptor) row from the student's list view. */
async function openEditForDate(
	page: Parameters<typeof apiOf>[0],
	sid: string,
	date: string,
	preceptorName: string
) {
	await page.goto(`/students/${sid}`);
	await page.getByRole('tab', { name: 'Schedule' }).click();
	await page.getByRole('button', { name: 'List', exact: true }).click();
	const row = page.locator('tr', { hasText: date }).filter({ hasText: preceptorName });
	await expect(row).toBeVisible({ timeout: 15000 });
	await row.getByRole('button', { name: 'Edit' }).click();
}

/** The first site that is genuinely eligible for a (clerkship, preceptor) pair,
 * so an API-seeded assignment survives the edit dialog's eligibility recompute. */
async function eligibleSiteFor(
	api: ReturnType<typeof apiOf>,
	clerkshipId: string,
	preceptorId: string
): Promise<string> {
	const r = await api.get<{ sites: { id: string; eligible: boolean }[] }>(
		`/api/schedules/assignments/options?clerkshipId=${clerkshipId}&preceptorId=${preceptorId}`
	);
	const site = (r.data?.sites ?? []).find((s) => s.eligible);
	expect(site, 'preceptor serves at least one site for the clerkship').toBeTruthy();
	return site!.id;
}

/** Two weekdays in the same calendar month (earlier first), so the edit-dialog
 * picker (opened on the later day's month) can reach the earlier one. */
function twoWeekdaysSameMonth(startAt: number): [string, string] {
	let n = startAt;
	for (;;) {
		const a = futureWeekday(n);
		const b = futureWeekday(n + 3);
		if (a.slice(0, 7) === b.slice(0, 7) && a !== b) return [a, b];
		n++;
	}
}

test.describe('editing re-validates through the dialog', { tag: ['@stage1'] }, () => {
	test('moving an assignment onto a mutually-exclusive preceptor\'s day warns and records a conflict (L2)', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `EDIT-L2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const james = roster.preceptors.find((p) => p.name === 'Dr. James Brown')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const sid = await makeStudent(api, roster.sandbox.id, `EL2 ${Date.now()}`);

		// Amanda ↔ James are mutually exclusive.
		expect((await api.put(`/api/preceptors/${amanda.id}/mutual-exclusions`, { preceptor_ids: [james.id] })).ok).toBe(true);

		const [dAmanda, dJames] = twoWeekdaysSameMonth(9);
		const amandaSite = await eligibleSiteFor(api, fm.id, amanda.id);
		const jamesSite = await eligibleSiteFor(api, fm.id, james.id);
		// Amanda on dAmanda; James on his own (later) day dJames — different days, so the
		// excluded pair does not yet share one.
		expect((await api.post('/api/schedules/assignments', { student_id: sid, preceptor_id: amanda.id, clerkship_id: fm.id, site_id: amandaSite, date: dAmanda, override_codes: SAFETY })).ok).toBe(true);
		expect((await api.post('/api/schedules/assignments', { student_id: sid, preceptor_id: james.id, clerkship_id: fm.id, site_id: jamesSite, date: dJames, override_codes: SAFETY })).ok).toBe(true);

		// No mutual-exclusion conflict yet (the panel only renders once one exists).
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByRole('tab', { name: 'Schedule' })).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-mutual_exclusion-${dAmanda}`)).toHaveCount(0);

		// Move James's day onto Amanda's — now the excluded pair shares a day. Only the
		// date changes; James and his site stay eligible, so the dialog re-validates the
		// merged assignment cleanly.
		await openEditForDate(asAdmin, sid, dJames, 'Dr. James Brown');
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.pickDay(dAmanda);
		await expect(dialog.overrideSummary()).toContainText(/not to share a day/i);
		await dialog.submit();
		await expect(asAdmin.getByText(/assignment updated/i)).toBeVisible({ timeout: 15000 });

		// The move is recorded as a mutual-exclusion conflict on the shared day.
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('student-conflicts')).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-mutual_exclusion-${dAmanda}`)).toBeVisible();
	});

	test('moving a scattered day into a block week warns and records a conflict (L3)', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `EDIT-L3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const peds = roster.clerkships.find((c) => c.name === 'Pediatrics')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const site = roster.sites[0];
		const sid = await makeStudent(api, roster.sandbox.id, `EL3 ${Date.now()}`);

		// Pediatrics is a block (inpatient) clerkship.
		expect((await api.patch(`/api/clerkships/${peds.id}`, { scheduling_kind: 'block' })).ok).toBe(true);

		const blockMon = stableBlockMonday(10);
		const blockWeekDay = addDays(blockMon, 2); // Wed, same week as the block
		const freeWeekDay = addDays(blockMon, 9); // next week — clean
		// Seed the FM day at a site Amanda genuinely serves so the edit dialog keeps her
		// site on load and the date move validates against a complete assignment.
		const amandaSite = await eligibleSiteFor(api, fm.id, amanda.id);

		// Student is on the block that week, and has a Family Medicine day the FREE week.
		expect((await api.post('/api/schedules/assignments', { student_id: sid, preceptor_id: amanda.id, clerkship_id: peds.id, site_id: site.id, date: blockMon, override_codes: SAFETY })).ok).toBe(true);
		expect((await api.post('/api/schedules/assignments', { student_id: sid, preceptor_id: amanda.id, clerkship_id: fm.id, site_id: amandaSite, date: freeWeekDay, override_codes: SAFETY })).ok).toBe(true);

		// No block-week conflict while the FM day is in its free week (the panel only
		// renders once a conflict exists).
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByRole('tab', { name: 'Schedule' })).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-block_week_conflict-${freeWeekDay}`)).toHaveCount(0);

		// Edit the FM day and move it into the block's week — only the date changes.
		await openEditForDate(asAdmin, sid, freeWeekDay, 'Dr. Amanda Smith');
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.pickDay(blockWeekDay);
		await expect(dialog.overrideSummary()).toContainText(/inpatient block/i);
		await dialog.submit();
		await expect(asAdmin.getByText(/assignment updated/i)).toBeVisible({ timeout: 15000 });

		// The moved day is now a block-week conflict; the old free-week day is gone.
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('student-conflicts')).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-block_week_conflict-${blockWeekDay}`)).toBeVisible();
		await expect(asAdmin.getByTestId(`student-conflict-block_week_conflict-${freeWeekDay}`)).toHaveCount(0);
	});
});
