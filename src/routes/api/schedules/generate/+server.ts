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
	SpecialtyMatchConstraint
} from '$lib/features/scheduling';
import { ConstraintFactory } from '$lib/features/scheduling/services/constraint-factory';
import { buildSchedulingContext } from '$lib/features/scheduling/services/context-builder';
import type { OptionalContextData } from '$lib/features/scheduling/services/context-builder';
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
		const [
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			healthSystems,
			teams,
			studentOnboarding,
			preceptorClerkships,
			siteElectives
		] = await Promise.all([
			// Required data
			db.selectFrom('students').selectAll().execute(),
			db.selectFrom('preceptors').selectAll().execute(),
			db.selectFrom('clerkships').selectAll().execute(),
			db
				.selectFrom('blackout_dates')
				.select('date')
				.execute()
				.then((rows) => rows.map((r) => r.date)),
			db.selectFrom('preceptor_availability').selectAll().execute(),

			// Optional data for enhanced constraints
			db.selectFrom('health_systems').selectAll().execute(),
			db.selectFrom('teams').selectAll().execute(),
			db
				.selectFrom('student_health_system_onboarding')
				.select(['student_id', 'health_system_id', 'is_completed'])
				.execute(),
			db
				.selectFrom('preceptor_site_clerkships')
				.select(['preceptor_id', 'clerkship_id', 'site_id'])
				.execute(),
			db
				.selectFrom('site_electives')
				.select(['site_id', 'elective_requirement_id'])
				.execute()
		]);

		// Build optional context data
		const optionalData: OptionalContextData = {
			healthSystems,
			teams,
			studentOnboarding,
			preceptorClerkships,
			siteElectives
		};

		// Build scheduling context with optional data
		const context = buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			validatedData.startDate,
			validatedData.endDate,
			optionalData
		);

		// Get clerkship IDs for constraint factory
		const clerkshipIds = clerkships.map((c) => c.id!);

		// Build constraints using factory
		const constraintFactory = new ConstraintFactory(db);
		const factoryConstraints = await constraintFactory.buildConstraints(clerkshipIds, context);

		// Add legacy constraints that aren't yet in the factory
		const allConstraints = [
			...factoryConstraints,
			new PreceptorCapacityConstraint(),
			new PreceptorAvailabilityConstraint()
		];

		// Create scheduling engine with constraints
		const engine = new SchedulingEngine(allConstraints);

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
