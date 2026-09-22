// @coverage @finding(CF-N1) @req(R10.1)
/**
 * CF-N1 — Every entity detail page says which entity it is about, so the user
 * always knows whose numbers they are looking at.
 *
 * Client feedback: "User generally is unclear when they're on a specific entity
 * page. Ex on preceptor page seeing capacity and not sure if applying to student
 * or what." Each detail page now carries a page-context eyebrow ("Preceptor",
 * "Student", …) and the preceptor capacity panel names its subject. This also
 * resolves I4 (the student schedule now clearly reads as a single student).
 */

import { test, expect } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

test.describe('CF-N1 page context + metric subjects', { tag: ['@stage1'] }, () => {
	test('each detail page names its entity type; capacity names its subject', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-N1 ${Date.now()}`);
		sandbox.register(roster.sandbox);

		const cases: Array<{ path: string; context: string }> = [
			{ path: `/preceptors/${roster.preceptors[0].id}`, context: 'Preceptor' },
			{ path: `/students/${roster.students[0].id}`, context: 'Student' },
			{ path: `/clerkships/${roster.clerkships[0].id}`, context: 'Clerkship' },
			{ path: `/sites/${roster.sites[0].id}`, context: 'Site' },
			{ path: `/health-systems/${roster.healthSystems[0].id}`, context: 'Health System' }
		];

		for (const { path, context } of cases) {
			await asAdmin.goto(path);
			await expect(asAdmin.getByTestId('page-context')).toHaveText(context, { timeout: 15000 });
		}

		// The preceptor capacity panel is explicitly about this preceptor.
		await asAdmin.goto(`/preceptors/${roster.preceptors[0].id}`);
		await expect(
			asAdmin.getByText("This preceptor's availability and assigned days")
		).toBeVisible({ timeout: 15000 });
	});
});
