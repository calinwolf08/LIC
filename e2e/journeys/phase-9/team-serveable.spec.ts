// @coverage @finding(CF-G3) @finding(CF-G4)
/**
 * CF-G3 / CF-G4 — A team's serveable clerkships are inferred from its members,
 * and a team whose members share no clerkship is flagged.
 *
 * Client feedback G3: "clerkships listed, inferred from each member's eligibility."
 * G4: "warnings if there's any gaps in overlap (e.g. one preceptor family
 * medicine, the other surgery)."
 *
 * This creates a two-member team whose members have no availability (so they
 * share no serveable clerkship), then loads the team detail and asserts both the
 * serveable section (G3) and the no-overlap warning (G4) render. The positive /
 * partial cases are covered at the unit layer in eligibility.test.ts.
 */

import { test, expect, apiOf } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

test.describe('CF-G3/G4 team serveable clerkships + overlap warning', { tag: ['@stage1'] }, () => {
	test('a team whose members share no clerkship shows the serveable section and a warning', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-G3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const clerkship = roster.clerkships[0];
		expect(clerkship).toBeTruthy();

		// Two brand-new preceptors with no availability → they can serve no clerkship
		// in common, so the team does not overlap.
		const stamp = Date.now();
		const ids: string[] = [];
		for (const label of ['A', 'B']) {
			const res = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
				name: `Dr. NoAvail ${label} ${stamp}`,
				email: `noavail_${label}_${stamp}@example.com`,
				max_students: 1
			});
			expect(res.ok).toBe(true);
			ids.push(res.data?.preceptor?.id ?? res.data!.id!);
		}
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'preceptors',
			entityIds: ids
		});

		const created = await api.post<{ id: string }>('/api/preceptors/teams', {
			clerkshipId: clerkship.id,
			name: `No-overlap team ${stamp}`,
			members: [
				{ preceptorId: ids[0], priority: 1 },
				{ preceptorId: ids[1], priority: 2 }
			]
		});
		expect(created.status, created.error?.message ?? '').toBe(201);
		const teamId = created.data!.id;

		await asAdmin.goto(`/preceptors/teams/${teamId}`);

		// G3: the serveable-clerkships section renders.
		await expect(asAdmin.getByTestId('team-serveable')).toBeVisible({ timeout: 15000 });
		// G4: members share no serveable clerkship → overlap warning.
		await expect(asAdmin.getByTestId('team-overlap-warning')).toBeVisible({ timeout: 15000 });
	});
});
