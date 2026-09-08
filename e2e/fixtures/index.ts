/**
 * The journey test object. Import `test` and `expect` from here instead of
 * `@playwright/test` to get:
 *
 *   asAdmin / asBasic          — a Page already signed in as the seeded users
 *                                (login happens once per worker; the storage
 *                                state is reused, so a journey pays nothing).
 *   asFreshUser                — a Page for a brand-new account registered
 *                                through the real form (+ its credentials).
 *   asFreshEntitledUser        — the same, then granted `autogen`.
 *   db                         — a Kysely handle on the e2e SQLite file.
 *   sandbox                    — a factory for throwaway schedules that are
 *                                restored/deleted at the end of the test.
 *
 * Plus the plain helpers (`login`, `ADMIN`, `fromToday`, …) re-exported so a
 * spec has one import line.
 */

import {
	test as base,
	type Browser,
	type Page,
	type BrowserContextOptions
} from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';
import { ADMIN, BASIC, loginViaForm, registerViaForm, type Credentials } from './users';
import { openTestDb, grantAutogen } from './db';
import { SandboxFactory } from './sandbox';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
export * from './users';
export * from './api';
export * from './db';
export * from './sandbox';
export {
	TEST_SCHEDULE as SEED_SCHEDULE,
	fromToday,
	today,
	monthStart,
	monthEnd
} from '../../src/lib/db/scripts/seed-schedule';

/** Back-compat alias for the existing specs' `login(page, ADMIN)`. */
export const login = loginViaForm;
export const registerNewUser = async (page: Page): Promise<string> =>
	(await registerViaForm(page)).email;

export interface FreshUser {
	page: Page;
	user: Credentials & { name: string };
}

type WorkerFixtures = {
	adminState: string;
	basicState: string;
	db: Kysely<DB>;
};

type TestFixtures = {
	asAdmin: Page;
	asBasic: Page;
	asFreshUser: FreshUser;
	asFreshEntitledUser: FreshUser;
	sandbox: SandboxFactory;
};

const AUTH_DIR = join(process.cwd(), 'e2e', '.auth');

/** Log a seeded user in once per worker and persist the cookies to disk. */
async function makeStorageState(
	browser: Browser,
	options: BrowserContextOptions,
	user: Credentials,
	file: string
): Promise<string> {
	mkdirSync(AUTH_DIR, { recursive: true });
	const ctx = await browser.newContext(options);
	const page = await ctx.newPage();
	await loginViaForm(page, user);
	await ctx.storageState({ path: file });
	await ctx.close();
	return file;
}

function contextOptionsFor(projectUse: Record<string, unknown>): BrowserContextOptions {
	// Only the context-level options; launch-level ones (headless, args) would
	// be rejected by newContext.
	const { baseURL, viewport, locale, timezoneId, colorScheme } =
		projectUse as BrowserContextOptions;
	return { baseURL, viewport, locale, timezoneId, colorScheme };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
	adminState: [
		async ({ browser }, use, workerInfo) => {
			const file = join(AUTH_DIR, `admin-w${workerInfo.workerIndex}.json`);
			await use(
				await makeStorageState(browser, contextOptionsFor(workerInfo.project.use), ADMIN, file)
			);
		},
		{ scope: 'worker' }
	],
	basicState: [
		async ({ browser }, use, workerInfo) => {
			const file = join(AUTH_DIR, `basic-w${workerInfo.workerIndex}.json`);
			await use(
				await makeStorageState(browser, contextOptionsFor(workerInfo.project.use), BASIC, file)
			);
		},
		{ scope: 'worker' }
	],
	db: [
		async ({}, use) => {
			const handle = openTestDb();
			await use(handle);
			await handle.destroy();
		},
		{ scope: 'worker' }
	],

	asAdmin: async ({ browser, contextOptions, adminState }, use) => {
		const ctx = await browser.newContext({ ...contextOptions, storageState: adminState });
		const page = await ctx.newPage();
		await use(page);
		await ctx.close();
	},
	asBasic: async ({ browser, contextOptions, basicState }, use) => {
		const ctx = await browser.newContext({ ...contextOptions, storageState: basicState });
		const page = await ctx.newPage();
		await use(page);
		await ctx.close();
	},
	asFreshUser: async ({ browser, contextOptions }, use) => {
		const ctx = await browser.newContext(contextOptions);
		const page = await ctx.newPage();
		const user = await registerViaForm(page);
		await use({ page, user });
		await ctx.close();
	},
	asFreshEntitledUser: async ({ browser, contextOptions, db }, use) => {
		const ctx = await browser.newContext(contextOptions);
		const page = await ctx.newPage();
		const user = await registerViaForm(page);
		await grantAutogen(db, user.email);
		// The hook resolves entitlements per request, so a reload is enough.
		await page.reload();
		await use({ page, user });
		await ctx.close();
	},
	sandbox: async ({}, use) => {
		const factory = new SandboxFactory();
		await use(factory);
		await factory.restoreAll();
	}
});
