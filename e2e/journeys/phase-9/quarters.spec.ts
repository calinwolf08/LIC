// @coverage @finding(CF-M4) @req(R8)
/**
 * CF-M4 — Schedule quarters.
 *
 * A schedule can define optional quarter date ranges. The journey opens the
 * schedule editor, adds a quarter, saves it, and confirms it persists (both
 * through the API and when the editor is reopened).
 */

import { test, expect, apiOf } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

test.describe('CF-M4 schedule quarters', { tag: ['@stage1'] }, () => {
	test('define a quarter in the schedule editor; it persists', async ({ asAdmin, sandbox }) => {
		test.setTimeout(200000);
		const name = `CF-M4 ${Date.now()}`;
		const roster = await populatedSandbox(asAdmin, name);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		await asAdmin.goto('/schedules');

		// Open the editor for this schedule's card (one Edit button per card).
		const card = asAdmin.locator('.grid.gap-4 > *', { hasText: name }).first();
		await expect(card).toBeVisible({ timeout: 15000 });
		await card.getByRole('button', { name: 'Edit' }).click();

		const editor = asAdmin.getByTestId('quarters-editor');
		await expect(editor).toBeVisible({ timeout: 15000 });

		await editor.getByTestId('add-quarter').click();
		const row = editor.getByTestId('quarter-row').first();
		await row.getByTestId('quarter-name').fill('Q1');
		await row.getByTestId('quarter-start').fill('2027-01-01');
		await row.getByTestId('quarter-end').fill('2027-03-31');
		await editor.getByTestId('save-quarters').click();

		// Persisted through the API.
		await expect
			.poll(async () => {
				const r = await api.get<{ quarters: { name: string }[] }>(
					`/api/scheduling-periods/${roster.sandbox.id}/quarters`
				);
				return (r.data?.quarters ?? []).map((q) => q.name);
			})
			.toContain('Q1');

		// And the saved value shows when the editor is reopened.
		await asAdmin.reload();
		const card2 = asAdmin.locator('.grid.gap-4 > *', { hasText: name }).first();
		await expect(card2).toBeVisible({ timeout: 15000 });
		await card2.getByRole('button', { name: 'Edit' }).click();
		const reopened = asAdmin.getByTestId('quarters-editor');
		await expect(reopened.getByTestId('quarter-name').first()).toHaveValue('Q1');
	});
});
