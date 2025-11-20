import { json } from '@sveltejs/kit';
import { siteService } from '$lib/features/sites/services/site-service';
import { updateSiteSchema, siteIdSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError } from '$lib/errors';
import type { RequestHandler } from './$types';

/**
 * GET /api/sites/[id]
 * Get a single site by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		const site = await siteService.getSiteById(id);

		return json({ data: site });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Invalid site ID' }, { status: 400 });
		}

		if (error instanceof NotFoundError) {
			return json({ error: error.message }, { status: 404 });
		}

		console.error('Error fetching site:', error);
		return json({ error: 'Failed to fetch site' }, { status: 500 });
	}
};

/**
 * PATCH /api/sites/[id]
 * Update a site
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		const body = await request.json();
		const input = updateSiteSchema.parse(body);

		const site = await siteService.updateSite(id, input);

		return json({ data: site });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Validation failed', details: error.errors }, { status: 400 });
		}

		if (error instanceof NotFoundError) {
			return json({ error: error.message }, { status: 404 });
		}

		if (error instanceof ConflictError) {
			return json({ error: error.message }, { status: 409 });
		}

		console.error('Error updating site:', error);
		return json({ error: 'Failed to update site' }, { status: 500 });
	}
};

/**
 * DELETE /api/sites/[id]
 * Delete a site
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		await siteService.deleteSite(id);

		return json({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ error: 'Invalid site ID' }, { status: 400 });
		}

		if (error instanceof NotFoundError) {
			return json({ error: error.message }, { status: 404 });
		}

		if (error instanceof ConflictError) {
			return json({ error: error.message }, { status: 409 });
		}

		console.error('Error deleting site:', error);
		return json({ error: 'Failed to delete site' }, { status: 500 });
	}
};
