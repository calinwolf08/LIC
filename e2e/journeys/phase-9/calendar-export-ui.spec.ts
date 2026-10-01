// @coverage @finding(CF-EXPORT-UI) @req(R8.5)
/**
 * Export driven through the REAL calendar button.
 *
 * The export CONTENT (filters, columns, source/override truth) is proven over the
 * API in phase-4/export.spec. But the actual "Export to Excel" button on the
 * calendar — the only way a coordinator triggers an export — was clicked by no
 * test: it builds the query from the calendar's current filters, fetches the
 * file, and downloads it via a synthesized <a download>. This proves that button
 * actually produces a valid workbook download.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { CalendarPage } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';
import ExcelJS from 'exceljs';

const SAFETY = [
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule',
	'session_clash',
	'past_date'
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

test.describe('CF-EXPORT-UI calendar export button', { tag: ['@stage2', '@long'] }, () => {
	test('clicking "Export to Excel" downloads a valid workbook', async ({ asAdmin, sandbox }) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-EXPORT ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		// One assignment so the schedule isn't empty when exported.
		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const created = await api.post('/api/schedules/assignments', {
			student_id: roster.students[0].id,
			preceptor_id: amanda.id,
			clerkship_id: fm.id,
			site_id: roster.sites[0].id,
			date: futureWeekday(8),
			override_codes: SAFETY
		});
		expect(created.ok, 'seed assignment created').toBe(true);

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const exportBtn = asAdmin.getByRole('button', { name: /export to excel/i });
		await expect(exportBtn).toBeVisible({ timeout: 15000 });

		// Click the real button and capture the browser download it triggers.
		const [download] = await Promise.all([
			asAdmin.waitForEvent('download', { timeout: 20000 }),
			exportBtn.click()
		]);

		// The downloaded file is a real .xlsx with the Master Schedule sheet.
		expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
		const path = await download.path();
		expect(path, 'download saved to disk').toBeTruthy();
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.readFile(path!);
		expect(wb.getWorksheet('Master Schedule'), 'Master Schedule sheet present').toBeTruthy();
	});
});
