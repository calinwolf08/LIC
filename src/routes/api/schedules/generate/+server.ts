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
import { clearAllAssignments } from '$lib/features/schedules/services/editing-service';
import {
	prepareRegenerationContext,
	analyzeRegenerationImpact
} from '$lib/features/scheduling/services/regeneration-service';
import type { RegenerationStrategy } from '$lib/features/scheduling/services/regeneration-service';
import {
	logRegenerationEvent,
	createRegenerationAuditLog
} from '$lib/features/scheduling/services/audit-service';
import { bulkCreateAssignments } from '$lib/features/schedules/services/assignment-service';
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
 *   regenerateFromDate?: string (YYYY-MM-DD) - Optional: Only regenerate from this date forward
 *   strategy?: 'full-reoptimize' | 'minimal-change' - Optional: Regeneration strategy (default: full-reoptimize)
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
 *     },
 *     regeneratedFrom?: string,
 *     strategy: string,
 *     preservedPastAssignments: boolean,
 *     preservedFutureAssignments: number,
 *     deletedFutureAssignments: number,
 *     totalPastAssignments: number
 *   }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse and validate request body
		const body = await request.json();
		const validatedData = generateScheduleSchema.parse(body);

		// Determine regeneration date (defaults to today if not provided)
		const regenerateFromDate = validatedData.regenerateFromDate || (() => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			return today.toISOString().split('T')[0];
		})();

		// Get regeneration strategy
		const strategy: RegenerationStrategy = validatedData.strategy || 'full-reoptimize';

		// Check if this is a preview (dry-run) request
		const isPreview = validatedData.preview || false;

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

		// If preview mode, analyze impact and return without making changes
		if (isPreview) {
			const impact = await analyzeRegenerationImpact(
				db,
				context,
				regenerateFromDate,
				validatedData.endDate,
				strategy
			);

			return successResponse({
				preview: true,
				impact: {
					summary: impact.summary,
					pastAssignments: {
						count: impact.pastAssignmentsCount,
						assignments: impact.pastAssignments.map((a) => ({
							id: a.id,
							studentId: a.student_id,
							preceptorId: a.preceptor_id,
							clerkshipId: a.clerkship_id,
							date: a.date,
							status: a.status
						}))
					},
					futureAssignments: {
						toDeleteCount: impact.deletedCount,
						preservableCount: impact.preservedCount,
						affectedCount: impact.affectedCount,
						replaceableCount: impact.replaceableAssignments.filter((r) => r.replacementPreceptorId)
							.length
					},
					studentProgress: impact.studentProgress,
					affectedAssignments: impact.affectedAssignments.map((a) => ({
						id: a.id,
						studentId: a.student_id,
						preceptorId: a.preceptor_id,
						clerkshipId: a.clerkship_id,
						date: a.date
					})),
					replaceableAssignments: impact.replaceableAssignments
						.filter((r) => r.replacementPreceptorId)
						.map((r) => ({
							originalAssignmentId: r.original.id,
							originalPreceptorId: r.original.preceptor_id,
							replacementPreceptorId: r.replacementPreceptorId,
							studentId: r.original.student_id,
							date: r.original.date
						}))
				}
			});
		}

		// Clear future assignments (preserving past assignments before regenerateFromDate)
		const deletedCount = await clearAllAssignments(db, regenerateFromDate);

		// Prepare context for regeneration (credit past assignments, apply strategy)
		const regenerationResult = await prepareRegenerationContext(
			db,
			context,
			regenerateFromDate,
			validatedData.endDate,
			strategy
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

		// Save generated assignments to database
		if (result.assignments.length > 0) {
			const assignmentsToSave = result.assignments.map((assignment) => ({
				student_id: assignment.studentId,
				preceptor_id: assignment.preceptorId,
				clerkship_id: assignment.clerkshipId,
				date: assignment.date,
				status: 'scheduled'
			}));

			await bulkCreateAssignments(db, { assignments: assignmentsToSave });
		}

		// Return result (exclude violationTracker from response as it's not serializable)
		const { violationTracker, ...serializable } = result;

		// Log successful regeneration to audit trail
		await logRegenerationEvent(
			db,
			createRegenerationAuditLog(
				strategy,
				regenerateFromDate,
				validatedData.endDate,
				regenerationResult.creditResult.totalPastAssignments,
				deletedCount,
				regenerationResult.preservedAssignments,
				regenerationResult.affectedAssignments,
				result.assignments.length,
				true,
				{
					reason: 'api_request',
					notes: `Generated ${result.assignments.length} assignments using ${strategy} strategy`
				}
			)
		);

		return successResponse(
			{
				...serializable,
				regeneratedFrom: regenerateFromDate,
				strategy,
				preservedPastAssignments: true,
				preservedFutureAssignments: regenerationResult.preservedAssignments,
				deletedFutureAssignments: deletedCount,
				totalPastAssignments: regenerationResult.creditResult.totalPastAssignments
			},
			200
		);
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
