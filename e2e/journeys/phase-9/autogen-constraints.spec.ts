// @coverage @finding(CF-L2) @finding(CF-M2) @req(R7) @req(R8)
/**
 * Engine-only auto-generation guarantees that the phase-10 AG mega-journeys do
 * NOT cover (Phase 3 consolidation leaves only these here):
 *   - L2: the engine never places two mutually-exclusive preceptors for a student
 *     on a day. No AG world carries a mutual-exclusion rule, so this is the sole
 *     coverage of the engine's L2 *auto-avoidance* (the manual-override side is
 *     MP-2 / mutual-exclusion.spec.ts).
 *   - full-reoptimize preserves a hand-placed non-clinical day: a full rebuild
 *     deletes and regenerates future clinical days but must keep the coordinator's
 *     free day. AG-3 proves this for *completion* mode; this proves it for the
 *     destructive *full-reoptimize* mode, which no AG journey exercises over a
 *     pre-placed free day.
 *
 * The L3 block-week and M2/M3 "no clinical on a non-clinical day" auto cases this
 * file used to carry are now owned, end to end through the real Generate dialog, by
 * AG-1 (block/scatter at scale) and AG-3 (completion preserves + never double-books
 * the free day). Driven here through the REAL `/api/schedules/generate` endpoint;
 * each test stands up its own workable sandbox so the assertion is unambiguous.
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
/** The first weekday strictly after `date` — so two "future weekdays" never collide
 * onto the same Monday when today's weekday makes their offsets line up. */
function nextWeekday(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	do {
		d.setUTCDate(d.getUTCDate() + 1);
	} while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
	return d.toISOString().slice(0, 10);
}

test.describe('auto-generation honors scheduling constraints', { tag: ['@stage2', '@long'] }, () => {
	test('L2: the generator never pairs two mutually-exclusive preceptors on a day', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();
		const day = futureWeekday(8);
		const end = futureWeekday(15);

		const sb = await createSandboxSchedule(asAdmin, { name: `AG-L2 ${stamp}`, start: day, end });
		sandbox.register(sb);
		const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` })).data!
			.id;
		const siteId = (
			await api.post<{ id: string }>('/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
		).data!.id;

		const clerkA = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `A ${stamp}`,
				required_days: 1,
				clerkship_type: 'outpatient'
			})
		).data!.id;
		const clerkB = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `B ${stamp}`,
				required_days: 1,
				clerkship_type: 'outpatient'
			})
		).data!.id;
		const precA = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr A ${stamp}`,
				email: `a_${stamp}@x.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).data!.id;
		const precB = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr B ${stamp}`,
				email: `b_${stamp}@x.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).data!.id;
		const studentId = (
			await api.post<{ id: string }>('/api/students', {
				name: `S ${stamp}`,
				email: `s_${stamp}@x.com`
			})
		).data!.id;

		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_sites')
			.values([
				{ clerkship_id: clerkA, site_id: siteId, created_at: ts },
				{ clerkship_id: clerkB, site_id: siteId, created_at: ts }
			])
			.execute();
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
		// Both preceptors offer only a full day on the single shared date.
		await kysely
			.insertInto('preceptor_availability')
			.values([
				{ id: crypto.randomUUID(), preceptor_id: precA, site_id: siteId, date: day, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts },
				{ id: crypto.randomUUID(), preceptor_id: precB, site_id: siteId, date: day, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts }
			])
			.execute();
		// Rule: A and B must not share a student-day.
		const [a, b] = precA <= precB ? [precA, precB] : [precB, precA];
		await kysely
			.insertInto('preceptor_mutual_exclusions')
			.values({ id: crypto.randomUUID(), preceptor_a_id: a, preceptor_b_id: b, created_at: ts })
			.execute();

		expect((await api.post('/api/schedules/generate', { startDate: day, endDate: end, strategy: 'full-reoptimize' })).ok).toBe(true);

		const onDay = (await assignmentsForSchedule(kysely, sb.id)).filter(
			(r) => r.student_id === studentId && r.date === day
		);
		// At most one of the two mutually-exclusive preceptors was placed that day.
		expect(onDay.length).toBe(1);
	});

	test('regeneration preserves a student\'s non-clinical days', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();
		const clinicalDay = futureWeekday(8);
		const freeDay = nextWeekday(clinicalDay); // always a distinct later weekday
		const end = futureWeekday(20);
		expect(freeDay).not.toBe(clinicalDay);

		const sb = await createSandboxSchedule(asAdmin, { name: `AG-REGEN ${stamp}`, start: clinicalDay, end });
		sandbox.register(sb);
		const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` })).data!.id;
		const siteId = (
			await api.post<{ id: string }>('/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
		).data!.id;
		const clerkA = (
			await api.post<{ id: string }>('/api/clerkships', {
				name: `A ${stamp}`,
				required_days: 1,
				clerkship_type: 'outpatient'
			})
		).data!.id;
		const precA = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr A ${stamp}`,
				email: `a_${stamp}@x.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).data!.id;
		const studentId = (
			await api.post<{ id: string }>('/api/students', { name: `S ${stamp}`, email: `s_${stamp}@x.com` })
		).data!.id;

		const ts = new Date().toISOString();
		await kysely.insertInto('clerkship_sites').values({ clerkship_id: clerkA, site_id: siteId, created_at: ts }).execute();
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({ id: crypto.randomUUID(), student_id: studentId, health_system_id: hsId, is_completed: 1, created_at: ts, updated_at: ts })
			.execute();
		await kysely
			.insertInto('preceptor_availability')
			.values({ id: crypto.randomUUID(), preceptor_id: precA, site_id: siteId, date: clinicalDay, is_available: 1, session: 'full', credit_value: 1, created_at: ts, updated_at: ts })
			.execute();

		// First generation places the clinical day.
		expect((await api.post('/api/schedules/generate', { startDate: clinicalDay, endDate: end, strategy: 'full-reoptimize' })).ok).toBe(true);
		const afterGen = (await assignmentsForSchedule(kysely, sb.id)).filter((r) => r.student_id === studentId);
		expect(afterGen.some((r) => r.kind === 'clinical' && r.date === clinicalDay)).toBe(true);

		// The coordinator hand-adds a free day on a different date.
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: studentId,
					kind: 'free_day',
					date: freeDay,
					override_codes: ['outside_schedule', 'blackout_date', 'session_clash']
				})
			).ok
		).toBe(true);

		// A full re-optimize (which deletes and rebuilds future clinical days) must NOT
		// touch the hand-placed free day.
		expect((await api.post('/api/schedules/generate', { startDate: clinicalDay, endDate: end, strategy: 'full-reoptimize' })).ok).toBe(true);
		const afterRegen = (await assignmentsForSchedule(kysely, sb.id)).filter((r) => r.student_id === studentId);
		// The free day survived the regeneration…
		expect(afterRegen.some((r) => r.kind === 'free_day' && r.date === freeDay)).toBe(true);
		// …and the clinical requirement is still met.
		expect(afterRegen.some((r) => r.kind === 'clinical')).toBe(true);
	});
});
