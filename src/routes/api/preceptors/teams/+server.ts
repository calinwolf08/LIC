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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError, z } from 'zod';

const log = createServerLogger('api:preceptors:teams');
const service = new TeamService(db);

/**
 * GET /api/preceptors/teams
 * Returns all teams, or filtered by clerkship if clerkshipId provided
 */
export const GET: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');

	log.debug('Fetching teams', { clerkshipId: clerkshipId || 'all' });

	try {
		// Use getAllTeams which supports optional filtering
		const result = await service.getAllTeams(clerkshipId || undefined);

		if (!result.success) {
			log.warn('Failed to fetch teams', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Teams fetched', {
			count: result.data.length,
			filtered: !!clerkshipId
		});

		return successResponse(result.data);
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
 * Creates a new team
 * Accepts clerkshipId and siteIds in the request body
 */
export const POST: RequestHandler = async ({ request, url }) => {
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
