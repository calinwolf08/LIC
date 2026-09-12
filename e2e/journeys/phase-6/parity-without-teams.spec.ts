/**
 * J6.3 — Parity without teams (e2e plan Phase 6).
 *
 * A schedule whose preceptors are on no team at all still generates once the
 * user is entitled: team-less clerkships fall back to any available preceptor
 * (G11 / P-02), so a Full run completes rather than reporting "no preceptors
 * available". Readiness reflects *materialised* availability: a preceptor with no
 * availability rows leaves the availability item unfinished (the materialise
 * hint), even though others are ready.
 *
 * Grants the seeded basic user autogen for the run, then restores it.
 */

import { test, expect, apiOf, BASIC, grantAutogen, revokeAutogen } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

interface ChecklistItem {
	id: string;
	label: string;
	done: boolean;
}

test.describe('J6.3 parity without teams', { tag: ['@stage2'] }, () => {
	test('team-less preceptors generate once entitled; readiness needs materialised availability', async ({
		asBasic,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asBasic);
		// A basic user builds a workable schedule — no teams anywhere.
		const gen = await generationSandbox(asBasic, kysely, { requiredDays: 2, students: 1 });
		sandbox.register(gen.sandbox);

		// Readiness is clean before we add an unavailable preceptor.
		const before = (await api.get<ChecklistItem[]>('/api/schedules/checklist')).data!;
		expect(before.find((i) => i.id === 'availability')!.done).toBe(true);

		try {
			await grantAutogen(kysely, BASIC.email);

			// Full run uses the team-less preceptor and completes (P-02).
			const run = await api.post('/api/schedules/generate', {
				startDate: gen.sandbox.start,
				endDate: gen.sandbox.end,
				strategy: 'full-reoptimize'
			});
			expect(run.ok).toBe(true);
			const rows = await kysely
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('schedule_id', '=', gen.scheduleId)
				.execute();
			expect(rows.length).toBe(gen.requiredDays);
			expect(rows.every((r) => r.source === 'generated')).toBe(true);
			const summary = (await api.get<{ isComplete: boolean }>('/api/schedule/summary')).data!;
			expect(summary.isComplete).toBe(true);
		} finally {
			await revokeAutogen(kysely, BASIC.email);
		}

		// --- Readiness reflects materialised availability: a preceptor with none
		// leaves the availability item unfinished (the materialise hint) ---
		await api.post('/api/preceptors', {
			name: `Dr NoAvail ${Date.now()}`,
			email: `noavail_${Date.now()}@example.com`,
			max_students: 5,
			health_system_id: gen.hsId,
			site_ids: [gen.siteId]
		});
		const after = (await api.get<ChecklistItem[]>('/api/schedules/checklist')).data!;
		const avail = after.find((i) => i.id === 'availability')!;
		expect(avail.done).toBe(false);
		expect(avail.label).toMatch(/availability/i);
	});
});
