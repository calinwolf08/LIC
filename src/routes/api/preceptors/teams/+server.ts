/**
 * Teams API - Collection Endpoints
 *
 * GET /api/preceptors/teams - List teams (optionally filtered by clerkship)
 * POST /api/preceptors/teams - Create new team
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { TeamService } from '$lib/features/scheduling-config/services/teams.service';
import { preceptorTeamInputSchema } from '$lib/features/scheduling-config/schemas/teams.schemas';
import { autoAssociateWithActiveSchedule, getActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError, z } from 'zod';

const log = createServerLogger('api:preceptors:teams');
const service = new TeamService(db);

/**
 * GET /api/preceptors/teams
 * Returns teams for user's active schedule, optionally filtered by clerkship
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');

	log.debug('Fetching teams for user schedule', { clerkshipId: clerkshipId || 'all' });

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

		// Get teams by schedule (includes all related data)
		const result = await service.getAllTeamsBySchedule(scheduleId);

		if (!result.success) {
			log.warn('Failed to fetch teams', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		// Apply additional clerkship filter if provided
		let teams = result.data;
		if (clerkshipId) {
			teams = teams.filter(t => t.clerkshipId === clerkshipId);
		}

		log.info('Teams fetched', {
			count: teams.length,
			scheduleId,
			clerkshipFiltered: !!clerkshipId
		});

		return successResponse(teams);
	} catch (error) {
		log.error('Failed to fetch teams', { clerkshipId, error });
		return handleApiError(error);
	}
};

// Schema for POST body with clerkshipId and siteIds
// Note: We manually define fields instead of spreading preceptorTeamInputSchema.shape
// because the schema has .refine() which converts it to ZodEffects
const createTeamBodySchema = z.object({
	clerkshipId: z.string().min(1, 'clerkshipId is required'),
	siteIds: z.array(z.string()).optional().default([]),
	name: z.string().optional(),
	requireSameHealthSystem: z.boolean().default(false),
	requireSameSite: z.boolean().default(false),
	requireSameSpecialty: z.boolean().default(false),
	requiresAdminApproval: z.boolean().default(false),
	members: z.array(z.object({
		preceptorId: z.string().min(1, 'Preceptor ID is required'),
		role: z.string().optional(),
		priority: z.number().int().min(1, 'Priority must be at least 1'),
		isFallbackOnly: z.boolean().optional().default(false),
	})).min(1, 'Team must have at least 1 member'),
});

/**
 * POST /api/preceptors/teams
 * Creates a new team and auto-associates with user's active schedule
 * Accepts clerkshipId and siteIds in the request body
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
	log.debug('Creating team');

	try {
		const body = await request.json();

		// Support both query param (legacy) and body (new)
		let clerkshipId = url.searchParams.get('clerkshipId');
		let siteIds: string[] = [];

		if (body.clerkshipId) {
			clerkshipId = body.clerkshipId;
		}
		if (body.siteIds) {
			siteIds = body.siteIds;
		}

		if (!clerkshipId) {
			log.warn('Missing clerkshipId for team creation');
			return errorResponse('clerkshipId is required (in body or query param)', 400);
		}

		const validatedData = preceptorTeamInputSchema.parse(body);

		log.debug('Creating team with sites', {
			clerkshipId,
			memberCount: validatedData.members.length,
			siteCount: siteIds.length
		});

		// Use createTeamWithSites to handle site associations
		const result = await service.createTeamWithSites(clerkshipId, validatedData, siteIds);

		if (!result.success) {
			log.warn('Team creation failed', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		// Auto-associate with user's active schedule
		if (result.data.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'team', result.data.id);
		}

		log.info('Team created', {
			teamId: result.data.id,
			name: result.data.name,
			clerkshipId,
			memberCount: validatedData.members.length,
			siteCount: siteIds.length
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Team validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create team', { error });
		return handleApiError(error);
	}
};
