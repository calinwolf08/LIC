/**
 * Page object for the unified assignment dialog (create + edit).
 *
 * Every entry point — calendar day, student page, preceptor page — renders the
 * same component, so this object works everywhere; only which pickers arrive
 * pre-filled differs. It builds on the proven helpers in
 * `../journeys/assignment-helpers.ts` and adds what the journeys need beyond
 * them: range selection, the elective picker, the lock checkbox, branch
 * selection in the override conversation, and three-way outcome assertions.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import {
	openAssignmentDialog,
	pickDay as pickDayHelper,
	waitForOption,
	dayState as dayStateHelper
} from '../journeys/assignment-helpers';

export type Outcome = 'clean' | 'soft' | 'hard';

/** Buttons that accept an override conversation, in default preference order. */
export const ACCEPT_LABELS: RegExp[] = [
	/^assign anyway$/i,
	/assign and mark available/i,
	/double-book this day/i,
	/just this exception/i
];

export class AssignmentDialog {
	constructor(private readonly page: Page) {}

	/** The dialog that contains the day grid (the calendar page has its own month controls). */
	get root(): Locator {
		return this.page
			.getByRole('dialog')
			.filter({ has: this.page.getByTestId('assignment-day-grid') });
	}

	/** Click "Add assignment" (first on the page) and wait for the grid. */
	async open(): Promise<this> {
		await openAssignmentDialog(this.page);
		return this;
	}

	/** Wait for an already-opened dialog (e.g. after a calendar day click). */
	async waitUntilOpen(): Promise<this> {
		await expect(this.page.getByTestId('assignment-day-grid')).toBeVisible({ timeout: 20000 });
		return this;
	}

	get isEdit(): Promise<boolean> {
		return this.page
			.getByRole('button', { name: /^save changes$/i })
			.isVisible()
			.catch(() => false);
	}

	// ---- pickers -----------------------------------------------------------

	async selectStudent(label: string) {
		await waitForOption(this.page, 'ad-student', label);
		await this.page.locator('#ad-student').selectOption({ label });
	}
	async selectClerkship(label: string) {
		await waitForOption(this.page, 'ad-clerkship', label);
		await this.page.locator('#ad-clerkship').selectOption({ label });
	}
	async selectPreceptor(label: string) {
		await waitForOption(this.page, 'ad-preceptor', label);
		await this.page.locator('#ad-preceptor').selectOption({ label });
	}
	async selectSite(label: string) {
		await waitForOption(this.page, 'ad-site', label);
		await this.page.locator('#ad-site').selectOption({ label });
	}
	/** Pick an elective by (partial) label, or `null` for "No elective". */
	async selectElective(label: string | null) {
		const select = this.page.locator('#ad-elective');
		await expect(select).toBeVisible({ timeout: 10000 });
		if (label === null) {
			await select.selectOption({ index: 0 });
			return;
		}
		await expect(select.locator('option', { hasText: label })).toHaveCount(1, { timeout: 10000 });
		const value = await select.locator('option', { hasText: label }).getAttribute('value');
		await select.selectOption(value!);
	}
	/** Labels of options the dialog currently offers in a select. */
	async optionLabels(select: 'student' | 'clerkship' | 'preceptor' | 'site' | 'elective') {
		return this.page.locator(`#ad-${select} option`).allTextContents();
	}
	/** True when the option is present but rendered disabled (ineligible with a reason). */
	async optionDisabled(
		select: 'student' | 'clerkship' | 'preceptor' | 'site' | 'elective',
		label: string
	): Promise<boolean> {
		return this.page.locator(`#ad-${select} option`, { hasText: label }).isDisabled();
	}

	// ---- day grid ----------------------------------------------------------

	async setMode(mode: 'single' | 'range' | 'individual') {
		const label = mode === 'single' ? 'Single' : mode === 'range' ? 'Range' : 'Individual days';
		await this.root.getByRole('button', { name: label, exact: true }).click();
	}

	/** Navigate the month grid to `date` and click it. */
	async pickDay(date: string) {
		await pickDayHelper(this.page, date);
	}

