/**
 * Scheduling Execution API
 *
 * POST /api/scheduling/execute - Execute the configurable scheduling engine
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling:execute');

/**
 * Scheduling execution request schema
 */
const executeSchedulingSchema = z.object({
	studentIds: z.array(z.string()).min(1, 'At least one student ID is required'),
	clerkshipIds: z.array(z.string()).min(1, 'At least one clerkship ID is required'),
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
	options: z.object({
		enableTeamFormation: z.boolean().optional(),
		enableFallbacks: z.boolean().optional(),
		enableOptimization: z.boolean().optional(),
		maxRetriesPerStudent: z.number().int().positive().optional(),
		dryRun: z.boolean().optional(),
	}).optional(),
});

/**
 * POST /api/scheduling/execute
 * Executes the configurable scheduling engine
 *
 * Request Body:
 * {
 *   "studentIds": ["student-1", "student-2"],
 *   "clerkshipIds": ["clerkship-1", "clerkship-2"],
 *   "startDate": "2025-01-06",
 *   "endDate": "2025-06-30",
 *   "options": {
 *     "enableTeamFormation": false,
 *     "enableFallbacks": true,
 *     "enableOptimization": false,
 *     "maxRetriesPerStudent": 3,
 *     "dryRun": true
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "success": true,
 *     "assignments": [...],
 *     "unmetRequirements": [...],
 *     "statistics": {...},
 *     "violations": [...],
 *     "pendingApprovals": [...]
 *   }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Scheduling execution request received');

	try {
		const body = await request.json();
		const validatedData = executeSchedulingSchema.parse(body);

		log.debug('Request validated', {
			studentCount: validatedData.studentIds.length,
			clerkshipCount: validatedData.clerkshipIds.length,
			startDate: validatedData.startDate,
			endDate: validatedData.endDate,
			options: validatedData.options
		});

		// Create scheduling engine instance
		const engine = new ConfigurableSchedulingEngine(db);

		// Execute scheduling
		log.info('Executing scheduling engine', {
			students: validatedData.studentIds.length,
			clerkships: validatedData.clerkshipIds.length,
			dateRange: `${validatedData.startDate} to ${validatedData.endDate}`,
			dryRun: validatedData.options?.dryRun || false
		});

		const result = await engine.schedule(
			validatedData.studentIds,
			validatedData.clerkshipIds,
			{
				startDate: validatedData.startDate,
				endDate: validatedData.endDate,
				...validatedData.options,
			}
		);

		log.info('Scheduling execution complete', {
			success: result.success,
			assignmentCount: result.assignments.length,
			unmetRequirementCount: result.unmetRequirements.length,
			violationCount: result.violations.length,
			pendingApprovalCount: result.pendingApprovals?.length || 0
		});

		// Return result
		// Note: The result itself has a "success" field, but we wrap it in the API response
		return successResponse(result, 200);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Scheduling execution validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Scheduling execution failed', { error });
		return handleApiError(error);
	}
};
