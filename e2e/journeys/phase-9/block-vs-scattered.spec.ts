// @coverage @finding(CF-L3) @req(R7)
/**
 * CF-L3 — Block vs scattered clerkship weeks.
 *
 * A clerkship can be scheduled as a block (inpatient — whole weeks) or scattered
 * (outpatient — individual days). A block occupies the student's whole week, so a
 * scattered day landing in that week conflicts. The journey marks a clerkship as a
 * block, puts the student on a block that week, then adds an outpatient day in the
 * same week through the dialog: it warns (overridable), the coordinator overrides,
 * and the student's conflict panel lists the block-week conflict. The warning is a
 * Basic feature; auto-placement avoidance is the gated tier (covered by unit tests).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog, CalendarPage } from '../../pages';
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

/** A Monday at least `atLeast` days out, so the block day and a same-week day share a week. */
function mondayAtLeast(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1) return d;
		n++;
	}
}

/** Add whole days to an ISO date. */
function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

test.describe('CF-L3 block vs scattered clerkship weeks', { tag: ['@stage1'] }, () => {
	test('a block consumes the week; an outpatient day that week warns and shows a conflict', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-L3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const peds = roster.clerkships.find((c) => c.name === 'Pediatrics')!;
		const anySite = roster.sites[0]!;

		// --- Mark Pediatrics as a block (inpatient) clerkship via the API ---------
		expect((await api.patch(`/api/clerkships/${peds.id}`, { scheduling_kind: 'block' })).ok).toBe(
			true
		);
		await expect
			.poll(async () => {
				const r = await api.get<{ scheduling_kind?: string }>(`/api/clerkships/${peds.id}`);
				return r.data?.scheduling_kind;
			})
			.toBe('block');

		// Dedicated student so the conflict panel reflects only this journey.
		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `L3 Student ${stamp}`,
				email: `l3_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		// --- Block assignment: student on Pediatrics (block) Monday of a week ------
		const blockMon = mondayAtLeast(8);
		const sameWeekWed = addDays(blockMon, 2);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: amanda.id,
					clerkship_id: peds.id,
					site_id: anySite.id,
					date: blockMon,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Outpatient day via the dialog: Family Medicine that same week → warns -
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`L3 Student ${stamp}`);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		// Pick the first site the preceptor serves for Family Medicine.
		const siteSelect = asAdmin.locator('#ad-site');
		await expect(siteSelect).toBeVisible();
		const options = siteSelect.locator('option');
		const optionCount = await options.count();
		let picked = false;
		for (let i = 0; i < optionCount; i++) {
			const value = await options.nth(i).getAttribute('value');
			if (value && !(await options.nth(i).isDisabled())) {
				await siteSelect.selectOption(value);
				picked = true;
				break;
			}
		}
		expect(picked, 'Dr. Amanda should serve at least one site for Family Medicine').toBe(true);
		await dialog.pickDay(sameWeekWed);
		await expect(dialog.overrideSummary()).toContainText(/inpatient block/i);
		await dialog.submitAndExpectCreated();

		// --- The student's conflict panel lists the block-week conflict -----------
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('student-conflicts')).toBeVisible({ timeout: 15000 });
		await expect(
			asAdmin.getByTestId(`student-conflict-block_week_conflict-${sameWeekWed}`)
		).toBeVisible();
	});
});
