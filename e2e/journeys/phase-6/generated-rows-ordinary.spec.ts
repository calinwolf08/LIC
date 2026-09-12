/**
 * J6.1 — Generated rows are ordinary rows (e2e plan Phase 6).
 *
 * An auto-generated assignment is edited like any manual one — moved, reassigned,
 * locked, deleted — and its provenance is preserved: `source` stays `generated`
 * (and `elective_id` is untouched) through every edit. Then the entitlement is
 * revoked for the same user: the Stage 1 edits still succeed, but the lock toggle
 * is gone (the server ignores `locked` without autogen) and /generate is 403.
 * Re-granting restores the lock (G12).
 *
 * Toggles the seeded admin's entitlement, restored (to autogen) at the end.
 */

import { test, expect, apiOf, ADMIN, grantAutogen, setEntitlements } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import { assignmentRow } from '../../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('J6.1 generated rows are ordinary rows', { tag: ['@stage2'] }, () => {
	test('edit / lock / delete a generated row; revoke keeps edits but drops the lock', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 3, students: 1 });
		sandbox.register(gen.sandbox);
		const student = gen.studentIds[0];

		expect(
			(
				await api.post('/api/schedules/generate', {
					startDate: gen.sandbox.start,
					endDate: gen.sandbox.end,
					strategy: 'full-reoptimize'
				})
			).ok
		).toBe(true);
		const rows = await kysely
			.selectFrom('schedule_assignments')
			.selectAll()
			.where('schedule_id', '=', gen.scheduleId)
			.orderBy('date', 'asc')
			.execute();
		expect(rows).toHaveLength(3);
		const [r0, r1, r2] = rows;

		// A second preceptor for the reassign.
		const prec2 = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr Two ${Date.now()}`,
				email: `two_${Date.now()}@example.com`,
				max_students: 5,
				health_system_id: gen.hsId,
				site_ids: [gen.siteId]
			})
		).data!.id;

		// --- Move r0 to a free day → still generated ---
		const usedDates = rows.map((r) => r.date);
		const moveTo = await freeWeekdayForStudents(kysely, [student], 8, usedDates);
		expect((await api.patch(`/api/schedules/assignments/${r0.id}`, { date: moveTo })).ok).toBe(
			true
		);
		let after0 = await assignmentRow(kysely, r0.id!);
		expect(after0.date).toBe(moveTo);
		expect(after0.source).toBe('generated');

		// --- Reassign r1 to the other preceptor (force past any soft code) → still generated ---
		expect(
			(await api.patch(`/api/schedules/assignments/${r1.id}?force=true`, { preceptor_id: prec2 }))
				.ok
		).toBe(true);
		const after1 = await assignmentRow(kysely, r1.id!);
		expect(after1.preceptor_id).toBe(prec2);
		expect(after1.source).toBe('generated');

		// --- Lock r2 (entitled) → locked, still generated ---
		expect((await api.patch(`/api/schedules/assignments/${r2.id}`, { locked: true })).ok).toBe(
			true
		);
		let after2 = await assignmentRow(kysely, r2.id!);
		expect(after2.locked).toBe(1);
		expect(after2.source).toBe('generated');

		// --- Delete r0 → gone ---
		expect((await api.delete(`/api/schedules/assignments/${r0.id}`)).ok).toBe(true);
		expect(await assignmentRow(kysely, r0.id!)).toBeUndefined();

		try {
			// --- Revoke the entitlement: Stage 1 edits still work, lock is inert ---
			await setEntitlements(kysely, ADMIN.email, []);
			expect((await asAdmin.goto('/generate'))?.status()).toBe(403);

			const moveTo2 = await freeWeekdayForStudents(kysely, [student], 8, [...usedDates, moveTo]);
			expect((await api.patch(`/api/schedules/assignments/${r1.id}`, { date: moveTo2 })).ok).toBe(
				true
			);
			expect((await assignmentRow(kysely, r1.id!)).date).toBe(moveTo2);

			// The lock toggle is ignored without autogen.
			await api.patch(`/api/schedules/assignments/${r1.id}`, { locked: true });
			expect((await assignmentRow(kysely, r1.id!)).locked).toBe(0);

			// --- Re-grant → lock works again ---
			await grantAutogen(kysely, ADMIN.email);
			expect((await api.patch(`/api/schedules/assignments/${r1.id}`, { locked: true })).ok).toBe(
				true
			);
			expect((await assignmentRow(kysely, r1.id!)).locked).toBe(1);
		} finally {
			await setEntitlements(kysely, ADMIN.email, ['autogen']);
		}
	});
});
