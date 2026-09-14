import { defineConfig, devices } from '@playwright/test';

const DB = 'DATABASE_PATH=./test-sqlite.db';
const ENV =
	'PUBLIC_BASE_URL=http://localhost:4173 BETTER_AUTH_SECRET=test-secret-key-for-e2e-testing';

const isCI = Boolean(process.env.CI);

/**
 * One project over the browser and server: `journeys`, the phased journeys under
 * `e2e/journeys/phase-*`. Zero retries everywhere: a flake is a bug (e2e plan §0
 * rule 8). (The pre-plan `legacy` project was retired in Phase 8 once every
 * legacy spec was superseded by a richer journey.)
 *
 * Tags (`@smoke`, `@stage1`, `@stage2`, `@tenant`, `@long`) select subsets:
 *   npx playwright test --grep @smoke
 */
export default defineConfig({
	webServer: {
		// Fresh migrated DB → seed demo data + users (real auth, no E2E bypass) → build → preview
		command: `${DB} npx tsx e2e/setup-test-db.ts && ${DB} ${ENV} npx tsx src/lib/db/scripts/seed.ts && ${DB} ${ENV} npm run build && ${DB} ${ENV} npm run preview`,
		port: 4173,
		timeout: 240000,
		// Reuse a locally-running server during iteration; always build fresh in CI.
		reuseExistingServer: !isCI
	},
	globalSetup: './e2e/global-setup.ts',
	testDir: 'e2e/journeys',
	timeout: 60000,
	expect: { timeout: 10000 },
	fullyParallel: false,
	workers: 1,
	reporter: isCI ? [['line'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: 'http://localhost:4173',
		headless: true,
		viewport: { width: 1280, height: 1024 },
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions: {
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--disable-software-rasterizer',
				'--disable-extensions'
			]
		}
	},
	projects: [
		{
			// The phased journeys under `e2e/journeys/phase-*` are the whole suite now
			// (the pre-plan `legacy` project was retired in Phase 8 once every legacy
			// spec was superseded by a richer journey). Zero retries everywhere: a
			// flake is a bug (e2e plan §0 rule 8).
			name: 'journeys',
			testMatch: /phase-\d+\/.*\.spec\.ts$/,
			retries: 0,
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
