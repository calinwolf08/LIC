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
import { ZodError, z } from 'zod';

const service = new TeamService(db);

/**
 * GET /api/preceptors/teams/[id]
 * Get a single team with members and sites
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getTeam(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		if (!result.data) {
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

		return successResponse({
			...result.data,
			sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
		});
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PATCH /api/preceptors/teams/[id]
 * Update an existing team
 * Accepts siteIds in the request body
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
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
				return errorResponse(result.error.message, 400);
			}

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
				return errorResponse(result.error.message, 400);
			}

			return successResponse(result.data);
		}
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/teams/[id]
 * Delete a team
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const result = await service.deleteTeam(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
