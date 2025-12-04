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
 * Finds a single preceptor with at least N available days and assigns
 * them for all required days. Days do NOT need to be consecutive.
 *
 * Algorithm:
 * 1. Filter preceptors by specialty
 * 2. Filter by health system if required
 * 3. Find preceptors with at least N available days within the date range
 * 4. Sort by load (prefer less loaded preceptors)
 * 5. Select first available preceptor
 * 6. Use the first N available dates from that preceptor
 */
export class ContinuousSingleStrategy extends BaseStrategy {
  getName(): string {
    return 'ContinuousSingleStrategy';
  }

  canHandle(config: ResolvedRequirementConfiguration): boolean {
    // continuous_single is the default strategy when none is specified
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

    // Use config.requiredDays which respects requirement overrides
    const requiredDays = config.requiredDays;

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

    // Convert availableDates to a Set for fast lookup
    const availableDateSet = new Set(availableDates);

    // Find preceptor with at least N available dates within the scheduling range
    let selectedPreceptor: (typeof candidates)[0] | null = null;
    let selectedDates: string[] = [];

    for (const preceptor of candidates) {
      // Get preceptor's available dates that are also in the scheduling range
      // AND where preceptor has daily capacity remaining
      const preceptorAvailableDates = preceptor.availability
        .filter(date => availableDateSet.has(date))
        .filter(date => this.hasDailyCapacity(context, preceptor, date))
        .sort(); // Sort chronologically

      if (preceptorAvailableDates.length >= requiredDays) {
        // Check yearly capacity
        if (this.hasYearlyCapacity(preceptor, requiredDays)) {
          selectedPreceptor = preceptor;
          selectedDates = preceptorAvailableDates.slice(0, requiredDays);
          break;
        }
      }
    }

    if (!selectedPreceptor) {
      return {
        success: false,
        assignments: [],
        error: `No single preceptor available for all ${requiredDays} required days`,
        metadata: {
          strategyUsed: this.getName(),
          preceptorsConsidered: candidates.length,
          assignmentCount: 0,
        },
      };
    }

    // Generate assignments using the selected preceptor's available dates
    const assignments = selectedDates.map(date =>
      this.createAssignment(student.id!, selectedPreceptor!.id, clerkship.id!, date, {
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
