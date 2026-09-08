/**
 * Shared helpers for the Phase 2 entity-management journeys.
 *
 * The list pages open their create/edit flows through client-side dialogs whose
 * button handlers only exist after hydration. A click that lands in the gap
 * between first paint and hydration is silently lost, the dialog never opens,
 * and a later `.fill` waits until the test times out. `openDialog` absorbs that
 * race by re-clicking until the dialog is actually on screen — the app has no
 * per-button hydration signal to wait on, unlike its forms.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Click a control by accessible name and wait for a dialog to appear, retrying
 * the click a few times to ride out the hydration race. Returns the dialog.
 */
export async function openDialog(
	page: Page,
	buttonName: RegExp | string,
	opts: { dialog?: Locator; button?: Locator } = {}
): Promise<Locator> {
	const dialog = opts.dialog ?? page.getByRole('dialog');
	const button = opts.button ?? page.getByRole('button', { name: buttonName }).first();
	await expect(button).toBeVisible({ timeout: 15000 });
	for (let attempt = 0; attempt < 5; attempt++) {
		// Short per-click timeout: once the dialog opens the trigger is covered by
		// the overlay and would otherwise hang waiting for actionability.
		await button.click({ timeout: 2500 }).catch(() => {});
		if (
			await dialog
				.first()
				.isVisible()
				.catch(() => false)
		) {
			return dialog.first();
		}
		await page.waitForTimeout(400);
	}
	await expect(dialog.first()).toBeVisible({ timeout: 5000 });
	return dialog.first();
}

/**
 * Open a custom overlay modal (see `customModal`) from a specific trigger
 * button (e.g. a table row's Delete), riding out the hydration race.
 */
export async function openCustomModal(
	page: Page,
	button: Locator,
	heading: RegExp | string
): Promise<Locator> {
	return openDialog(page, heading, { button, dialog: customModal(page, heading) });
}

/**
 * Click a control that navigates and wait for the URL, retrying the click to
 * ride out the hydration race on list pages whose row/name handlers attach a
 * beat after first paint.
 */
export async function clickToNavigate(
	page: Page,
	target: Locator,
	urlPattern: RegExp
): Promise<void> {
	await expect(target).toBeVisible({ timeout: 15000 });
	for (let attempt = 0; attempt < 5; attempt++) {
		await target.click({ timeout: 2500 }).catch(() => {});
		try {
			await page.waitForURL(urlPattern, { timeout: 2500 });
			return;
		} catch {
			/* retry */
		}
	}
	await expect(page).toHaveURL(urlPattern, { timeout: 5000 });
}

/**
 * Wait for a page to be interactive before the first click: SvelteKit marks the
 * document ready once hydrated. A short settle avoids the lost-click race on
 * pages whose controls have no explicit hydration marker.
 */
export async function waitInteractive(page: Page): Promise<void> {
	await page.waitForLoadState('domcontentloaded');
	await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Several entity delete dialogs (site, preceptor, student, clerkship, elective)
 * are custom fixed-overlay modals rather than the shadcn `role="dialog"`, and
 * some pre-check dependencies to disable their confirm button. This scopes to
 * the overlay by its heading so the confirm/message can be asserted without
 * colliding with the row's own Delete button.
 */
export function customModal(page: Page, heading: RegExp | string): Locator {
	// Match any fixed-position overlay that contains the heading — some dialogs
	// put content in `.fixed.inset-0`, others in a separate centered `.fixed`
	// panel beside an inset backdrop.
	return page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: heading }) });
}
