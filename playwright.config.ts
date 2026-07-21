import { defineConfig, devices } from '@playwright/test';

const DB = 'DATABASE_PATH=./test-sqlite.db';
const ENV =
	'PUBLIC_BASE_URL=http://localhost:4173 BETTER_AUTH_SECRET=test-secret-key-for-e2e-testing';

export default defineConfig({
	webServer: {
		// Fresh migrated DB → seed demo data + users (real auth, no E2E bypass) → build → preview
		command: `${DB} npx tsx e2e/setup-test-db.ts && ${DB} ${ENV} npx tsx src/lib/db/scripts/seed.ts && ${DB} ${ENV} npm run build && ${DB} ${ENV} npm run preview`,
		port: 4173,
		timeout: 240000,
		// Reuse a locally-running server during iteration; always build fresh in CI.
		reuseExistingServer: !process.env.CI
	},
	testDir: 'e2e/journeys',
	timeout: 60000,
	expect: { timeout: 10000 },
	fullyParallel: false,
	workers: 1,
	retries: 1,
	use: {
		baseURL: 'http://localhost:4173',
		headless: true,
		viewport: { width: 1280, height: 1024 },
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
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
