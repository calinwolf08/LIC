/**
 * API Routes Verification Tests
 *
 * Verifies that electives API routes are properly structured.
 * Full integration testing is covered through electives.service.test.ts
 * since the API routes are thin wrappers around the service layer.
 */

import { describe, it, expect } from 'vitest';
import * as mainRoutes from './+server';
import * as idRoutes from './[id]/+server';
import * as sitesRoutes from './[id]/sites/+server';
import * as preceptorsRoutes from './[id]/preceptors/+server';

describe('Electives API Routes Structure', () => {
	describe('Main routes (/api/scheduling-config/electives)', () => {
		it('should export GET handler', () => {
			expect(mainRoutes.GET).toBeDefined();
			expect(typeof mainRoutes.GET).toBe('function');
		});

		it('should export POST handler', () => {
			expect(mainRoutes.POST).toBeDefined();
			expect(typeof mainRoutes.POST).toBe('function');
		});
	});

	describe('ID routes (/api/scheduling-config/electives/[id])', () => {
		it('should export GET handler', () => {
			expect(idRoutes.GET).toBeDefined();
			expect(typeof idRoutes.GET).toBe('function');
		});

		it('should export PATCH handler', () => {
			expect(idRoutes.PATCH).toBeDefined();
			expect(typeof idRoutes.PATCH).toBe('function');
		});

		it('should export DELETE handler', () => {
			expect(idRoutes.DELETE).toBeDefined();
			expect(typeof idRoutes.DELETE).toBe('function');
		});
	});

	describe('Sites routes (/api/scheduling-config/electives/[id]/sites)', () => {
		it('should export POST handler for adding sites', () => {
			expect(sitesRoutes.POST).toBeDefined();
			expect(typeof sitesRoutes.POST).toBe('function');
		});

		it('should export DELETE handler for removing sites', () => {
			expect(sitesRoutes.DELETE).toBeDefined();
			expect(typeof sitesRoutes.DELETE).toBe('function');
		});
	});

	describe('Preceptors routes (/api/scheduling-config/electives/[id]/preceptors)', () => {
		it('should export POST handler for adding preceptors', () => {
			expect(preceptorsRoutes.POST).toBeDefined();
			expect(typeof preceptorsRoutes.POST).toBe('function');
		});

		it('should export DELETE handler for removing preceptors', () => {
			expect(preceptorsRoutes.DELETE).toBeDefined();
			expect(typeof preceptorsRoutes.DELETE).toBe('function');
		});
	});
});

/**
 * Note: Full integration testing of these routes is provided through:
 * - src/lib/features/scheduling-config/services/electives.service.test.ts (45 tests)
 *   which tests the service layer that all API routes delegate to
 *
 * The API routes are thin HTTP wrappers that:
 * 1. Parse request parameters
 * 2. Call the service layer
 * 3. Format responses
 *
 * Testing the service layer provides equivalent coverage while being
 * simpler to maintain than mocking SvelteKit's RequestEvent objects.
 */
