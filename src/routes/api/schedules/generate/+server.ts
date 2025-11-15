import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { generateScheduleSchema } from '$lib/features/scheduling/schemas';
import { SchedulingEngine } from '$lib/features/scheduling';
import {
	NoDoubleBookingConstraint,
	PreceptorCapacityConstraint,
	PreceptorAvailabilityConstraint,
	BlackoutDateConstraint,
	SpecialtyMatchConstraint,
} from '$lib/features/scheduling';
import { ZodError } from 'zod';

/**
 * POST /api/schedules/generate
 *
 * Generate a complete schedule for all students
 *
 * Request body:
 * {
 *   startDate: string (YYYY-MM-DD)
 *   endDate: string (YYYY-MM-DD)
 *   bypassedConstraints?: string[] (optional)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     assignments: Assignment[],
 *     success: boolean,
 *     unmetRequirements: UnmetRequirement[],
 *     violationStats: ViolationStats[],
 *     summary: {
 *       totalAssignments: number,
 *       totalViolations: number,
 *       mostBlockingConstraints: string[]
 *     }
 *   }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse and validate request body
		const body = await request.json();
		const validatedData = generateScheduleSchema.parse(body);

		// Fetch all required data from database
		const [students, preceptors, clerkships, blackoutDates, availabilityRecords] =
			await Promise.all([
				// Get all students
				db.selectFrom('students').selectAll().execute(),

				// Get all preceptors
				db.selectFrom('preceptors').selectAll().execute(),

				// Get all clerkships
				db.selectFrom('clerkships').selectAll().execute(),

				// Get all blackout dates
				db
					.selectFrom('blackout_dates')
					.select('date')
					.execute()
					.then((rows) => rows.map((r) => r.date)),

				// Get all preceptor availability
				db
					.selectFrom('preceptor_availability')
					.selectAll()
					.execute(),
			]);

		// Create scheduling engine with all constraints
		const engine = new SchedulingEngine([
			new NoDoubleBookingConstraint(),
			new PreceptorCapacityConstraint(),
			new PreceptorAvailabilityConstraint(),
			new BlackoutDateConstraint(),
			new SpecialtyMatchConstraint(),
		]);

		// Generate schedule
		const result = await engine.generateSchedule(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			validatedData.startDate,
			validatedData.endDate,
			new Set(validatedData.bypassedConstraints || [])
		);

		// Return result (exclude violationTracker from response as it's not serializable)
		const { violationTracker, ...serializable } = result;

		return successResponse(serializable, 200);
	} catch (error) {
		// Handle validation errors
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		// Log unexpected errors
		console.error('Schedule generation error:', error);
		return errorResponse('Failed to generate schedule', 500);
	}
};
