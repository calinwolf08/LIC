/**
 * Team Validation API
 *
 * POST /api/preceptors/teams/validate - Validate a team configuration before creation
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { TeamValidator } from '$lib/features/scheduling/team-formation';
import { z } from 'zod';
import { ZodError } from 'zod';

/**
 * Team validation request schema
 */
const validateTeamSchema = z.object({
	members: z.array(z.object({
		preceptorId: z.string(),
		priority: z.number().int().positive(),
		role: z.string().optional(),
		assignedDates: z.array(z.string()).optional(),
	})).min(1, 'At least one team member is required'),
	config: z.object({
		requireSameHealthSystem: z.boolean(),
		requireSameSite: z.boolean(),
		requireSameSpecialty: z.boolean(),
		requiresAdminApproval: z.boolean(),
		minMembers: z.number().int().positive().optional(),
		maxMembers: z.number().int().positive().optional(),
	}),
	options: z.object({
		clerkshipId: z.string().optional(),
		requirementType: z.enum(['outpatient', 'inpatient', 'elective']).optional(),
		specialty: z.string().optional(),
		totalDates: z.array(z.string()).optional(),
	}).optional(),
});

/**
 * POST /api/preceptors/teams/validate
 * Validates a team configuration against formation rules
 *
 * Request Body:
 * {
 *   "members": [
 *     { "preceptorId": "p1", "priority": 1 },
 *     { "preceptorId": "p2", "priority": 2 }
 *   ],
 *   "config": {
 *     "requireSameHealthSystem": true,
 *     "requireSameSite": true,
 *     "requireSameSpecialty": true,
 *     "requiresAdminApproval": false
 *   },
 *   "options": {
 *     "clerkshipId": "c1",
 *     "requirementType": "outpatient",
 *     "specialty": "Family Medicine"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isValid": true,
 *     "errors": [],
 *     "warnings": [],
 *     "requiresApproval": false
 *   }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = validateTeamSchema.parse(body);

		const validator = new TeamValidator(db);

		const result = await validator.validateTeam(
			validatedData.members,
			validatedData.config,
			validatedData.options || {}
		);

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
