/**
 * Fallback Gap Filler
 *
 * Fills gaps in student schedules after primary scheduling completes.
 * Uses tiered fallback to find available preceptors from associated teams.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
import { CapacityChecker } from '../capacity/capacity-checker';
import { FallbackPreceptorResolver, type FallbackPreceptor } from './preceptor-resolver';

/**
 * Unmet requirement from primary scheduling
 */
export interface UnmetRequirement {
	studentId: string;
	studentName: string;
	clerkshipId: string;
	clerkshipName: string;
	requirementType: 'outpatient' | 'inpatient' | 'elective';
	requiredDays: number;
	assignedDays: number;
	remainingDays: number;
	reason: string;
	primaryTeamId?: string; // Team that was attempted
	primaryHealthSystemId?: string; // Health system of primary team
}

/**
 * Assignment created during fallback
 */
export interface FallbackAssignment {
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	date: string;
	tier: 1 | 2 | 3;
	fallbackTeamId: string;
	originalTeamId?: string;
}

/**
 * Result of gap filling
 */
export interface GapFillerResult {
	assignments: FallbackAssignment[];
	fulfilledRequirements: string[]; // studentId-clerkshipId keys
	partialFulfillments: Array<{
		studentId: string;
		clerkshipId: string;
		requiredDays: number;
		assignedDays: number; // Total including primary + fallback
		addedDays: number; // Days added by fallback
	}>;
	stillUnmet: UnmetRequirement[];
}

/**
 * Pending assignment for capacity tracking
 */
interface PendingAssignment {
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	date: string;
}

/**
 * Fallback Gap Filler
 *
 * After primary scheduling completes, this fills remaining gaps by finding
 * available preceptors from teams associated with the clerkship.
 *
 * Processing order: Students with largest gaps first (to maximize days with single preceptor)
 *
 * Fallback tiers:
 * 1. Other preceptors on same team
 * 2. Preceptors on teams in same health system
 * 3. Preceptors on any team for clerkship (if cross-system allowed)
 */
export class FallbackGapFiller {
	private capacityChecker: CapacityChecker;
	private preceptorResolver: FallbackPreceptorResolver;

	constructor(private db: Kysely<DB>) {
		this.capacityChecker = new CapacityChecker(db);
		this.preceptorResolver = new FallbackPreceptorResolver(db);
	}

	/**
	 * Fill gaps in student schedules
	 *
	 * @param unmetRequirements - Requirements not fully met by primary scheduling
	 * @param existingAssignments - Assignments from primary scheduling (DB + pending)
	 * @param configs - Configuration per clerkship
	 * @param options - Date range and other options
	 */
	async fillGaps(
		unmetRequirements: UnmetRequirement[],
		existingAssignments: PendingAssignment[],
		configs: Map<string, ResolvedRequirementConfiguration>,
		options: {
			startDate: string;
			endDate: string;
		}
	): Promise<GapFillerResult> {
		const result: GapFillerResult = {
			assignments: [],
			fulfilledRequirements: [],
			partialFulfillments: [],
			stillUnmet: [],
		};

		if (unmetRequirements.length === 0) {
			return result;
		}

		// Sort by largest gap first (remainingDays descending)
		const sortedRequirements = [...unmetRequirements].sort(
			(a, b) => b.remainingDays - a.remainingDays
		);

		// Track assignments for capacity calculations
		const pendingFallbackAssignments: PendingAssignment[] = [];
		const allAssignments = [...existingAssignments];

		for (const requirement of sortedRequirements) {
			const config = configs.get(requirement.clerkshipId);
			if (!config) {
				result.stillUnmet.push(requirement);
				continue;
			}

			// Skip if fallbacks not allowed for this clerkship
			if (!config.allowFallbacks) {
				result.stillUnmet.push(requirement);
				continue;
			}

			// Try to fill this student's gap
			const fillResult = await this.fillStudentGap(
				requirement,
				config,
				allAssignments,
				options
			);

			if (fillResult.assignments.length > 0) {
				// Track assignments
				result.assignments.push(...fillResult.assignments);
				for (const assignment of fillResult.assignments) {
					const pending: PendingAssignment = {
						studentId: assignment.studentId,
						preceptorId: assignment.preceptorId,
						clerkshipId: assignment.clerkshipId,
						date: assignment.date,
					};
					pendingFallbackAssignments.push(pending);
					allAssignments.push(pending);
				}

				const totalAssigned = requirement.assignedDays + fillResult.assignments.length;
				const addedDays = fillResult.assignments.length;

				if (totalAssigned >= requirement.requiredDays) {
					// Fully fulfilled
					result.fulfilledRequirements.push(
						`${requirement.studentId}-${requirement.clerkshipId}`
					);
				} else {
					// Partially fulfilled
					result.partialFulfillments.push({
						studentId: requirement.studentId,
						clerkshipId: requirement.clerkshipId,
						requiredDays: requirement.requiredDays,
						assignedDays: totalAssigned,
						addedDays,
					});
				}
			} else {
				// No assignments possible
				result.stillUnmet.push(requirement);
			}
		}

		return result;
	}

