/**
 * Team API - Individual Team Endpoints
 *
 * PATCH /api/scheduling-config/teams/[id] - Update team
 * DELETE /api/scheduling-config/teams/[id] - Delete team
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '$lib/api';
import { TeamService } from '$lib/features/scheduling-config/services/teams.service';
import { preceptorTeamInputSchema } from '$lib/features/scheduling-config/schemas/teams.schemas';
import { ZodError, z } from 'zod';

const service = new TeamService(db);

/**
 * PATCH /api/scheduling-config/teams/[id]
 * Update an existing team
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();

		// Validate members if provided
		if (body.members) {
			// If members are included, validate the full schema
			const validatedData = preceptorTeamInputSchema.parse(body);
			const result = await service.updateTeam(params.id, validatedData);

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
			const result = await service.updateTeam(params.id, validatedData);

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
 * DELETE /api/scheduling-config/teams/[id]
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
