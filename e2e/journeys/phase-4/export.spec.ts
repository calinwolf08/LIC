// @coverage @req(R8.5)
// @coverage @finding(P4-f)
/**
 * J4.3 — Export honours filters and carries the truth (e2e plan Phase 4).
 *
 * With a known set of rows (plain, one overridden), the .xlsx export is fetched
 * over the same session, parsed with exceljs, and asserted:
 *   - unfiltered → one row per assignment on the Master Schedule sheet, each
 *     carrying student, preceptor, clerkship, site, date, source and the
 *     accepted override codes (finding P4-f — site and override codes were
 *     missing from the export before this phase);
 *   - filter by preceptor → only that preceptor's rows;
 *   - filter by date range → only rows in range;
 *   - empty result → headers only, HTTP 200;
 *   - Content-Disposition names a file dated today;
 *   - a malformed id → 400.
 *
 * Blackout dates are schedule-scoped now (finding P4-d), so the one blackout this
 * test adds lives on the sandbox and is removed with the schedule.
 */

import { test, expect, apiOf, type Page } from '../../fixtures';
import ExcelJS from 'exceljs';
import { populatedSandbox, createAssignment, freeWeekdayForStudents } from './helpers';

/** Codes a seeded-roster day may trip that don't matter to this test. */
const SAFETY = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];

interface ExportRow {
	date: string;
	student: string;
	preceptor: string;
	clerkship: string;
	site: string;
	source: string;
	override: string;
}

/** Fetch the export over the page's session and parse the Master Schedule sheet. */
async function exportMasterRows(
	page: Page,
	params: Record<string, string>
): Promise<{ rows: ExportRow[]; rowCount: number; filename: string; status: number }> {
	const qs = new URLSearchParams(params).toString();
	const res = await page.request.get(`/api/schedules/export?${qs}`);
	const status = res.status();
	const filename = res.headers()['content-disposition'] ?? '';
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await res.body());
	const ws = wb.getWorksheet('Master Schedule');
	const rows: ExportRow[] = [];
	// Header is row 1; data rows follow. Column order is fixed by the exporter.
	const val = (row: ExcelJS.Row, n: number) => String(row.getCell(n).value ?? '');
	ws.eachRow((row, n) => {
		if (n === 1) return;
		rows.push({
			date: val(row, 1),
			student: val(row, 2),
			preceptor: val(row, 3),
			clerkship: val(row, 4),
			site: val(row, 6),
			source: val(row, 8),
			override: val(row, 10)
		});
	});
	return { rows, rowCount: ws.rowCount, filename, status };
}

test.describe('J4.3 export honours filters', { tag: ['@stage1'] }, () => {
	test('unfiltered truth, preceptor/date filters, empty sheet, bad id', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J4.3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const bob = roster.students.find((s) => s.name === 'Bob Williams')!;
		const carol = roster.students.find((s) => s.name === 'Carol Martinez')!;
		const michael = roster.preceptors.find((p) => p.name === 'Dr. Michael Lee')!;
		const sarah = roster.preceptors.find((p) => p.name === 'Dr. Sarah Wilson')!;
		const peds = roster.clerkships.find((c) => c.name === 'Pediatrics')!.id;
		const community = roster.sites.find((s) => s.name === 'Community Hospital')!;

		// Three distinct free weekdays (global UNIQUE(student,date) forces genuinely
		// free days). d3 is the overridden (blackout) day.
		const d1 = await freeWeekdayForStudents(db, [bob.id], 8);
		const d2 = await freeWeekdayForStudents(db, [carol.id], 8, [d1]);
		const d3 = await freeWeekdayForStudents(db, [bob.id], 8, [d1, d2]);

		// A blackout on d3 (scoped to the active sandbox schedule).
		await api.post('/api/blackout-dates', { date: d3, reason: 'Export test blackout' });

		// Known rows: two plain (different preceptors), one overridden (blackout).
		await createAssignment(asAdmin, {
			student_id: bob.id,
			preceptor_id: michael.id,
			clerkship_id: peds,
			site_id: community.id,
			date: d1,
			override_codes: SAFETY
		});
		await createAssignment(asAdmin, {
			student_id: carol.id,
			preceptor_id: sarah.id,
			clerkship_id: peds,
			site_id: community.id,
			date: d2,
			override_codes: SAFETY
		});
		await createAssignment(asAdmin, {
			student_id: bob.id,
			preceptor_id: sarah.id,
			clerkship_id: peds,
			site_id: community.id,
			date: d3,
			override_codes: [...SAFETY, 'blackout_date']
		});

		const wide = { start_date: d1 < d2 ? d1 : d2, end_date: '2027-06-30' };

		// --- Unfiltered: one row per assignment, carrying the truth ---
		const all = await exportMasterRows(asAdmin, wide);
		expect(all.status).toBe(200);
		const mine = all.rows.filter((r) => [d1, d2, d3].includes(r.date));
		expect(mine).toHaveLength(3);
		for (const r of mine) {
			expect(r.clerkship).toBe('Pediatrics');
			expect(r.site).toBe('Community Hospital');
			expect(r.source).toBe('manual');
		}
		// The blackout row names the accepted override code (the truth the export
		// must carry — this column did not exist before P4-f).
		const overridden = mine.find((r) => r.date === d3)!;
		expect(overridden.override).toContain('blackout_date');
		// Filename dated today (UTC, matching the server).
		const todayStr = new Date().toISOString().slice(0, 10);
		expect(all.filename).toContain(`schedule-${todayStr}.xlsx`);

		// --- Filter by preceptor → only Dr. Michael Lee's row (d1) ---
		const byPreceptor = await exportMasterRows(asAdmin, {
			...wide,
			preceptor_id: michael.id
		});
		const michaelRows = byPreceptor.rows.filter((r) => [d1, d2, d3].includes(r.date));
		expect(michaelRows.map((r) => r.date)).toEqual([d1]);
		expect(michaelRows[0].preceptor).toBe('Dr. Michael Lee');

		// --- Filter by date range → only d1 ---
		const byRange = await exportMasterRows(asAdmin, { start_date: d1, end_date: d1 });
		expect(byRange.rows.map((r) => r.date)).toEqual([d1]);

		// --- Empty result → headers only (1 row), HTTP 200 ---
		const empty = await exportMasterRows(asAdmin, {
			start_date: '2027-06-01',
			end_date: '2027-06-02'
		});
		expect(empty.status).toBe(200);
		expect(empty.rowCount).toBe(1);

		// --- A malformed id is rejected with 400, not a 500 ---
		const bad = await asAdmin.request.get(
			`/api/schedules/export?start_date=${d1}&end_date=${d1}&student_id=not-a-real-id`
		);
		expect(bad.status()).toBe(400);
	});
});
