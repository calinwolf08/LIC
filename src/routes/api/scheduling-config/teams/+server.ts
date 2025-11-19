/**
 * Teams API - Collection Endpoints
 *
 * GET /api/scheduling-config/teams - List teams (filtered by clerkship)
 * POST /api/scheduling-config/teams - Create new team
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
import { ZodError } from 'zod';

const service = new TeamService(db);

/**
 * GET /api/scheduling-config/teams
 * Returns teams for a clerkship
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkshipId');

		if (!clerkshipId) {
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const result = await service.getTeamsByClerkship(clerkshipId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/teams
 * Creates a new team
 */
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkshipId');

		if (!clerkshipId) {
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const body = await request.json();
		const validatedData = preceptorTeamInputSchema.parse(body);

		const result = await service.createTeam(clerkshipId, validatedData);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
