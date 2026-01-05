/**
 * Team API - Individual Team Endpoints
 *
 * GET /api/preceptors/teams/[id] - Get team
 * PATCH /api/preceptors/teams/[id] - Update team
 * DELETE /api/preceptors/teams/[id] - Delete team
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, handleApiError, validationErrorResponse, notFoundResponse } from '$lib/api';
import { TeamService } from '$lib/features/scheduling-config/services/teams.service';
import { preceptorTeamInputSchema } from '$lib/features/scheduling-config/schemas/teams.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError, z } from 'zod';

const log = createServerLogger('api:preceptors:teams:id');
const service = new TeamService(db);

/**
 * GET /api/preceptors/teams/[id]
 * Get a single team with members and sites
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching team', { teamId: params.id });

	try {
		const result = await service.getTeam(params.id);

		if (!result.success) {
			log.warn('Failed to fetch team', { teamId: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		if (!result.data) {
			log.warn('Team not found', { teamId: params.id });
			return notFoundResponse('Team');
		}

		// Get sites for this team
		const siteIds = await service.getTeamSites(params.id);

		// Get site details
		const sites = siteIds.length > 0
			? await db
					.selectFrom('sites')
					.select(['id', 'name'])
					.where('id', 'in', siteIds)
					.execute()
			: [];

		log.info('Team fetched', {
			teamId: params.id,
			name: result.data.name,
			memberCount: result.data.members?.length || 0,
			siteCount: sites.length
		});

		return successResponse({
			...result.data,
			sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
		});
	} catch (error) {
		log.error('Failed to fetch team', { teamId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/preceptors/teams/[id]
 * Update an existing team
 * Accepts siteIds in the request body
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating team', { teamId: params.id });

	try {
		const body = await request.json();

		// Extract siteIds if provided
		const siteIds: string[] | undefined = body.siteIds;

		// Validate members if provided
		if (body.members) {
			// If members are included, validate the full schema
			const validatedData = preceptorTeamInputSchema.parse(body);
			const result = await service.updateTeamWithSites(params.id, validatedData, siteIds);

			if (!result.success) {
				log.warn('Failed to update team', { teamId: params.id, error: result.error.message });
				return errorResponse(result.error.message, 400);
			}

			log.info('Team updated (with members)', {
				teamId: params.id,
				name: result.data.name,
				memberCount: validatedData.members.length,
				siteCount: siteIds?.length || 0
			});

			return successResponse(result.data);
		} else {
			// If no members, only validate the team properties
			const teamPropsSchema = z.object({
				name: z.string().optional(),
				requireSameHealthSystem: z.boolean().optional(),
				requireSameSite: z.boolean().optional(),
				requireSameSpecialty: z.boolean().optional(),
				requiresAdminApproval: z.boolean().optional(),
			});

			const validatedData = teamPropsSchema.parse(body);
			const result = await service.updateTeamWithSites(params.id, validatedData, siteIds);

			if (!result.success) {
				log.warn('Failed to update team properties', { teamId: params.id, error: result.error.message });
				return errorResponse(result.error.message, 400);
			}

			log.info('Team properties updated', {
				teamId: params.id,
				name: result.data.name,
				updatedFields: Object.keys(validatedData),
				siteCount: siteIds?.length || 0
			});

			return successResponse(result.data);
		}
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Team update validation failed', {
				teamId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to update team', { teamId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/teams/[id]
 * Delete a team
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting team', { teamId: params.id });

	try {
		const result = await service.deleteTeam(params.id);

		if (!result.success) {
			log.warn('Failed to delete team', { teamId: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Team deleted', { teamId: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete team', { teamId: params.id, error });
		return handleApiError(error);
	}
};
