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
import { z } from 'zod';
import { ZodError } from 'zod';

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
	try {
		const body = await request.json();
		const validatedData = executeSchedulingSchema.parse(body);

		// Create scheduling engine instance
		const engine = new ConfigurableSchedulingEngine(db);

		// Execute scheduling
		console.log('[API] Executing scheduling engine...');
		const result = await engine.schedule(
			validatedData.studentIds,
			validatedData.clerkshipIds,
			{
				startDate: validatedData.startDate,
				endDate: validatedData.endDate,
				...validatedData.options,
			}
		);

		console.log(`[API] Scheduling complete. Success: ${result.success}`);
		console.log(`[API] Assignments: ${result.assignments.length}`);
		console.log(`[API] Unmet requirements: ${result.unmetRequirements.length}`);
		console.log(`[API] Violations: ${result.violations.length}`);

		// Return result
		// Note: The result itself has a "success" field, but we wrap it in the API response
		return successResponse(result, 200);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		console.error('[API] Scheduling execution error:', error);
		return handleApiError(error);
	}
};
