import { json } from '@sveltejs/kit';
import { siteService } from '$lib/features/sites/services/site-service';
import { createSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError } from '$lib/api/errors';
import type { RequestHandler } from './$types';

/**
 * GET /api/sites
 * Get all sites or filter by health system
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const healthSystemId = url.searchParams.get('health_system_id');

		const sites = healthSystemId
			? await siteService.getSitesByHealthSystem(healthSystemId)
			: await siteService.getAllSites();

		return json({ data: sites });
	} catch (error) {
		console.error('Error fetching sites:', error);
		return json({ error: 'Failed to fetch sites' }, { status: 500 });
	}
};

/**
 * POST /api/sites
 * Create a new site
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const input = createSiteSchema.parse(body);

		const site = await siteService.createSite(input);

		return json({ data: site }, { status: 201 });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Validation failed', details: error.errors }, { status: 400 });
		}

		if (error instanceof ConflictError) {
			return json({ error: error.message }, { status: 409 });
		}

		if (error instanceof NotFoundError) {
			return json({ error: error.message }, { status: 404 });
		}

		console.error('Error creating site:', error);
		return json({ error: 'Failed to create site' }, { status: 500 });
	}
};
