import { json } from '@sveltejs/kit';
import { siteService } from '$lib/features/sites/services/site-service';
import { clerkshipSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import type { RequestHandler } from './$types';

/**
 * GET /api/clerkship-sites
 * Get all clerkship-site associations or filter by clerkship_id or site_id
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkship_id');
		const siteId = url.searchParams.get('site_id');

		if (clerkshipId) {
			const sites = await siteService.getSitesByClerkship(clerkshipId);
			return json({ data: sites });
		}

		if (siteId) {
			const clerkships = await siteService.getClerkshipsBySite(siteId);
			return json({ data: clerkships });
		}

		return json({ error: 'Either clerkship_id or site_id parameter is required' }, { status: 400 });
	} catch (error) {
		console.error('Error fetching clerkship-site associations:', error);
		return json({ error: 'Failed to fetch associations' }, { status: 500 });
	}
};

/**
 * POST /api/clerkship-sites
 * Add a clerkship-site association
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { clerkship_id, site_id } = clerkshipSiteSchema.parse(body);

		const association = await siteService.addClerkshipToSite(site_id, clerkship_id);

		return json({ data: association }, { status: 201 });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Validation failed', details: error.errors }, { status: 400 });
		}

		console.error('Error creating clerkship-site association:', error);
		return json({ error: 'Failed to create association' }, { status: 500 });
	}
};

/**
 * DELETE /api/clerkship-sites
 * Remove a clerkship-site association
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { clerkship_id, site_id } = clerkshipSiteSchema.parse(body);

		await siteService.removeClerkshipFromSite(site_id, clerkship_id);

		return json({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Validation failed', details: error.errors }, { status: 400 });
		}

		console.error('Error removing clerkship-site association:', error);
		return json({ error: 'Failed to remove association' }, { status: 500 });
	}
};
