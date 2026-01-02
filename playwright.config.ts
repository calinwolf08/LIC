import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	webServer: {
		command: 'DATABASE_PATH=./test-sqlite.db E2E_TESTING=true npm run build && DATABASE_PATH=./test-sqlite.db E2E_TESTING=true npm run preview',
		port: 4173,
		timeout: 180000, // 3 minutes for build + server start
		reuseExistingServer: false
	},
	testDir: 'e2e',
	timeout: 60000, // 60 seconds per test (increased from 30)
	fullyParallel: false, // Run tests sequentially to avoid resource exhaustion
	workers: 1, // Single worker to prevent browser crashes
	retries: 1, // Retry failed tests once
	use: {
		baseURL: 'http://localhost:4173',
		headless: true,
		viewport: { width: 1280, height: 1024 }, // Taller viewport for modal dialogs
		launchOptions: {
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--disable-software-rasterizer',
				'--disable-extensions',
				'--single-process'
			]
		}
	}
});
