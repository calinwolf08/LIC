/**
 * Page object for a student's page (`/students/[id]`): the per-student conflict
 * panel (L1) and the Schedule tab's list of assignment rows, plus the entry point
 * into the assignment dialog. Used by manual-planning journeys and as the
 * student-surface cross-check in auto-gen journeys.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export class StudentSchedulePage {
	constructor(private readonly page: Page) {}

	async goto(studentId: string) {
		await this.page.goto(`/students/${studentId}`);
		await expect(this.page.getByRole('tab', { name: 'Schedule' })).toBeVisible({ timeout: 15000 });
	}

	// ---- conflict panel (renders only when conflicts exist) ----------------

	get conflictPanel(): Locator {
		return this.page.getByTestId('student-conflicts');
	}

	/** Conflict rows as `{code, date}`, parsed from `student-conflict-{code}-{date}`. */
	async conflicts(): Promise<Array<{ code: string; date: string }>> {
		if (!(await this.conflictPanel.isVisible().catch(() => false))) return [];
		const rows = this.conflictPanel.locator('[data-testid^="student-conflict-"]');
		const ids = await rows.evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-testid') ?? '')
		);
		return ids
			.map((id) => id.replace(/^student-conflict-/, ''))
			.map((rest) => {
				// code may contain underscores; the trailing YYYY-MM-DD is the date.
				const m = rest.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/);
				return m ? { code: m[1], date: m[2] } : { code: rest, date: '' };
			});
	}

	async hasConflict(code: string, date?: string): Promise<boolean> {
		return (await this.conflicts()).some(
			(c) => c.code === code && (date === undefined || c.date === date)
		);
	}

	async conflictCount(): Promise<number> {
		return (await this.conflicts()).length;
	}

	// ---- schedule list -----------------------------------------------------

	async openScheduleList() {
		await this.page.getByRole('tab', { name: 'Schedule' }).click();
		await this.page.getByRole('button', { name: 'List', exact: true }).click();
	}

	/** The list row for a (date, preceptor) assignment. */
	row(date: string, preceptorName: string): Locator {
		return this.page.locator('tr', { hasText: date }).filter({ hasText: preceptorName });
	}

	/** Navigate to `studentId`, open the list, and click Edit on the (date,
	 * preceptor) row. Navigating here makes the call safe from any starting page. */
	async openEditForDate(studentId: string, date: string, preceptorName: string) {
		await this.goto(studentId);
		await this.openScheduleList();
		const row = this.row(date, preceptorName);
		await expect(row).toBeVisible({ timeout: 15000 });
		await row.getByRole('button', { name: 'Edit' }).click();
	}
}
