/**
 * J7.1 — A semester, two tiers (e2e plan Phase 7).
 *
 * The flagship long arc: a brand-new account registers, builds a whole small
 * semester by hand (2 health systems, 3 sites, 3 clerkships incl. an elective,
 * 4 preceptors — one left un-materialised — and 5 students, one un-onboarded at
 * the second health system), hand-schedules student 1 fully (including a
 * deliberate override day), exports as a Stage 1 user, is then granted `autogen`
 * and drives generation to completion — and everything the human did survives:
 *
 *   register → 3-month schedule → build the world →
 *   hand-schedule S1 (clean days + one over_required_days override) →
 *   export (Stage 1: only manual sources) →
 *   grant autogen → readiness names the un-materialised preceptor (P4) →
 *   materialise P4 → lock S1's hand rows →
 *   Full → S1's locked hand rows untouched (by id), S2–S5 generated,
 *          S5's C3 days placed-but-flagged not_onboarded (J5.3 behaviour) →
 *   bypass not_onboarded → S5's C3 rows stamped with the code (P5-c) →
 *   onboard S5 + re-run → not_onboarded resolves to 0 →
 *   hand-edit two generated days → source stays generated →
 *   Completion → nothing lost →
 *   revoke autogen → Stage 1 edits still work, lock inert, /generate 403 →
 *   export → all sources present, the manual override code survives to the sheet.
 *
 * Asserted across all three layers (UI: readiness, calendar chips, health panel;
 * API: generate / validation / checklist; DB: source / locked / override_codes /
 * elective_id / ids).
 *
 * Reconciliation (recorded as D7-1): the plan framed S5 as "unmet". The engine
 * places an un-onboarded student's day and *surfaces* the soft violation rather
 * than leaving it unmet (the behaviour established and asserted in J5.3); this
 * journey asserts that place-but-flag behaviour and the bypass→stamp conversion.
 */

import {
	test,
	expect,
	apiOf,
	assignmentsForSchedule,
	assignmentRow,
	parseCodes,
	grantAutogen,
	setEntitlements,
	type Page
} from '../../fixtures';
import { CalendarPage } from '../../pages/calendar-page';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import { semesterWorld } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

interface Summary {
	isComplete: boolean;
	studentsWithUnmetRequirements: unknown[];
	lastRun: unknown | null;
}

/** Create one manual assignment; return its id (throws on rejection). */
async function createRow(page: Page, body: Record<string, unknown>): Promise<string> {
	const res = await apiOf(page).post<{ assignment?: { id: string }; id?: string }>(
		'/api/schedules/assignments',
		body
	);
	if (!res.ok) throw new Error(`create failed (${res.status}): ${JSON.stringify(res.error)}`);
	const id = res.data?.assignment?.id ?? res.data?.id;
	if (!id) throw new Error(`create: no id (${JSON.stringify(res.data)})`);
	return id;
}

function generate(page: Page, start: string, end: string, strategy: string, bypass: string[] = []) {
	return apiOf(page).post('/api/schedules/generate', {
		startDate: start,
		endDate: end,
		strategy,
		bypassedConstraints: bypass
	});
}

/** Read the Master Schedule sheet's Source (col 8) and Override Codes (col 10). */
async function exportSheet(page: Page, start: string, end: string) {
	const res = await page.request.get(`/api/schedules/export?start_date=${start}&end_date=${end}`);
	expect(res.status()).toBe(200);
	const ExcelJS = (await import('exceljs')).default;
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await res.body());
	const ws = wb.getWorksheet('Master Schedule')!;
	const sources: string[] = [];
	const overrideCodes: string[] = [];
	ws.eachRow((row, n) => {
		if (n === 1) return; // header
		sources.push(String(row.getCell(8).value ?? ''));
		overrideCodes.push(String(row.getCell(10).value ?? ''));
	});
	return { sources, overrideCodes };
}

