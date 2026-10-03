/**
 * Page object for the manual planner workspace (`/plan`, L4).
 *
 * The planner stages draft "pins", shows the conflicts they would produce, lets the
 * coordinator accept soft overrides, and commits the committable ones in one action.
 * This wraps those interactions for the MP-4 mega-journey.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export interface PinForm {
	student: string;
	kind?: 'clinical' | 'free_day' | 'exam';
	clerkship?: string;
	preceptor?: string;
	site?: string;
	session?: 'full' | 'am' | 'pm';
	date: string;
}

export class PlanPage {
	constructor(private readonly page: Page) {}

	async goto() {
		await this.page.goto('/plan');
		await expect(this.page.getByTestId('plan-workspace')).toBeVisible({ timeout: 15000 });
	}

	/** Stage one pin via the add form (single-date mode). */
	async addPin(form: PinForm) {
		const kind = form.kind ?? 'clinical';
		await this.page.getByTestId('plan-student').selectOption({ label: form.student });
		await this.page.getByTestId('plan-kind').selectOption(kind);
		if (kind === 'clinical') {
			if (form.clerkship) await this.page.getByTestId('plan-clerkship').selectOption({ label: form.clerkship });
			await this.page.getByTestId('plan-preceptor').selectOption({ label: form.preceptor! });
			await this.page.getByTestId('plan-site').selectOption({ label: form.site! });
			await this.page.getByTestId('plan-session').selectOption(form.session ?? 'full');
		}
		await this.page.getByTestId('plan-mode-single').click();
		await this.page.getByTestId('plan-date').fill(form.date);
		const before = await this.rows().count();
		await this.page.getByTestId('plan-add').click();
		await expect(this.rows()).toHaveCount(before + 1, { timeout: 10000 });
	}

	rows(): Locator {
		return this.page.locator('li[data-testid^="plan-pin-"]');
	}

	/** The pin ids currently staged, in list order. */
	async pinIds(): Promise<string[]> {
		return this.rows().evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-testid')!.replace('plan-pin-', ''))
		);
	}

	status(pinId: string): Locator {
		return this.page.getByTestId(`plan-pin-status-${pinId}`);
	}

	async acceptCode(pinId: string, code: string) {
		await this.page.getByTestId(`plan-pin-accept-${pinId}-${code}`).click();
		await expect(this.status(pinId)).toHaveText('OK', { timeout: 10000 });
	}

	async removePin(pinId: string) {
		await this.page.getByTestId(`plan-pin-remove-${pinId}`).click();
	}

	conflictCount(): Locator {
		return this.page.getByTestId('plan-conflict-count');
	}

	conflictRow(code: string): Locator {
		return this.page.getByTestId(`plan-conflict-${code}`);
	}

	commitButton(): Locator {
		return this.page.getByTestId('plan-commit');
	}

	async commit() {
		await this.commitButton().click();
		await expect(this.page.getByTestId('plan-commit-result')).toBeVisible({ timeout: 15000 });
	}

	commitResult(): Locator {
		return this.page.getByTestId('plan-commit-result');
	}
}
