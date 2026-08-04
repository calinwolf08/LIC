import { expect, type Page } from '@playwright/test';

/**
 * Helpers for driving the unified assignment dialog (step 18) from journeys.
 *
 * Every entry point — student page, calendar, preceptor page — renders the same
 * component, so these work everywhere; only which fields are pre-filled differs.
 */

export { SEED_SCHEDULE, fromToday, today, monthStart, monthEnd } from './helpers';

/** Open "Add assignment" and wait for the dialog to be interactive. */
export async function openAssignmentDialog(page: Page) {
	await page.getByRole('button', { name: 'Add assignment' }).first().click();
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toBeVisible();
	await expect(page.getByTestId('assignment-day-grid')).toBeVisible({ timeout: 20000 });
}

/** Wait until a named option shows up in one of the dialog's cascading selects. */
export async function waitForOption(page: Page, selectId: string, label: string) {
	await expect(page.locator(`#${selectId} option`, { hasText: label })).toHaveCount(1, {
		timeout: 20000
	});
}

export async function selectClerkship(page: Page, label: string) {
	await waitForOption(page, 'ad-clerkship', label);
	await page.locator('#ad-clerkship').selectOption({ label });
}

export async function selectPreceptor(page: Page, label: string) {
	await waitForOption(page, 'ad-preceptor', label);
	await page.locator('#ad-preceptor').selectOption({ label });
}

export async function selectSite(page: Page, label: string) {
	await waitForOption(page, 'ad-site', label);
	await page.locator('#ad-site').selectOption({ label });
}

export async function selectStudent(page: Page, label: string) {
	await waitForOption(page, 'ad-student', label);
	await page.locator('#ad-student').selectOption({ label });
}

/**
 * Page the month grid to the month containing `date` and click that day.
 * The grid only renders one month at a time, so navigation is part of picking.
 */
export async function pickDay(page: Page, date: string) {
	const wanted = date.slice(0, 7);
	// Scope to the dialog: the calendar page has its own "Next Month →" control,
	// which would otherwise make these lookups ambiguous.
	const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('assignment-day-grid') });
	const cell = dialog.getByTestId(`day-${date}`);

	for (let i = 0; i < 24; i++) {
		if (await cell.isVisible().catch(() => false)) break;
		const monthLabel = dialog.getByTestId('picker-month');
		const shown = (await monthLabel.textContent()) ?? '';
		const shownMonth = monthKeyFromLabel(shown);
		const button = shownMonth < wanted ? 'Next month' : 'Previous month';
		await dialog.getByRole('button', { name: button, exact: true }).click();
		// The grid re-renders when the label changes — wait for that, not a timer.
		await expect(monthLabel).not.toHaveText(shown.trim(), { timeout: 5000 });
	}

	await expect(cell).toBeVisible({ timeout: 10000 });
	await cell.click();
	await expect(cell).toHaveAttribute('data-selected', 'true');
}

function monthKeyFromLabel(label: string): string {
	const parsed = new Date(`${label.trim()} 1 UTC`);
	if (Number.isNaN(parsed.getTime())) return '';
	return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Every button that accepts an override conversation, in the order the helper
 * prefers them. The capacity question asks a follow-up, and "Just this
 * exception" is the conservative answer for a generic helper.
 */
const ACCEPT_LABELS: RegExp[] = [
	/^assign anyway$/i,
	/assign and mark available/i,
	/double-book this day/i,
	/just this exception/i
];

/**
 * Submit the dialog, accepting every override conversation it raises.
 *
 * `prefer` puts extra button labels first, so a journey can choose a specific
 * branch ("Move the other student off", "Raise the limit") instead of the
 * default.
 */
export async function submitAcceptingOverrides(
	page: Page,
	options: { submitLabel?: RegExp; prefer?: RegExp[] } = {}
) {
	await page.getByRole('button', { name: options.submitLabel ?? /^create$/i }).click();

	const labels = [...(options.prefer ?? []), ...ACCEPT_LABELS];
	// Each answered question closes one ConfirmDialog; keep going until none is left.
	for (let i = 0; i < 10; i++) {
		let clicked = false;
		for (const label of labels) {
			const button = page.getByRole('button', { name: label }).first();
			if (await button.isVisible().catch(() => false)) {
				await button.click();
				// Wait for this question to close before scanning for the next one,
				// rather than guessing with a fixed delay.
				await button.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
				clicked = true;
				break;
			}
		}
		if (!clicked) break;
	}
}

/** The green/amber/red state the picker gave a day. */
export async function dayState(page: Page, date: string): Promise<string | null> {
	return page.getByTestId(`day-${date}`).getAttribute('data-state');
}
