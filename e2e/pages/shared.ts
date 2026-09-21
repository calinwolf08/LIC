/**
 * Small page objects for the shared UI primitives every detail page uses.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** The `EntityTabs` strip on a detail page (`role="tablist"`). */
export class EntityTabs {
	constructor(private readonly page: Page) {}

	get root(): Locator {
		return this.page.getByRole('tablist');
	}

	async select(name: string) {
		const tab = this.root.getByRole('tab', { name, exact: true });
		await tab.click();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
	}

	async names(): Promise<string[]> {
		// `allTextContents` does not wait; make sure the strip has rendered first.
		await expect(this.root.getByRole('tab').first()).toBeVisible({ timeout: 15000 });
		return (await this.root.getByRole('tab').allTextContents()).map((t) => t.trim());
	}

	async has(name: string): Promise<boolean> {
		return (await this.names()).includes(name);
	}
}

/** The shared `ConfirmDialog` (destructive actions + dependency explanations). */
export class ConfirmDialog {
	constructor(private readonly page: Page) {}

	get root(): Locator {
		return this.page.getByRole('dialog').last();
	}

	async expectOpen(titlePattern?: RegExp) {
		await expect(this.root).toBeVisible();
		if (titlePattern) await expect(this.root).toContainText(titlePattern);
	}

	async text(): Promise<string> {
		return ((await this.root.textContent()) ?? '').replace(/\s+/g, ' ').trim();
	}

	/** Click the confirming button; defaults to the common destructive labels. */
	async confirm(label: RegExp = /^(delete|remove|confirm|yes|continue)/i) {
		await this.root.getByRole('button', { name: label }).click();
	}

	async cancel() {
		await this.root.getByRole('button', { name: /^cancel$/i }).click();
	}
}

/** A toast / inline success message. */
export async function expectToast(page: Page, pattern: RegExp, timeout = 10000) {
	await expect(page.getByText(pattern).first()).toBeVisible({ timeout });
}