	/**
	 * Fill gap for a single student's requirement
	 */
	private async fillStudentGap(
		requirement: UnmetRequirement,
		config: ResolvedRequirementConfiguration,
		allAssignments: PendingAssignment[],
		options: { startDate: string; endDate: string }
	): Promise<{ assignments: FallbackAssignment[] }> {
		const assignments: FallbackAssignment[] = [];
		let remainingDays = requirement.remainingDays;

		// Get student's existing assignment dates for this clerkship
		const studentExistingDates = new Set(
			allAssignments
				.filter(
					(a) =>
						a.studentId === requirement.studentId &&
						a.clerkshipId === requirement.clerkshipId
				)
				.map((a) => a.date)
		);

		// Determine primary team and health system
		let primaryTeamId = requirement.primaryTeamId;
		let primaryHealthSystemId = requirement.primaryHealthSystemId;

		// If no primary team specified, get first team for clerkship
		if (!primaryTeamId) {
			const teams = await this.preceptorResolver.getTeamsForClerkship(requirement.clerkshipId);
			if (teams.length > 0) {
				primaryTeamId = teams[0].id;
				primaryHealthSystemId = teams[0].healthSystemId ?? undefined;
			}
		}

		// Get ordered fallback preceptors
		const excludePreceptorIds = new Set<string>();
		const fallbackPreceptors = await this.preceptorResolver.getOrderedFallbackPreceptors(
			requirement.clerkshipId,
			primaryTeamId ?? null,
			primaryHealthSystemId ?? null,
			config.fallbackAllowCrossSystem ?? false,
			excludePreceptorIds
		);

		if (fallbackPreceptors.length === 0) {
			return { assignments };
		}

		// Try each fallback preceptor in order
		for (const preceptor of fallbackPreceptors) {
			if (remainingDays <= 0) break;

			// Get this preceptor's available dates
			const availableDates = await this.getPreceptorAvailableDates(
				preceptor.id,
				options.startDate,
				options.endDate,
				requirement.clerkshipId,
				config.requirementType,
				studentExistingDates,
				allAssignments.concat(assignments)
			);

			if (availableDates.length === 0) continue;

			// Assign as many days as possible with this preceptor
			for (const date of availableDates) {
				if (remainingDays <= 0) break;

				assignments.push({
					studentId: requirement.studentId,
					preceptorId: preceptor.id,
					clerkshipId: requirement.clerkshipId,
					date,
					tier: preceptor.tier,
					fallbackTeamId: preceptor.teamId,
					originalTeamId: primaryTeamId,
				});

				studentExistingDates.add(date);
				remainingDays--;
			}
		}

		return { assignments };
	}

	/**
	 * Get available dates for a preceptor, respecting capacity constraints
	 */
	private async getPreceptorAvailableDates(
		preceptorId: string,
		startDate: string,
		endDate: string,
		clerkshipId: string,
		requirementType: 'outpatient' | 'inpatient' | 'elective',
		studentExistingDates: Set<string>,
		allAssignments: Array<PendingAssignment | FallbackAssignment>
	): Promise<string[]> {
		// Get preceptor's availability records
		const availability = await this.db
			.selectFrom('preceptor_availability')
			.select('date')
			.where('preceptor_id', '=', preceptorId)
			.where('is_available', '=', 1)
			.where('date', '>=', startDate)
			.where('date', '<=', endDate)
			.orderBy('date', 'asc')
			.execute();

		const availableDates: string[] = [];

		// Build map of assignments per preceptor per date for capacity checking
		const assignmentsByDate = new Map<string, number>();
		for (const assignment of allAssignments) {
			if (assignment.preceptorId === preceptorId) {
				const count = assignmentsByDate.get(assignment.date) || 0;
				assignmentsByDate.set(assignment.date, count + 1);
			}
		}

		for (const record of availability) {
			const date = record.date;

			// Skip dates already assigned to this student
			if (studentExistingDates.has(date)) continue;

			// Check capacity (including pending assignments)
			const pendingCount = assignmentsByDate.get(date) || 0;

			// Get capacity rule
			const capacityResult = await this.capacityChecker.checkCapacity(preceptorId, date, {
				clerkshipId,
				requirementType,
			});

			if (!capacityResult.hasCapacity) continue;

			// Also check against pending assignments not yet in DB
			const rule = await this.capacityChecker.resolveCapacityRule(
				preceptorId,
				clerkshipId,
				requirementType
			);

			// Get DB count for this date
			const dbCount = await this.db
				.selectFrom('schedule_assignments')
				.select(({ fn }) => [fn.count<number>('id').as('count')])
				.where('preceptor_id', '=', preceptorId)
				.where('date', '=', date)
				.executeTakeFirst();

			const totalCount = (dbCount?.count || 0) + pendingCount;
			if (totalCount >= rule.maxStudentsPerDay) continue;

			availableDates.push(date);
		}

		return availableDates;
	}
}
