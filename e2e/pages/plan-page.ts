/**
 * Page object for the manual planner workspace (`/plan`, L4).
 *
 * The planner stages draft "pins", shows the conflicts they would produce, lets the
 * coordinator accept soft overrides, and commits the committable ones in one action.
 * Its pickers only offer choices that work; a conflicting pin is staged with
 * `{ override: true }` ("Show all options" + the override confirmation).
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

	/**
	 * Pick an option by entity name. Options can carry a note after the name
	 * ("Dr. FM (3 of 5 days)", "Dr. FM — Not available"), so match the name prefix.
	 */
	async pick(testId: string, name: string) {
		const select = this.page.getByTestId(testId);
		await expect
			.poll(
				() =>
					select.evaluate(
						(el, n) =>
							[...(el as HTMLSelectElement).options].find(
								(o) => o.text.trim() === n || o.text.trim().startsWith(`${n} `)
							)?.value ?? null,
						name
					),
				{ message: `${testId} offers ${name}`, timeout: 10000 }
			)
			.not.toBeNull();
		const value = await select.evaluate(
			(el, n) =>
				[...(el as HTMLSelectElement).options].find(
					(o) => o.text.trim() === n || o.text.trim().startsWith(`${n} `)
				)!.value,
			name
		);
		await select.selectOption(value);
	}

	/**
	 * Pick the way a person does: focus the select and move to the option with
	 * the keyboard, so the select keeps focus (selectOption doesn't focus it).
	 */
	async pickByKeyboard(testId: string, name: string) {
		const select = this.page.getByTestId(testId);
		await select.focus();
		const current = () =>
			select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text.trim() ?? '');
		for (let i = 0; i < 20 && !(await current()).startsWith(name); i++) {
			await this.page.keyboard.press('ArrowDown');
		}
		expect(await current(), `${testId} reached ${name}`).toMatch(new RegExp(`^${name}`));
	}

	/** The names a picker currently offers (option text up to any note). */
	async offered(testId: string): Promise<string[]> {
		return this.page
			.getByTestId(testId)
			.evaluate((el) =>
				[...(el as HTMLSelectElement).options]
					.filter((o) => o.value)
					.map((o) => o.text.trim().split(/ — | \(/)[0])
			);
	}

	/** Turn "Show all options" on or off. */
	async showAll(on: boolean) {
		const box = this.page.getByTestId('plan-show-all');
		if ((await box.isChecked()) !== on) await box.setChecked(on);
	}

	/**
	 * Start from a blank form: picks filter each other, so a leftover preceptor or
	 * date from the previous pin could hide the next pin's student or clerkship.
	 */
	private async resetForm() {
		await this.clearDays();
		for (const id of ['plan-student', 'plan-clerkship', 'plan-preceptor', 'plan-site']) {
			const select = this.page.getByTestId(id);
			if ((await select.count()) > 0) await select.selectOption('');
		}
	}

	/** Fill the student/type/clinical pickers shared by single and range adds. */
	private async fillPickers(form: {
		student: string;
		kind?: 'clinical' | 'free_day' | 'exam';
		clerkship?: string;
		preceptor?: string;
		site?: string;
		session?: 'full' | 'am' | 'pm';
	}) {
		const kind = form.kind ?? 'clinical';
		await this.page.getByTestId('plan-kind').selectOption(kind);
		await this.pick('plan-student', form.student);
		if (kind === 'clinical') {
			if (form.clerkship) await this.pick('plan-clerkship', form.clerkship);
			await this.pick('plan-preceptor', form.preceptor!);
			await this.pick('plan-site', form.site!);
			await this.page.getByTestId('plan-session').selectOption(form.session ?? 'full');
		}
	}

	/**
	 * Click Add. With `override`, the choice conflicts: "Show all options" must be on,
	 * and the confirmation is accepted. Without it, the day must be valid as picked.
	 */
	private async submit(override: boolean) {
		const add = this.addButton();
		await expect(add).toBeEnabled({ timeout: 10000 });
		if (override) {
			await expect(add).toHaveText(/override/i);
			await add.click();
			await expect(this.page.getByTestId('plan-override-confirm')).toBeVisible();
			await this.page.getByTestId('plan-override-accept').click();
			await expect(this.page.getByTestId('plan-override-confirm')).toBeHidden();
		} else {
			await expect(add).not.toHaveText(/override/i);
			await add.click();
		}
	}

	/** Stage one pin via the add form (single-date mode). */
	async addPin(form: PinForm, opts: { override?: boolean } = {}) {
		const override = opts.override ?? false;
		await this.resetForm();
		await this.showAll(override);
		await this.fillPickers(form);
		await this.pickDays([form.date]);
		const before = await this.rows().count();
		await this.submit(override);
		await expect(this.rows()).toHaveCount(before + 1, { timeout: 10000 });
		await this.showAll(false);
	}

	/** Stage a range of pins (range mode). `weekdaysOff` toggles weekday chips off
	 * (0=Sun … 6=Sat). Only the days that work are staged; returns how many were. */
	async addRange(
		form: {
			student: string;
			clerkship?: string;
			preceptor?: string;
			site?: string;
			session?: 'full' | 'am' | 'pm';
		},
		from: string,
		to: string,
		weekdaysOff: number[] = []
	): Promise<number> {
		await this.resetForm();
		await this.showAll(false);
		await this.fillPickers({ ...form, kind: 'clinical' });
		await this.pickRange(from, to, weekdaysOff);
		const before = await this.rows().count();
		await expect(this.addButton()).toBeEnabled({ timeout: 10000 });
		const label = (await this.addButton().textContent()) ?? '';
		const want = parseInt(label.match(/Add (\d+) days/)?.[1] ?? '1', 10);
		await this.submit(false);
		await expect(this.rows()).toHaveCount(before + want, { timeout: 10000 });
		return want;
	}

	/** The "N day(s) selected" count shown in range mode. */
	async daysSelected(): Promise<number> {
		const text = (await this.page.getByTestId('plan-dates-count').textContent()) ?? '0';
		return parseInt(text, 10) || 0;
	}

	// ---- the availability-aware date picker -------------------------------

	private picker(): Locator {
		return this.page.getByTestId('plan-dates');
	}

	/** Show the month holding `date` in the picker. */
	async showMonth(date: string) {
		const target = date.slice(0, 7);
		const label = this.picker().getByTestId('picker-month');
		for (let i = 0; i < 24; i++) {
			const shown = (await label.getAttribute('data-month')) ?? '';
			if (shown === target) return;
			await this.picker()
				.getByTestId(shown < target ? 'picker-next' : 'picker-prev')
				.click();
		}
		throw new Error(`picker never reached ${target}`);
	}

	/** A day cell in the picker (switches to its month). */
	async day(date: string): Promise<Locator> {
		await this.showMonth(date);
		return this.picker().getByTestId(`day-${date}`);
	}

	async clearDays() {
		const clear = this.page.getByTestId('plan-dates-clear');
		if (await clear.isVisible().catch(() => false)) await clear.click();
		await expect(this.page.getByTestId('plan-dates-count')).toHaveText(/^0 day/);
	}

	/** Pick exactly these days (Individual days mode). */
	async pickDays(dates: string[]) {
		await this.clearDays();
		await this.picker().getByTestId('picker-mode-individual').click();
		for (const date of dates) await (await this.day(date)).click();
	}

	/** Pick a range (Range mode), Mon–Fri unless `weekdaysOff` (0=Sun … 6=Sat) drops some. */
	async pickRange(from: string, to: string, weekdaysOff: number[] = []) {
		await this.clearDays();
		await this.picker().getByTestId('picker-mode-range').click();
		for (const v of [0, 1, 2, 3, 4, 5, 6]) {
			const chip = this.picker().getByTestId(`picker-weekday-${v}`);
			const want = v >= 1 && v <= 5 && !weekdaysOff.includes(v);
			if ((await chip.getAttribute('aria-pressed')) !== String(want)) await chip.click();
		}
		await (await this.day(from)).click();
		await (await this.day(to)).click();
	}

	/** Whether a day is currently picked. */
	async isPicked(date: string): Promise<boolean> {
		return (await (await this.day(date)).getAttribute('data-selected')) === 'true';
	}

	addButton(): Locator {
		return this.page.getByTestId('plan-add');
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

	/** Accept a soft code without asserting the pin flips to OK (other codes may remain). */
	async acceptCodeOnly(pinId: string, code: string) {
		await this.page.getByTestId(`plan-pin-accept-${pinId}-${code}`).click();
	}

	async resetOverrides(pinId: string) {
		await this.page.getByTestId(`plan-pin-reset-${pinId}`).click();
	}

	/** The "Overridden" badge on a pin added despite a conflict. */
	overridden(pinId: string): Locator {
		return this.page.getByTestId(`plan-pin-overridden-${pinId}`);
	}

	calendar(): Locator {
		return this.page.getByTestId('plan-calendar');
	}

	calendarPin(pinId: string): Locator {
		return this.page.getByTestId(`plan-cal-pin-${pinId}`);
	}

	async removePin(pinId: string) {
		const before = await this.rows().count();
		await this.page.getByTestId(`plan-pin-remove-${pinId}`).click();
		await expect(this.rows()).toHaveCount(before - 1, { timeout: 10000 });
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
