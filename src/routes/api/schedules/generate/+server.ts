import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { generateScheduleSchema } from '$lib/features/scheduling/schemas';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
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
import {
	getActiveSchedulingPeriod,
	getOverlappingPeriods,
	createSchedulingPeriod,
	activateSchedulingPeriod
} from '$lib/features/scheduling/services/scheduling-period-service';
import { ZodError } from 'zod';

/**
 * POST /api/schedules/generate
 *
 * Generate a complete schedule for all students using the ConfigurableSchedulingEngine.
 * The engine uses configuration-driven scheduling with support for multiple strategies:
 * - continuous_single (default): One preceptor for entire clerkship
 * - team_continuity: Primary preceptor + team fallback
 * - block_based: Fixed-size blocks with same preceptor
 * - daily_rotation: Different preceptor each day
 *
 * Request body:
 * {
 *   startDate: string (YYYY-MM-DD)
 *   endDate: string (YYYY-MM-DD)
 *   regenerateFromDate?: string (YYYY-MM-DD) - Optional: Only regenerate from this date forward
 *   strategy?: 'full-reoptimize' | 'minimal-change' - Optional: Regeneration strategy (default: full-reoptimize)
 *   preview?: boolean - Optional: If true, returns impact analysis without making changes
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
 *     violations: Violation[],
 *     summary: {
 *       totalAssignments: number,
 *       totalViolations: number,
 *       strategiesUsed: string[]
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
		const regenerateFromDate =
			validatedData.regenerateFromDate ||
			(() => {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				return today.toISOString().split('T')[0];
			})();

		// Get regeneration strategy
		const strategy: RegenerationStrategy = validatedData.strategy || 'full-reoptimize';

		// Check if this is a preview (dry-run) request
		const isPreview = validatedData.preview || false;

		// Fetch required data for preview/context building
		const [students, preceptors, clerkships, healthSystems, teams, studentOnboarding, siteElectives] =
			await Promise.all([
				db.selectFrom('students').selectAll().execute(),
				db.selectFrom('preceptors').selectAll().execute(),
				db.selectFrom('clerkships').selectAll().execute(),
				db.selectFrom('health_systems').selectAll().execute(),
				db.selectFrom('teams').selectAll().execute(),
				db
					.selectFrom('student_health_system_onboarding')
					.select(['student_id', 'health_system_id', 'is_completed'])
					.execute(),
				db.selectFrom('site_electives').select(['site_id', 'elective_requirement_id']).execute()
			]);

		// Get blackout dates separately
		const blackoutDates = await db
			.selectFrom('blackout_dates')
			.select('date')
			.execute()
			.then((rows) => rows.map((r) => r.date));

		// Get availability records
		const availabilityRecords = await db.selectFrom('preceptor_availability').selectAll().execute();

		// Build optional context data for legacy context building (used by preview)
		const optionalData: OptionalContextData = {
			healthSystems,
			teams,
			studentOnboarding,
			siteElectives
		};

		// Build scheduling context for preview mode
		const legacyContext = buildSchedulingContext(
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
				legacyContext,
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
			legacyContext,
			regenerateFromDate,
			validatedData.endDate,
			strategy
		);

		// Get IDs for scheduling
		const studentIds = students.map((s) => s.id!).filter(Boolean);
		const clerkshipIds = clerkships.map((c) => c.id!).filter(Boolean);

		// Create and run the ConfigurableSchedulingEngine
		const engine = new ConfigurableSchedulingEngine(db);
		const result = await engine.schedule(studentIds, clerkshipIds, {
			startDate: regenerateFromDate, // Start from regeneration date
			endDate: validatedData.endDate,
			enableTeamFormation: true,
			enableFallbacks: true, // Uses per-clerkship allowFallbacks config
			dryRun: true, // We handle saving externally for audit trail
			bypassedConstraints: validatedData.bypassedConstraints || []
		});

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

		// Auto-create and activate scheduling period if none exists
		let schedulingPeriodId: string | null = null;
		const activePeriod = await getActiveSchedulingPeriod(db);

		if (!activePeriod) {
			// Check if there's an existing period covering this date range
			const overlappingPeriods = await getOverlappingPeriods(
				db,
				validatedData.startDate,
				validatedData.endDate
			);

			if (overlappingPeriods.length > 0) {
				// Activate the first overlapping period
				const period = await activateSchedulingPeriod(db, overlappingPeriods[0].id!);
				schedulingPeriodId = period.id;
			} else {
				// Create a new scheduling period
				const periodName = `Schedule ${validatedData.startDate} to ${validatedData.endDate}`;
				const newPeriod = await createSchedulingPeriod(db, {
					name: periodName,
					start_date: validatedData.startDate,
					end_date: validatedData.endDate,
					is_active: true
				});
				schedulingPeriodId = newPeriod.id;
			}
		} else {
			schedulingPeriodId = activePeriod.id;
		}

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
				result.success,
				{
					reason: 'api_request',
					notes: `Generated ${result.assignments.length} assignments using ConfigurableSchedulingEngine`
				}
			)
		);

		// Build response
		return successResponse(
			{
				assignments: result.assignments,
				success: result.success,
				unmetRequirements: result.unmetRequirements,
				violations: result.violations,
				summary: {
					totalAssignments: result.assignments.length,
					totalViolations: result.violations.length,
					unmetRequirementsCount: result.unmetRequirements.length
				},
				regeneratedFrom: regenerateFromDate,
				strategy,
				preservedPastAssignments: true,
				preservedFutureAssignments: regenerationResult.preservedAssignments,
				deletedFutureAssignments: deletedCount,
				totalPastAssignments: regenerationResult.creditResult.totalPastAssignments,
				schedulingPeriodId
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
		return errorResponse(
			`Failed to generate schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
			500
		);
	}
};
