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
import { ZodError, z } from 'zod';

const service = new TeamService(db);

/**
 * GET /api/preceptors/teams
 * Returns all teams, or filtered by clerkship if clerkshipId provided
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkshipId');

		// Use getAllTeams which supports optional filtering
		const result = await service.getAllTeams(clerkshipId || undefined);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

// Schema for POST body with clerkshipId and siteIds
const createTeamBodySchema = z.object({
	clerkshipId: z.string().min(1, 'clerkshipId is required'),
	siteIds: z.array(z.string()).optional().default([]),
	...preceptorTeamInputSchema.shape
});

/**
 * POST /api/preceptors/teams
 * Creates a new team
 * Accepts clerkshipId and siteIds in the request body
 */
export const POST: RequestHandler = async ({ request, url }) => {
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
			return errorResponse('clerkshipId is required (in body or query param)', 400);
		}

		const validatedData = preceptorTeamInputSchema.parse(body);

		// Use createTeamWithSites to handle site associations
		const result = await service.createTeamWithSites(clerkshipId, validatedData, siteIds);

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