	/** Range mode: anchor on `from`, fill to `to`. Optional weekday filter chips (e.g. ['Mon','Wed']). */
	async pickRange(from: string, to: string, weekdays?: string[]) {
		await this.setMode('range');
		if (weekdays) {
			for (const w of weekdays) {
				await this.root.getByRole('button', { name: w, exact: true }).click();
			}
		}
		await pickDayHelper(this.page, from);
		// The second click fills the range; the helper's data-selected wait still
		// holds for the end day, which becomes selected too.
		await pickDayHelper(this.page, to);
	}

	/** Individual-days mode: toggle each date. */
	async pickDays(dates: string[]) {
		await this.setMode('individual');
		for (const d of dates) await pickDayHelper(this.page, d);
	}

	/** The green/amber/red/blocked state the picker gave a day. */
	dayState(date: string) {
		return dayStateHelper(this.page, date);
	}

	async selectedDates(): Promise<string[]> {
		const cells = this.root.locator('[data-testid^="day-"][data-selected="true"]');
		const ids = await cells.evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-testid')!.replace(/^day-/, ''))
		);
		return ids.sort();
	}

	// ---- fields ------------------------------------------------------------

	async setLock(on: boolean) {
		const box = this.page.getByTestId('lock-assignment');
		await expect(box).toBeVisible();
		if (on) await box.check();
		else await box.uncheck();
	}
	async hasLockControl(): Promise<boolean> {
		return this.page
			.getByTestId('lock-assignment')
			.isVisible()
			.catch(() => false);
	}
	async setNote(text: string) {
		await this.page.locator('#ad-note').fill(text);
	}

	// ---- read-outs ---------------------------------------------------------

	requirementStrip(): Locator {
		return this.page.getByTestId('requirement-strip');
	}
	overRequiredWarning(): Locator {
		return this.page.getByTestId('over-required-warning');
	}
	overrideSummary(): Locator {
		return this.page.getByTestId('override-summary');
	}
	blockedDays(): Locator {
		return this.page.getByTestId('blocked-days');
	}
	selectedConflicts(): Locator {
		return this.page.getByTestId('selected-conflicts');
	}

	async expectClean() {
		await expect(this.overrideSummary()).toHaveCount(0);
		await expect(this.blockedDays()).toHaveCount(0);
	}
	async expectWarning(pattern: RegExp) {
		await expect(this.overrideSummary()).toContainText(pattern);
	}
	async expectBlocked(pattern?: RegExp) {
		await expect(this.blockedDays()).toBeVisible();
		if (pattern) await expect(this.blockedDays()).toContainText(pattern);
		await expect(this.submitButton()).toBeDisabled();
	}

	// ---- actions -----------------------------------------------------------

	submitButton(): Locator {
		return this.page.getByRole('button', { name: /^(create|save changes)$/i });
	}

	/**
	 * Submit and answer every override question. `prefer` puts branch labels
	 * first (e.g. /raise the limit/i, /move .* off/i) so a journey chooses a
	 * specific side effect instead of the conservative default. Pass
	 * `accept: false` to assert nothing was asked.
	 */
	async submit(options: { prefer?: RegExp[]; accept?: boolean } = {}) {
		await this.submitButton().click();
		if (options.accept === false) {
			await expect(this.page.getByRole('button', { name: ACCEPT_LABELS[0] })).toHaveCount(0);
			return;
		}
		const labels = [...(options.prefer ?? []), ...ACCEPT_LABELS];
		for (let i = 0; i < 10; i++) {
			let clicked = false;
			for (const label of labels) {
				const button = this.page.getByRole('button', { name: label }).first();
				if (await button.isVisible().catch(() => false)) {
					await button.click();
					await button.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
					clicked = true;
					break;
				}
			}
			if (!clicked) break;
		}
	}

	/** Submit and expect the "N day(s) assigned" confirmation. */
	async submitAndExpectCreated(options: { prefer?: RegExp[] } = {}) {
		await this.submit(options);
		await expect(this.page.getByText(/day\(s\) assigned/i)).toBeVisible({ timeout: 15000 });
	}

	async cancel() {
		await this.page.getByRole('button', { name: 'Cancel' }).first().click();
	}

	/** Edit mode: the Remove button, then the confirm dialog. */
	async remove() {
		await this.page.getByRole('button', { name: /^remove$/i }).click();
		const confirm = this.page
			.getByRole('dialog')
			.last()
			.getByRole('button', {
				name: /^(remove|delete|confirm)/i
			});
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
	}
}
