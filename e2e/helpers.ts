/**
 * E2E Test Helpers
 * Utility functions for E2E tests
 */

import type { Page } from '@playwright/test';

/**
 * Navigate to a page and wait for it to be fully loaded
 * This prevents flaky tests caused by premature interactions
 */
export async function gotoAndWait(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
	// Additional small delay for SvelteKit hydration
	await page.waitForTimeout(100);
}

/**
 * Wait for an element to be visible with custom timeout
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000) {
	await page.waitForSelector(selector, { state: 'visible', timeout });
}
