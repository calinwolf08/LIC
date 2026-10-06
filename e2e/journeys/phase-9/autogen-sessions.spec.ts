// @coverage @finding(CF-L1) @req(R7)
/**
 * CF-L1 (auto-gen side) — the generator packs a morning + an afternoon on one day.
 *
 * Two one-day clerkships, each served by a preceptor whose only availability is a
 * single shared date — one a morning (AM) slot, the other an afternoon (PM). Auto-
 * generation should place both on that date for the student: a morning of one
 * clerkship and an afternoon of the other, each worth half a day of credit, rather
 * than leaving the second clerkship unmet (L1).
 */

import { test, expect, apiOf, assignmentsForSchedule, fromToday } from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return d;
		n++;
	}
}

test.describe('CF-L1 auto-gen packs AM + PM on one day', { tag: ['@stage2', '@long'] }, () => {
	test('generation places a morning of one clerkship and an afternoon of another', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();
		const day = futureWeekday(8);
		const rangeEnd = futureWeekday(15);

		// Active sandbox spanning a short range; the preceptors' only availability is on
		// `day`, so that is the only date generation can place on.
		const sb = await createSandboxSchedule(asAdmin, {
			name: `L1 gen ${stamp}`,
			start: day,
			end: rangeEnd
		});
		sandbox.register(sb);

		const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` }))
			.data!.id;
		const siteId = (
			await api.post<{ id: string }>('/api/sites', {
				name: `Site ${stamp}`,
				health_system_id: hsId
			})
		).data!.id;

		// Two one-day outpatient clerkships.
		const mkClerkship = async (name: string) =>
			(
				await api.post<{ id: string }>('/api/clerkships', {
					name: `${name} ${stamp}`,
					required_days: 1,
					clerkship_type: 'outpatient'
				})
			).data!.id;
		const clerkAm = await mkClerkship('AM Clerkship');
		const clerkPm = await mkClerkship('PM Clerkship');

		// A preceptor per clerkship, both at the shared site.
		const mkPreceptor = async (name: string) =>
			(
				await api.post<{ id: string }>('/api/preceptors', {
					name: `Dr. ${name} ${stamp}`,
					email: `${name}_${stamp}@example.com`,
					max_students: 5,
					health_system_id: hsId,
					site_ids: [siteId]
				})
			).data!.id;
		const precAm = await mkPreceptor('Morning');
		const precPm = await mkPreceptor('Afternoon');

		const studentId = (
			await api.post<{ id: string }>('/api/students', {
				name: `Gen Student ${stamp}`,
				email: `gen_${stamp}@example.com`
			})
		).data!.id;

		const ts = new Date().toISOString();
		// Both clerkships allow the site.
		await kysely
			.insertInto('clerkship_sites')
			.values([
				{ clerkship_id: clerkAm, site_id: siteId, created_at: ts },
				{ clerkship_id: clerkPm, site_id: siteId, created_at: ts }
			])
			.execute();
		// Onboard the student so not_onboarded doesn't muddy the run.
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: studentId,
				health_system_id: hsId,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// The morning preceptor offers only an AM slot on `day`; the afternoon
		// preceptor only a PM slot.
		await kysely
			.insertInto('preceptor_availability')
			.values([
				{
					id: crypto.randomUUID(),
					preceptor_id: precAm,
					site_id: siteId,
					date: day,
					is_available: 1,
					session: 'am',
					credit_value: 0.5,
					created_at: ts,
					updated_at: ts
				},
				{
					id: crypto.randomUUID(),
					preceptor_id: precPm,
					site_id: siteId,
					date: day,
					is_available: 1,
					session: 'pm',
					credit_value: 0.5,
					created_at: ts,
					updated_at: ts
				}
			])
			.execute();

		// Run a full generation.
		const gen = await api.post('/api/schedules/generate', {
			startDate: day,
			endDate: rangeEnd,
			strategy: 'full-reoptimize'
		});
		expect(gen.ok).toBe(true);

		// The student holds a morning and an afternoon on the one day — the two
		// clerkships share it, each worth half a day of credit.
		const rows = (await assignmentsForSchedule(kysely, sb.id)).filter(
			(r) => r.student_id === studentId && r.date === day
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.session).sort()).toEqual(['am', 'pm']);
		expect(new Set(rows.map((r) => r.clerkship_id))).toEqual(new Set([clerkAm, clerkPm]));
		expect(rows.every((r) => r.credit_value === 0.5)).toBe(true);
	});
});
