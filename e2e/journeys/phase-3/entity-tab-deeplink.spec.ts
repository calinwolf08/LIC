/**
 * P3-b regression — EntityTabs restores the active tab from the URL.
 *
 * The shared entity tab bar writes the chosen tab to `?tab=…`; it must also read
 * it back so a deep-linked or reloaded URL opens that tab rather than the default
 * Overview. Read-only navigation on the seeded Demo schedule (no sandbox needed).
 */

import { test, expect, apiOf } from '../../fixtures';

test.describe('P3-b entity tabs — deep-link restore', { tag: ['@stage1'] }, () => {
	test('a ?tab= URL opens that tab on the student page', async ({ asAdmin }) => {
		test.setTimeout(60000);
		const students = await apiOf(asAdmin).get<Array<{ id: string }>>('/api/students');
		const studentId = (students.data ?? [])[0]?.id;
		expect(studentId, 'seed provides at least one student').toBeTruthy();

		// Deep-link straight to the Progress tab.
		await asAdmin.goto(`/students/${studentId}?tab=progress`);
		await expect(asAdmin.getByRole('tab', { name: 'Progress' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(asAdmin.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
			'aria-selected',
			'false'
		);

		// A reload keeps the deep-linked tab (the param is restored on mount).
		await asAdmin.reload();
		await expect(asAdmin.getByRole('tab', { name: 'Progress' })).toHaveAttribute(
			'aria-selected',
			'true'
		);

		// Clicking another tab updates the URL, and that URL restores on reload.
		await asAdmin.getByRole('tab', { name: 'Schedule' }).click();
		await expect(asAdmin).toHaveURL(/[?&]tab=schedule\b/);
		await asAdmin.reload();
		await expect(asAdmin.getByRole('tab', { name: 'Schedule' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	});
});
