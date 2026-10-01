/**
 * Page object for auto-generation driven through the real UI.
 *
 * Covers the /generate readiness checklist, the Regenerate dialog (mode radios,
 * per-constraint bypass, Apply), and the /generate/results readout — so journeys
 * run the engine the way a coordinator does (the button, not the API) and read the
 * outcome the coordinator sees.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export type RegenMode = 'full' | 'smart' | 'completion';

export class GeneratePage {
	constructor(private readonly page: Page) {}

	async goto() {
		await this.page.goto('/generate');
		await expect(this.page.getByRole('button', { name: /generate schedule/i })).toBeVisible({
			timeout: 15000
		});
	}

	/** Readiness item state, when the checklist renders it. */
	async readiness(id: string): Promise<boolean | null> {
		const item = this.page.getByTestId(`readiness-${id}`);
		if (!(await item.isVisible().catch(() => false))) return null;
		return (await item.getAttribute('data-done')) === 'true';
	}

	private async openDialog() {
		await this.page.getByRole('button', { name: /generate schedule/i }).click();
		await expect(this.page.getByText('Full Regeneration (Start Over)')).toBeVisible({
			timeout: 10000
		});
	}

	/**
	 * Open the dialog, pick a mode, optionally relax constraints, and click Apply.
	 * `fromDate` sets the smart-mode cutoff. Returns after the success toast.
	 */
	async generate(
		mode: RegenMode,
		opts: { bypass?: string[]; fromDate?: string } = {}
	): Promise<void> {
		await this.goto();
		await this.openDialog();
		await this.page.locator(`input[type="radio"][value="${mode}"]`).check();

		if (mode === 'smart' && opts.fromDate) {
			await this.page.locator('#cutoff_date').fill(opts.fromDate);
		}
		for (const code of opts.bypass ?? []) {
			// Bypass checkboxes are labelled by their human text; match on the code's row.
			const box = this.bypassBox(code);
			if (await box.isVisible().catch(() => false)) await box.check();
		}

		await this.page.getByRole('button', { name: /apply regeneration/i }).click();
		await expect(
			this.page
				.getByText(/successfully cleared|preserved .* assignments|generated .* new assignments/i)
				.first()
		).toBeVisible({ timeout: 30000 });
	}

	private bypassBox(code: string): Locator {
		const label: Record<string, RegExp> = {
			preceptor_unavailable: /preceptor availability/i,
			preceptor_capacity: /preceptor capacity/i,
			not_onboarded: /student onboarding/i,
			site_not_allowed: /allowed site/i,
			blackout_date: /blackout/i
		};
		const re = label[code] ?? new RegExp(code, 'i');
		return this.page.locator('label', { hasText: re }).locator('input[type="checkbox"]');
	}

	// ---- results page ------------------------------------------------------

	async gotoResults() {
		await this.page.goto('/generate/results');
		await expect(this.page.getByTestId('results')).toBeVisible({ timeout: 15000 });
	}

	async resultsComplete(): Promise<boolean> {
		return (await this.page.getByTestId('results').getAttribute('data-complete')) === 'true';
	}

	resultsUnmet(): Locator {
		return this.page.getByTestId('results-unmet');
	}
}
