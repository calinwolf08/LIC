import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
			exclude: [
				'**/*.config.*',
				'**/node_modules/**',
				'**/*.test.ts',
				'**/*.spec.ts',
				'**/types/**',
				'**/.svelte-kit/**',
				'**/build/**'
			],
			// Regression floors on the scheduling algorithm paths (Phase 8 §2). These
			// lock in the coverage the unit/integration suite achieves today so it
			// cannot silently erode; they are deliberately set a few points below the
			// current numbers for headroom. The plan's aspirational 95/90/95 target is
			// not yet met by the instrumented suite alone — several files here are
			// exercised only through the e2e journeys (e.g. export-service) and so read
			// as uncovered in a unit-coverage run; closing that gap is a follow-up (see
			// e2e-phase-8-findings.md). Glob-scoped so only these paths are gated.
			thresholds: {
				'src/lib/features/scheduling/**': { lines: 78, functions: 85, branches: 76 },
				'src/lib/features/scheduling/services/**': { lines: 85, functions: 90, branches: 80 }
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					environment: 'browser',
					browser: {
						enabled: true,
						provider: 'playwright',
						instances: [{ browser: 'chromium' }],
						headless: true
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
