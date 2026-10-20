// @coverage @finding(CF-M4) @req(R8)
/**
 * CF-M4 — Schedule quarters.
 *
 * A schedule can define optional quarters. In the schedule editor, "Add quarter"
 * names each new quarter Q<n> and chains its dates: Q1 starts on the schedule's
 * start, every later quarter the day after the previous one ends, three months
 * long. Overlapping or out-of-range quarters are flagged inline and can't be
 * saved; a valid set persists (API + reopened editor).
 */

import { test, expect, apiOf } from '../../fixtures';
import { nextQuarter } from '../../../src/lib/features/schedules/utils/quarters';

test.describe('CF-M4 schedule quarters', { tag: ['@stage1'] }, () => {
	test('add chained quarters, catch an overlap, save; they persist', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(120000);
		const name = `CF-M4 ${Date.now()}`;
		// A full calendar year in the future: four 3-month quarters fill it exactly.
		const year = new Date().getUTCFullYear() + 2;
		const box = await sandbox.create(asAdmin, {
			name,
			start: `${year}-01-01`,
			end: `${year}-12-31`
		});
		const range = { start_date: box.start, end_date: box.end };
		const q1 = nextQuarter([], range)!;
		const q2 = nextQuarter([q1], range)!;
		const api = apiOf(asAdmin);

		await asAdmin.goto('/schedules');
		const card = asAdmin.locator('.grid.gap-4 > *', { hasText: name }).first();
		await expect(card).toBeVisible({ timeout: 15000 });
		await card.getByRole('button', { name: 'Edit' }).click();

		const editor = asAdmin.getByTestId('quarters-editor');
		await expect(editor).toBeVisible({ timeout: 15000 });
		await expect(editor.getByTestId('quarters-help')).toHaveAttribute('title', /named periods/);

		// Q1 starts on the schedule's start; Q2 the day after Q1 ends.
		await editor.getByTestId('add-quarter').click();
		await editor.getByTestId('add-quarter').click();
		const rows = editor.getByTestId('quarter-row');
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0).getByTestId('quarter-name')).toHaveValue('Q1');
		await expect(rows.nth(0).getByTestId('quarter-start')).toHaveValue(box.start);
		await expect(rows.nth(0).getByTestId('quarter-end')).toHaveValue(q1.end_date);
		await expect(rows.nth(1).getByTestId('quarter-name')).toHaveValue('Q2');
		await expect(rows.nth(1).getByTestId('quarter-start')).toHaveValue(q2.start_date);

		// Make Q2 start on Q1's last day: an overlap, flagged inline, not savable.
		await rows.nth(1).getByTestId('quarter-start').fill(q1.end_date);
		await expect(editor.getByTestId('quarter-issue')).toHaveText('Q2 overlaps Q1');
		await expect(editor.getByTestId('save-quarters')).toBeDisabled();

		// Fix it, then add Q3 and Q4: Q4 ends on the schedule's last day, so
		// there is no room for a fifth.
		await rows.nth(1).getByTestId('quarter-start').fill(q2.start_date);
		await expect(editor.getByTestId('quarter-issue')).toHaveCount(0);
		await editor.getByTestId('add-quarter').click();
		await editor.getByTestId('add-quarter').click();
		await expect(rows.nth(3).getByTestId('quarter-name')).toHaveValue('Q4');
		await expect(rows.nth(3).getByTestId('quarter-end')).toHaveValue(box.end);
		await expect(editor.getByTestId('add-quarter')).toBeDisabled();
		await editor.getByTestId('save-quarters').click();

		await expect
			.poll(async () => {
				const r = await api.get<{ quarters: { name: string; start_date: string }[] }>(
					`/api/scheduling-periods/${box.id}/quarters`
				);
				return (r.data?.quarters ?? []).map((q) => `${q.name}@${q.start_date}`);
			})
			.toEqual([`Q1@${box.start}`, `Q2@${q2.start_date}`, `Q3@${year}-07-01`, `Q4@${year}-10-01`]);

		// The server enforces the same rule: an overlapping set is refused.
		const refused = await api.put(`/api/scheduling-periods/${box.id}/quarters`, {
			quarters: [
				{ name: 'Q1', start_date: q1.start_date, end_date: q1.end_date },
				{ name: 'Q2', start_date: q1.end_date, end_date: q2.end_date }
			]
		});
		expect(refused.status).toBe(400);

		// The saved values show when the editor is reopened.
		await asAdmin.reload();
		const card2 = asAdmin.locator('.grid.gap-4 > *', { hasText: name }).first();
		await expect(card2).toBeVisible({ timeout: 15000 });
		await card2.getByRole('button', { name: 'Edit' }).click();
		const reopened = asAdmin.getByTestId('quarters-editor');
		await expect(reopened.getByTestId('quarter-name')).toHaveCount(4);
		await expect(reopened.getByTestId('quarter-name').first()).toHaveValue('Q1');
	});
});
