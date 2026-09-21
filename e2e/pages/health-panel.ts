/**
 * Page object for the schedule-health panel (calendar page, `data-testid="schedule-health"`).
 *
 * The panel renders collapsed: the pill ("N conflicts" / "No conflicts") is
 * always visible, while "Conflicts by type" and the override list only exist in
 * the DOM after "Show details". Every reader below expands first, so a journey
 * never has to know that.
 *
 * Exposes the three numbers journeys compare across surfaces: the total conflict
 * pill, the per-code breakdown, and the override list with its resolved toggle.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export class HealthPanel {
	constructor(private readonly page: Page) {}

	get root(): Locator {
		return this.page.getByTestId('schedule-health');
	}

	async expectVisible() {
		await expect(this.root).toBeVisible({ timeout: 15000 });
	}

	/** Open the details section if it is collapsed. */
	async expand() {
		await this.expectVisible();
		const show = this.root.getByRole('button', { name: /show details/i });
		if (await show.isVisible().catch(() => false)) {
			await show.click();
		}
		await expect(this.root.getByRole('heading', { name: 'Conflicts by type' })).toBeVisible();
	}

	async collapse() {
		const hide = this.root.getByRole('button', { name: /hide details/i });
		if (await hide.isVisible().catch(() => false)) await hide.click();
	}

	/** 0 when the panel shows "No conflicts". */
	async violationCount(): Promise<number> {
		await this.expectVisible();
		const pill = this.root.getByTestId('health-violation-count');
		if (!(await pill.isVisible().catch(() => false))) return 0;
		const text = (await pill.textContent()) ?? '';
		return Number(text.match(/\d+/)?.[0] ?? 0);
	}

	/** `{ code: count }` from the "Conflicts by type" rows. */
	async countsByCode(): Promise<Record<string, number>> {
		await this.expand();
		const rows = this.root.locator('[data-testid="health-type-row"]');
		const out: Record<string, number> = {};
		const n = await rows.count();
		for (let i = 0; i < n; i++) {
			const row = rows.nth(i);
			const code = (await row.getAttribute('data-code')) ?? '';
			const count = Number(((await row.textContent()) ?? '').match(/(\d+)\s*$/)?.[1] ?? 0);
			out[code] = count;
		}
		return out;
	}

	/** `{ code: count }` from the override filter chips. */
	async overrideCounts(): Promise<Record<string, number>> {
		await this.expand();
		const chips = this.root.locator('[data-testid="override-count"]');
		// The chips arrive with the overrides fetch; wait for either chips or the
		// empty-state text so an early read does not return {}.
		await expect(chips.first().or(this.root.getByText(/no overrides/i).first())).toBeVisible({
			timeout: 10000
		});
		const out: Record<string, number> = {};
		const n = await chips.count();
		for (let i = 0; i < n; i++) {
			const chip = chips.nth(i);
			const code = (await chip.getAttribute('data-code')) ?? '';
			const count = Number(((await chip.textContent()) ?? '').match(/\((\d+)\)/)?.[1] ?? 0);
			out[code] = count;
		}
		return out;
	}

	async setIncludeResolved(on: boolean) {
		await this.expand();
		const box = this.root.getByTestId('include-resolved');
		if (on) await box.check();
		else await box.uncheck();
	}

	/** Each grouped override row: its text and the status badge. */
	async overrideRows(): Promise<Array<{ text: string; status: string }>> {
		await this.expand();
		const list = this.root.getByTestId('override-list');
		await expect(list.or(this.root.getByText(/no overrides/i).first())).toBeVisible({
			timeout: 10000
		});
		if (!(await list.isVisible().catch(() => false))) return [];
		const items = list.locator('> li');
		const out: Array<{ text: string; status: string }> = [];
		const n = await items.count();
		for (let i = 0; i < n; i++) {
			const li = items.nth(i);
			out.push({
				text: ((await li.textContent()) ?? '').replace(/\s+/g, ' ').trim(),
				status: (
					(await li
						.getByTestId('override-status')
						.textContent()
						.catch(() => '')) ?? ''
				).trim()
			});
		}
		return out;
	}
}
