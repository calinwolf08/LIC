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
	console.log('[PATCH /teams/:id] START', { teamId: params.id });
	try {
		console.log('[PATCH /teams/:id] Parsing request body');
		const body = await request.json();
		console.log('[PATCH /teams/:id] Body parsed', { body });

		// Validate members if provided
		if (body.members) {
			console.log('[PATCH /teams/:id] Validating with members');
			// If members are included, validate the full schema
			const validatedData = preceptorTeamInputSchema.parse(body);
			console.log('[PATCH /teams/:id] Calling service.updateTeam with members');
			const result = await service.updateTeam(params.id, validatedData);
			console.log('[PATCH /teams/:id] Service returned', { success: result.success });

			if (!result.success) {
				console.log('[PATCH /teams/:id] Update failed', result.error);
				return errorResponse(result.error.message, 400);
			}

			console.log('[PATCH /teams/:id] Returning success response');
			return successResponse(result.data);
		} else {
			console.log('[PATCH /teams/:id] Validating without members');
			// If no members, only validate the team properties
			const teamPropsSchema = z.object({
				name: z.string().optional(),
				requireSameHealthSystem: z.boolean().optional(),
				requireSameSite: z.boolean().optional(),
				requireSameSpecialty: z.boolean().optional(),
				requiresAdminApproval: z.boolean().optional(),
			});

			const validatedData = teamPropsSchema.parse(body);
			console.log('[PATCH /teams/:id] Calling service.updateTeam without members');
			const result = await service.updateTeam(params.id, validatedData);
			console.log('[PATCH /teams/:id] Service returned', { success: result.success });

			if (!result.success) {
				console.log('[PATCH /teams/:id] Update failed', result.error);
				return errorResponse(result.error.message, 400);
			}

			console.log('[PATCH /teams/:id] Returning success response');
			return successResponse(result.data);
		}
	} catch (error) {
		console.error('[PATCH /teams/:id] Caught error', error);
		if (error instanceof ZodError) {
			console.log('[PATCH /teams/:id] Zod validation error');
			return validationErrorResponse(error);
		}

		console.log('[PATCH /teams/:id] Unhandled error');
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
