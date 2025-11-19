/**
 * Continuous Single Strategy
 *
 * Assigns one preceptor for all required days (most common strategy).
 */

import { BaseStrategy, type StrategyContext, type StrategyResult } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

/**
 * Continuous Single Preceptor Strategy
 *
 * Finds a single preceptor available for ALL required days and assigns
 * them continuously. This is the most common and simplest strategy.
 *
 * Algorithm:
 * 1. Filter preceptors by specialty
 * 2. Filter by health system if required
 * 3. Find preceptors available for ALL required days
 * 4. Sort by load (prefer less loaded preceptors)
 * 5. Select first available preceptor
 * 6. Generate assignments for all days
 */
export class ContinuousSingleStrategy extends BaseStrategy {
  getName(): string {
    return 'ContinuousSingleStrategy';
  }

  canHandle(config: ResolvedRequirementConfiguration): boolean {
    return (
      config.assignmentStrategy === 'continuous_single' ||
      config.assignmentStrategy === undefined
    );
  }

  async generateAssignments(context: StrategyContext): Promise<StrategyResult> {
    const { student, clerkship, config, availableDates, availablePreceptors } = context;

    // Validate required IDs
    if (!student.id) {
      return { success: false, assignments: [], error: 'Student must have a valid ID' };
    }
    if (!clerkship.id) {
      return { success: false, assignments: [], error: 'Clerkship must have a valid ID' };
    }

    // Need enough dates
    if (availableDates.length < clerkship.required_days) {
      return {
        success: false,
        assignments: [],
        error: `Insufficient available dates: ${availableDates.length} < ${clerkship.required_days}`,
      };
    }

    // Take only required number of days
    const requiredDates = availableDates.slice(0, clerkship.required_days);

    // Filter preceptors by specialty
    let candidates = clerkship.specialty
      ? this.filterBySpecialty(availablePreceptors, clerkship.specialty)
      : availablePreceptors;

    // Filter by health system if required
    if (config.healthSystemRule === 'enforce_same_system' && student.id) {
      // Would need to get student's preferred health system
      // For now, skip this filter
    }

    // Sort by load (prefer less loaded)
    candidates = this.sortByLoad(candidates);

    // Find preceptor available for ALL required dates
    const selectedPreceptor = this.findPreceptorAvailableForAllDates(candidates, requiredDates);

    if (!selectedPreceptor) {
      return {
        success: false,
        assignments: [],
        error: `No single preceptor available for all ${clerkship.required_days} required days`,
        metadata: {
          strategyUsed: this.getName(),
          preceptorsConsidered: candidates.length,
          assignmentCount: 0,
        },
      };
    }

    // Check capacity
    const totalNeeded = clerkship.required_days;
    if (selectedPreceptor.currentAssignmentCount + totalNeeded > selectedPreceptor.maxStudentsPerYear) {
      return {
        success: false,
        assignments: [],
        error: `Selected preceptor ${selectedPreceptor.name} would exceed yearly capacity`,
      };
    }

    // Generate assignments
    const assignments = requiredDates.map(date =>
      this.createAssignment(student.id!, selectedPreceptor.id, clerkship.id!, date, {
        requirementType: config.requirementType,
      })
    );

    return {
      success: true,
      assignments,
      metadata: {
        strategyUsed: this.getName(),
        preceptorsConsidered: candidates.length,
        assignmentCount: assignments.length,
      },
    };
  }
}
