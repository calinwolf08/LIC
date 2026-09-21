// @coverage @finding(CF-G1)
/**
 * CF-G1 — Creating a team no longer hard-blocks on "same health system".
 *
 * Client feedback: "Couldn't create team. Got error all team members must be in
 * same health system even with one member." A one-member team whose preceptor
 * has no health system used to fail with a 409; it now creates.
 *
 * This drives the real team-create route in the authenticated browser session
 * (same cookies/tenant as the UI) rather than the multi-step team wizard: that
 * wizard's site → available-preceptor steps depend on clerkship_sites data the
 * seeded sandbox doesn't carry, so the exact regression (a member with no health
 * system) can't be assembled through its clicks. The service-layer regression for
 * the one-member-no-HS and cross-health-system cases is additionally covered in
 * teams.service.test.ts ("same-health-system is a soft guide (G1)").
 */

import { test, expect, apiOf } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

test.describe('CF-G1 team creation is not hard-blocked by same-health-system', {
	tag: ['@stage1']
}, () => {
	test('a one-member team with no health system and the rule ON creates (was a 409)', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-G1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const clerkship = roster.clerkships[0];
		expect(clerkship).toBeTruthy();

		// A brand-new preceptor with NO health system — the exact shape that used to
		// trip the hard block even as the sole member.
		const stamp = Date.now();
		const created = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
			name: `Dr. NoHS ${stamp}`,
			email: `nohs_${stamp}@example.com`,
			max_students: 1
		});
		expect(created.ok).toBe(true);
		const precId = created.data?.preceptor?.id ?? created.data?.id;
		expect(precId).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'preceptors',
			entityIds: [precId]
		});

		// Create the team with the same-health-system rule ON.
		const res = await api.post('/api/preceptors/teams', {
			clerkshipId: clerkship.id,
			name: `Solo Team ${stamp}`,
			requireSameHealthSystem: true,
			members: [{ preceptorId: precId, priority: 1 }]
		});

		// Before the fix this returned 409 "All team members must be in the same
		// health system"; now it succeeds.
		expect(res.status, res.error?.message ?? '').toBe(201);
		expect(res.ok).toBe(true);
	});
});
