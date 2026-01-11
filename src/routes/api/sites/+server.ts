import { siteService, SiteService } from '$lib/features/sites/services/site-service';
import { createSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError, handleApiError } from '$lib/api/errors';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { autoAssociateWithActiveSchedule, getActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { db } from '$lib/db';
import type { RequestHandler } from './$types';

const log = createServerLogger('api:sites');

/**
 * GET /api/sites
 * Get sites for user's active schedule, optionally filtered by health system
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const healthSystemId = url.searchParams.get('health_system_id');

	log.debug('Fetching sites for user schedule', { healthSystemId: healthSystemId || 'all' });

	try {
		const userId = locals.session?.user?.id;
		if (!userId) {
			log.warn('No user session found');
			return errorResponse('Authentication required', 401);
		}

		const scheduleId = await getActiveScheduleId(userId);
		if (!scheduleId) {
			log.warn('No active schedule for user', { userId });
			return errorResponse('No active schedule. Please create or select a schedule first.', 400);
		}

		// Get sites filtered by schedule
		const service = new SiteService(db);
		let sites = await service.getSitesBySchedule(scheduleId);

		// Additional filter by health system if provided
		if (healthSystemId) {
			sites = sites.filter(s => s.health_system_id === healthSystemId);
		}

		log.info('Sites fetched', {
			count: sites.length,
			scheduleId,
			healthSystemId: healthSystemId || 'all'
		});

		return successResponse(sites);
	} catch (error) {
		log.error('Failed to fetch sites', { healthSystemId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/sites
 * Create a new site and auto-associate with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating site');

	try {
		const body = await request.json();
		const input = createSiteSchema.parse(body);

		const site = await siteService.createSite(input);

		// Auto-associate with user's active schedule
		if (site.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'site', site.id);
		}

		log.info('Site created', {
			id: site.id,
			name: site.name,
			healthSystemId: site.health_system_id
		});

		return successResponse(site, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Site validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Site conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		if (error instanceof NotFoundError) {
			log.warn('Health system not found', { message: error.message });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to create site', { error });
		return handleApiError(error);
	}
};
