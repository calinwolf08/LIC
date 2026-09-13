// @coverage @req(G6) @req(G11)
/**
 * J5.6 — Teams management (e2e plan Phase 5).
 *
 * A preceptor team scopes which preceptors a clerkship's generated days may use.
 * The formation rules are enforced (a same-site rule rejects a cross-site
 * member), a valid team is created, listed on /generate/teams, edited and
 * deleted, and generation for a clerkship that has a team places days using the
 * team's member — while a team-less clerkship still generates (G11, shown in
 * J5.1).
 */

import { test, expect, apiOf, assignmentsForSchedule, type Api, type Page } from '../../fixtures';
import { generationSandbox } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

async function makePreceptor(
	api: Api,
	name: string,
	hsId: string,
	siteId: string
): Promise<string> {
	const r = await api.post<{ id: string }>('/api/preceptors', {
		name,
		email: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}@example.com`,
		max_students: 5,
		health_system_id: hsId,
		site_ids: [siteId]
	});
	return r.data!.id;
}

interface ValidateResult {
	isValid: boolean;
	errors: unknown[];
}

function validateTeam(
	page: Page,
	members: string[],
	clerkshipId: string,
	requireSameSite: boolean
) {
	return apiOf(page).post<ValidateResult>('/api/preceptors/teams/validate', {
		members: members.map((preceptorId, i) => ({ preceptorId, priority: i + 1 })),
		config: {
			requireSameHealthSystem: false,
			requireSameSite,
			requireSameSpecialty: false,
			requiresAdminApproval: false
		},
		options: { clerkshipId }
	});
}

test.describe('J5.6 teams management', { tag: ['@stage2'] }, () => {
	test('formation rules, CRUD, and team-based generation', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(gen.sandbox);
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		// A second site in the same health system, and two more preceptors: one at
		// the clerkship's site, one at the other site.
		const site2 = (
			await api.post<{ id: string }>('/api/sites', {
				name: `Site B ${stamp}`,
				health_system_id: gen.hsId
			})
		).data!.id;
		const sameSitePrec = await makePreceptor(api, 'Dr Same', gen.hsId, gen.siteId);
		const crossSitePrec = await makePreceptor(api, 'Dr Cross', gen.hsId, site2);

		// --- Formation rule: requireSameSite rejects a cross-site member ---
		const bad = await validateTeam(
			asAdmin,
			[gen.preceptorId, crossSitePrec],
			gen.clerkshipId,
			true
		);
		expect(bad.ok).toBe(true);
		expect(bad.data!.isValid).toBe(false);
		expect(JSON.stringify(bad.data!.errors)).toMatch(/site/i);

		// ...and accepts a same-site pair.
		const good = await validateTeam(
			asAdmin,
			[gen.preceptorId, sameSitePrec],
			gen.clerkshipId,
			true
		);
		expect(good.ok).toBe(true);
		expect(good.data!.isValid).toBe(true);

		// --- Create the team (same-site pair) ---
		const created = await api.post<{ id: string }>('/api/preceptors/teams', {
			clerkshipId: gen.clerkshipId,
			requireSameSite: true,
			members: [
				{ preceptorId: gen.preceptorId, priority: 1 },
				{ preceptorId: sameSitePrec, priority: 2 }
			]
		});
		expect(created.ok).toBe(true);
		const teamId = created.data!.id;

		// Listed for the schedule (API) and on /generate/teams (UI).
		const list = await api.get<Array<{ id: string }>>('/api/preceptors/teams');
		expect(list.data!.some((t) => t.id === teamId)).toBe(true);
		await asAdmin.goto('/generate/teams');
		await expect(asAdmin.getByRole('button', { name: /add team/i })).toBeVisible({
			timeout: 15000
		});
		// The team (unnamed) renders as a card in the list.
		await expect(asAdmin.getByText(/unnamed team/i).first()).toBeVisible({ timeout: 15000 });

		// --- Edit members (drop the second member) ---
		const edited = await api.patch(`/api/preceptors/teams/${teamId}`, {
			id: teamId,
			clerkshipId: gen.clerkshipId,
			requireSameSite: true,
			members: [{ preceptorId: gen.preceptorId, priority: 1 }]
		});
		expect(edited.ok).toBe(true);

		// --- Generation for the clerkship (which now has a team) still places days ---
		expect(
			(
				await api.post('/api/schedules/generate', {
					startDate: gen.sandbox.start,
					endDate: gen.sandbox.end,
					strategy: 'full-reoptimize'
				})
			).ok
		).toBe(true);
		const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(rows.length).toBeGreaterThan(0);
		// Every generated day uses a team member (only gen.preceptorId remains).
		expect(rows.every((r) => r.preceptor_id === gen.preceptorId)).toBe(true);

		// --- Delete the team ---
		const del = await api.delete(`/api/preceptors/teams/${teamId}`);
		expect(del.ok).toBe(true);
		const after = await api.get<Array<{ id: string }>>('/api/preceptors/teams');
		expect(after.data!.some((t) => t.id === teamId)).toBe(false);
	});
});
