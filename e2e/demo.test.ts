import { expect, test } from '@playwright/test';
import { gotoAndWait } from './helpers';

test('home page has expected h1', async ({ page }) => {
	await gotoAndWait(page, '/');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