test.describe('J7.1 a semester, two tiers', { tag: ['@stage2', '@long'] }, () => {
	test('the full arc: hand-built world survives generation, bypass, revoke and export', async ({
		asFreshUser,
		sandbox,
		db
	}) => {
		test.setTimeout(360000);
		const kysely = db as Kysely<DB>;
		const { page, user } = asFreshUser;
		const api = apiOf(page);

		// --- Build the world (register happened in the fixture; schedule + entities here) ---
		const w = await semesterWorld(page, kysely, { requiredDays: 2 });
		sandbox.register(w.sandbox);
		const [s1, s2, s3, s4, s5] = w.students;
		const fw = w.futureWeekdays;
		expect(fw.length).toBeGreaterThan(10);

		// UI/API sanity: 2 HS, 3 sites, 3 clerkships, 4 preceptors, 5 students are in scope.
		const count = async (path: string) => ((await api.get<unknown[]>(path)).data ?? []).length;
		expect(await count('/api/health-systems')).toBeGreaterThanOrEqual(2);
		expect(await count('/api/sites')).toBeGreaterThanOrEqual(3);
		expect(await count('/api/preceptors')).toBeGreaterThanOrEqual(4);
		expect(await count('/api/students')).toBeGreaterThanOrEqual(5);

		// --- Hand-schedule S1 fully (as a Stage 1 user): C1×2 clean, one C1 override
		// (over_required_days), C2×2 clean, C3×2 clean, and one C3 elective day ---
		const s1Ids: string[] = [];
		const mk = (body: Record<string, unknown>) => createRow(page, { student_id: s1, ...body });
		s1Ids.push(
			await mk({ preceptor_id: w.p1, clerkship_id: w.c1, site_id: w.siteA1, date: fw[0] })
		);
		s1Ids.push(
			await mk({ preceptor_id: w.p1, clerkship_id: w.c1, site_id: w.siteA1, date: fw[1] })
		);
		// The override day: a 3rd C1 day exceeds the 2 required → over_required_days.
		const overrideId = await mk({
			preceptor_id: w.p1,
			clerkship_id: w.c1,
			site_id: w.siteA1,
			date: fw[2],
			override_codes: ['over_required_days'],
			override_note: 'Extra continuity day (hand override)'
		});
		s1Ids.push(overrideId);
		s1Ids.push(
			await mk({ preceptor_id: w.p2, clerkship_id: w.c2, site_id: w.siteA2, date: fw[3] })
		);
		s1Ids.push(
			await mk({ preceptor_id: w.p2, clerkship_id: w.c2, site_id: w.siteA2, date: fw[4] })
		);
		s1Ids.push(
			await mk({ preceptor_id: w.p3, clerkship_id: w.c3, site_id: w.siteB1, date: fw[5] })
		);
		s1Ids.push(
			await mk({ preceptor_id: w.p3, clerkship_id: w.c3, site_id: w.siteB1, date: fw[6] })
		);
		const electiveRowId = await mk({
			preceptor_id: w.p3,
			clerkship_id: w.c3,
			site_id: w.siteB1,
			date: fw[7],
			elective_id: w.electiveId
		});
		s1Ids.push(electiveRowId);

		// DB: all S1 rows are manual; the override carries its code; the elective its id.
		{
			const rows = await assignmentsForSchedule(kysely, w.scheduleId);
			expect(rows).toHaveLength(8);
			expect(rows.every((r) => r.source === 'manual')).toBe(true);
			expect(parseCodes((await assignmentRow(kysely, overrideId))!.override_codes)).toContain(
				'over_required_days'
			);
			expect((await assignmentRow(kysely, electiveRowId))!.elective_id).toBe(w.electiveId);
		}

		// --- Export as a Stage 1 user: every row is manual ---
		{
			const { sources } = await exportSheet(page, w.sandbox.start, w.sandbox.end);
			expect(sources).toHaveLength(8);
			expect(new Set(sources)).toEqual(new Set(['manual']));
		}

		// A Stage 1 user cannot generate or lock.
		expect((await generate(page, w.sandbox.start, w.sandbox.end, 'full-reoptimize')).status).toBe(
			403
		);
		await api.patch(`/api/schedules/assignments/${s1Ids[0]}`, { locked: true });
		expect((await assignmentRow(kysely, s1Ids[0]))!.locked).toBe(0);

		// --- Grant autogen; the hook resolves entitlements per request, so reload ---
		await grantAutogen(kysely, user.email);
		await page.reload();

		// --- Readiness names the un-materialised preceptor (P4 has no availability) ---
		const availItem = async () => {
			const items = (
				await api.get<Array<{ id: string; done: boolean; count?: number }>>(
					'/api/schedules/checklist'
				)
			).data!;
			return items.find((i) => i.id === 'availability')!;
		};
		{
			const item = await availItem();
			expect(item.done).toBe(false);
			expect(item.count ?? 0).toBeGreaterThanOrEqual(1); // P4
		}
		// The /generate page is now reachable (entitled) and shows the readiness list.
		await page.goto('/generate');
		await expect(page.getByRole('button', { name: /generate schedule/i })).toBeVisible({
			timeout: 20000
		});

		// --- Materialise P4's availability at A1 → the availability item clears ---
		{
			const ts = new Date().toISOString();
			await kysely
				.insertInto('preceptor_availability')
				.values(
					fw.slice(0, 10).map((date) => ({
						id: crypto.randomUUID(),
						preceptor_id: w.p4,
						site_id: w.siteA1,
						date,
						is_available: 1,
						created_at: ts,
						updated_at: ts
					}))
				)
				.execute();
			expect((await availItem()).done).toBe(true);
		}

		// --- Lock S1's hand rows so a Full run cannot touch them ---
		for (const id of s1Ids) {
			expect((await api.patch(`/api/schedules/assignments/${id}`, { locked: true })).ok).toBe(true);
		}
		expect((await assignmentRow(kysely, s1Ids[0]))!.locked).toBe(1);

		// --- Full generation ---
		const first = await generate(page, w.sandbox.start, w.sandbox.end, 'full-reoptimize');
		expect(first.ok).toBe(true);

		// S1's locked hand rows are untouched (same ids, still manual + locked).
		for (const id of s1Ids) {
			const row = await assignmentRow(kysely, id);
			expect(row, `S1 hand row ${id} preserved`).toBeTruthy();
			expect(row!.source).toBe('manual');
			expect(row!.locked).toBe(1);
		}

		// S2–S5 have generated rows.
		const generatedFor = async (studentId: string) =>
			(await assignmentsForSchedule(kysely, w.scheduleId)).filter(
				(r) => r.student_id === studentId && r.source === 'generated'
			);
		for (const s of [s2, s3, s4, s5]) {
			expect((await generatedFor(s)).length).toBeGreaterThan(0);
		}

		// S5's C3 days are placed-but-flagged not_onboarded (D7-1): the rows exist and
		// carry no accepted code yet, and the health surface counts the violation.
		const s5C3 = (await generatedFor(s5)).filter((r) => r.clerkship_id === w.c3);
		expect(s5C3.length).toBeGreaterThan(0);
		expect(s5C3.every((r) => parseCodes(r.override_codes).length === 0)).toBe(true);
		{
			const v = (await api.get<{ counts: Record<string, number> }>('/api/schedules/validation'))
				.data!;
			expect(v.counts['not_onboarded'] ?? 0).toBeGreaterThanOrEqual(s5C3.length);
		}

		// --- Bypass not_onboarded: S5's C3 rows come back stamped with the code (P5-c) ---
		const bypassed = await generate(page, w.sandbox.start, w.sandbox.end, 'full-reoptimize', [
			'not_onboarded'
		]);
		expect(bypassed.ok).toBe(true);
		{
			const rows = (await generatedFor(s5)).filter((r) => r.clerkship_id === w.c3);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.every((r) => parseCodes(r.override_codes).includes('not_onboarded'))).toBe(true);
		}

		// The health panel counts the generated override alongside the manual one.
		{
			const cal = new CalendarPage(page);
			await cal.goto();
			await expect(cal.grid.locator('[data-source="generated"]').first()).toBeVisible({
				timeout: 15000
			});
			// The overrides fetch populates the panel asynchronously; poll the derived
			// counts until both the generated (not_onboarded) and manual
			// (over_required_days) overrides have surfaced, rather than reading once.
			await expect
				.poll(async () => (await cal.health.overrideCounts())['not_onboarded'] ?? 0, {
					timeout: 15000
				})
				.toBeGreaterThanOrEqual(1);
			const overrides = await cal.health.overrideCounts();
			expect(overrides['over_required_days'] ?? 0).toBeGreaterThanOrEqual(1); // S1's manual override
		}

		// --- Onboard S5 at HS-B and re-run: not_onboarded resolves to 0 ---
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: s5,
				health_system_id: w.hsB,
				is_completed: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.execute();
		expect((await generate(page, w.sandbox.start, w.sandbox.end, 'full-reoptimize')).ok).toBe(true);
		{
			const v = (await api.get<{ counts: Record<string, number> }>('/api/schedules/validation'))
				.data!;
			expect(v.counts['not_onboarded'] ?? 0).toBe(0);
			const summary = (await api.get<Summary>('/api/schedule/summary')).data!;
			expect(summary.isComplete).toBe(true);
			expect(summary.studentsWithUnmetRequirements).toHaveLength(0);
		}

		// --- Hand-edit two generated days → source stays generated ---
		const editable = (await generatedFor(s2)).slice(0, 2);
		expect(editable.length).toBe(2);
		const edited: Array<{ id: string; date: string }> = [];
		const usedForS2 = (await assignmentsForSchedule(kysely, w.scheduleId))
			.filter((r) => r.student_id === s2)
			.map((r) => r.date);
		let excludeExtra: string[] = [];
		for (const row of editable) {
			const to = await freeWeekdayForStudents(kysely, [s2], 1, [...usedForS2, ...excludeExtra]);
			excludeExtra.push(to);
			expect((await api.patch(`/api/schedules/assignments/${row.id}`, { date: to })).ok).toBe(true);
			const after = await assignmentRow(kysely, row.id!);
			expect(after!.date).toBe(to);
			expect(after!.source).toBe('generated');
			edited.push({ id: row.id!, date: to });
		}

		// --- Completion → nothing lost ---
		const totalBefore = (await assignmentsForSchedule(kysely, w.scheduleId)).length;
		expect((await generate(page, w.sandbox.start, w.sandbox.end, 'completion')).ok).toBe(true);
		const totalAfter = await assignmentsForSchedule(kysely, w.scheduleId);
		expect(totalAfter.length).toBe(totalBefore);
		// S1's locked hand rows and the two hand-edits survived completion.
		for (const id of s1Ids) expect(await assignmentRow(kysely, id)).toBeTruthy();
		for (const e of edited) expect((await assignmentRow(kysely, e.id))!.date).toBe(e.date);

		// --- Revoke autogen: Stage 1 edits still work, lock is inert, /generate 403 ---
		await setEntitlements(kysely, user.email, []);
		await page.reload();
		expect((await page.goto('/generate'))?.status()).toBe(403);

		// A Stage 1 move of a generated row still succeeds.
		{
			const target = (await generatedFor(s3))[0];
			const to = await freeWeekdayForStudents(
				kysely,
				[s3],
				1,
				(await assignmentsForSchedule(kysely, w.scheduleId))
					.filter((r) => r.student_id === s3)
					.map((r) => r.date)
			);
			expect((await api.patch(`/api/schedules/assignments/${target.id}`, { date: to })).ok).toBe(
				true
			);
			expect((await assignmentRow(kysely, target.id!)).date).toBe(to);
			// The lock toggle is ignored without the entitlement.
			await api.patch(`/api/schedules/assignments/${target.id}`, { locked: true });
			expect((await assignmentRow(kysely, target.id!)).locked).toBe(0);
		}

		// --- Export contains all sources; the manual override code survived the arc ---
		{
			const { sources, overrideCodes } = await exportSheet(page, w.sandbox.start, w.sandbox.end);
			expect(new Set(sources)).toEqual(new Set(['manual', 'generated']));
			expect(overrideCodes.join(' ')).toMatch(/over_required_days/);
		}
	});
});
