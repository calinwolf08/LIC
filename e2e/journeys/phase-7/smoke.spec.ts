/**
 * J7.1 (smoke) — the trimmed register→build→generate→export arc (e2e plan §9).
 *
 * A fast, PR-blocking slice of the flagship long arc: an entitled account builds
 * the semester world, hand-schedules a couple of clean days for one student, runs
 * a Full generation, and exports. It asserts the essentials in one pass — manual
 * rows survive as `manual`, generation places the rest as `generated`, and the
 * export carries both sources — without the bypass/revoke/onboarding branches the
 * @long J7.1 exercises.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { semesterWorld } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

async function createRow(page: Page, body: Record<string, unknown>): Promise<string> {
	const res = await apiOf(page).post<{ assignment?: { id: string }; id?: string }>(
		'/api/schedules/assignments',
		body
	);
	if (!res.ok) throw new Error(`create failed (${res.status}): ${JSON.stringify(res.error)}`);
	return (res.data?.assignment?.id ?? res.data?.id)!;
}

test.describe(
	'J7.1 smoke — register → build → generate → export',
	{ tag: ['@smoke', '@stage2'] },
	() => {
		test('the essential arc in one pass', async ({ asFreshEntitledUser, sandbox, db }) => {
			test.setTimeout(180000);
			const kysely = db as Kysely<DB>;
			const { page } = asFreshEntitledUser;
			const w = await semesterWorld(page, kysely, { requiredDays: 2 });
			sandbox.register(w.sandbox);
			const s1 = w.students[0];
			const fw = w.futureWeekdays;

			// Hand-schedule two clean C1 days for S1, then lock them so Full leaves them.
			const api = apiOf(page);
			const id1 = await createRow(page, {
				student_id: s1,
				preceptor_id: w.p1,
				clerkship_id: w.c1,
				site_id: w.siteA1,
				date: fw[0]
			});
			const id2 = await createRow(page, {
				student_id: s1,
				preceptor_id: w.p1,
				clerkship_id: w.c1,
				site_id: w.siteA1,
				date: fw[1]
			});
			for (const id of [id1, id2]) {
				expect((await api.patch(`/api/schedules/assignments/${id}`, { locked: true })).ok).toBe(
					true
				);
			}

			// Full generation.
			expect(
				(
					await api.post('/api/schedules/generate', {
						startDate: w.sandbox.start,
						endDate: w.sandbox.end,
						strategy: 'full-reoptimize'
					})
				).ok
			).toBe(true);

			// The two locked manual rows survived; other students were generated.
			const rows = await assignmentsForSchedule(kysely, w.scheduleId);
			const manual = rows.filter((r) => r.source === 'manual');
			const generated = rows.filter((r) => r.source === 'generated');
			expect(manual.map((r) => r.id).sort()).toEqual([id1, id2].sort());
			expect(generated.length).toBeGreaterThan(0);

			// Export carries both sources.
			const res = await page.request.get(
				`/api/schedules/export?start_date=${w.sandbox.start}&end_date=${w.sandbox.end}`
			);
			expect(res.status()).toBe(200);
			const ExcelJS = (await import('exceljs')).default;
			const wb = new ExcelJS.Workbook();
			await wb.xlsx.load(await res.body());
			const ws = wb.getWorksheet('Master Schedule')!;
			const sources: string[] = [];
			ws.eachRow((row, n) => {
				if (n > 1) sources.push(String(row.getCell(8).value ?? ''));
			});
			expect(new Set(sources)).toEqual(new Set(['manual', 'generated']));
		});
	}
);
