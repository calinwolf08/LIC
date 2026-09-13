// @coverage @req(R3.4) @req(R3.5)
/**
 * J3.9 — Availability changes ripple into schedule health (e2e plan Phase 3).
 *
 * A clean assignment stops being clean when the preceptor is later marked
 * unavailable on that day: the schedule-health panel gains a
 * `preceptor_unavailable` conflict for the existing row. This proves the health
 * view is computed from live availability, not frozen at assignment time. Runs
 * in a populated sandbox on Alice Johnson + Dr. Amanda Smith.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { HealthPanel } from '../../pages';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const PRECEPTOR = 'Dr. Amanda Smith';
const CLERKSHIP = 'Family Medicine';
const SITE = 'Metro General Hospital';

test.describe('J3.9 manual scheduling — availability ripple', { tag: ['@stage1'] }, () => {
	test('marking the preceptor unavailable surfaces a conflict on the existing day', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.9 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const alice = roster.students.find((s) => s.name === STUDENT)!;
		const amandaId = roster.preceptors.find((p) => p.name === PRECEPTOR)!.id;
		const clerkshipId = roster.clerkships.find((c) => c.name === CLERKSHIP)!.id;
		const siteId = roster.sites.find((s) => s.name === SITE)!.id;

		// A weekday free of any existing assignment for Alice (global UNIQUE row).
		const used = new Set(
			(
				await db
					.selectFrom('schedule_assignments')
					.select('date')
					.where('student_id', '=', alice.id)
					.execute()
			).map((r) => r.date)
		);
		let n = 8;
		let day = fromToday(n);
		for (;;) {
			const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
			if (dow !== 0 && dow !== 6 && !used.has(day)) break;
			day = fromToday(++n);
		}

		// A clean assignment: Amanda is available (seeded) and Alice is onboarded.
		const created = await api.post('/api/schedules/assignments', {
			student_id: alice.id,
			preceptor_id: amandaId,
			clerkship_id: clerkshipId,
			site_id: siteId,
			date: day
		});
		expect(created.ok, `clean create failed: ${JSON.stringify(created.error)}`).toBe(true);

		// Baseline health: however many preceptor_unavailable conflicts exist now.
		await asAdmin.goto('/calendar');
		let health = new HealthPanel(asAdmin);
		await health.expectVisible();
		const before = (await health.countsByCode())['preceptor_unavailable'] ?? 0;

		// preceptor_availability is GLOBAL (not schedule-scoped, so not torn down
		// with the sandbox). Restore Amanda to available on this day afterwards so
		// later journeys using her don't inherit an unavailable date.
		try {
			// Ripple: mark Amanda unavailable at that site on that day.
			const avail = await api.post(`/api/preceptors/${amandaId}/availability`, {
				preceptor_id: amandaId,
				site_id: siteId,
				availability: [{ date: day, is_available: false }]
			});
			expect(avail.ok, `availability update failed: ${JSON.stringify(avail.error)}`).toBe(true);

			// The health view, recomputed on reload, now flags the existing day.
			await asAdmin.goto('/calendar');
			health = new HealthPanel(asAdmin);
			await health.expectVisible();
			await expect(async () => {
				const after = (await health.countsByCode())['preceptor_unavailable'] ?? 0;
				expect(after).toBe(before + 1);
			}).toPass({ timeout: 15000 });
		} finally {
			await api.post(`/api/preceptors/${amandaId}/availability`, {
				preceptor_id: amandaId,
				site_id: siteId,
				availability: [{ date: day, is_available: true }]
			});
		}
	});
});
