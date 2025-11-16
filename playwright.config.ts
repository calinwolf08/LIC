import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'E2E_TESTING=true npm run build && E2E_TESTING=true npm run preview',
		port: 4173,
		timeout: 180000, // 3 minutes for build + server start
		reuseExistingServer: false
	},
	testDir: 'e2e',
	timeout: 30000, // 30 seconds per test
	use: {
		baseURL: 'http://localhost:4173',
		headless: true,
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
