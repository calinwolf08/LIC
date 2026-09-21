/**
 * Daily Rotation Strategy
 *
 * Assigns preceptors day-by-day with no continuity requirement.
 */

import { BaseStrategy, type StrategyContext, type StrategyResult } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

/**
 * Daily Rotation Strategy
 *
 * Rotates through preceptors day-by-day for exposure to different teaching styles.
 * Skips dates where no preceptor is available. Days do NOT need to be consecutive.
 *
 * Algorithm:
 * 1. Find dates where ANY preceptor is available (skip dates with no availability)
 * 2. Take the first N such dates
 * 3. For each date:
 *    a. Try to use a DIFFERENT preceptor than the previous day
 *    b. Round-robin through available preceptors
 *    c. Check daily capacity
 * 4. Generate one assignment per day, rotating preceptors
 */
export class DailyRotationStrategy extends BaseStrategy {
  getName(): string {
    return 'DailyRotationStrategy';
  }

  canHandle(config: ResolvedRequirementConfiguration): boolean {
    return config.assignmentStrategy === 'daily_rotation';
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
    const totalDays = config.requiredDays;

    // Filter preceptors by specialty
    let candidates = clerkship.specialty
      ? this.filterBySpecialty(availablePreceptors, clerkship.specialty)
      : availablePreceptors;

    // Sort by load for initial ordering
    candidates = this.sortByLoad(candidates);

    // Find dates where ANY preceptor is available AND has daily capacity
    const datesWithAvailability: string[] = [];
    for (const date of availableDates) {
      const availableToday = candidates.filter(
        p => this.isDateAvailable(p, date) && this.hasDailyCapacity(context, p, date)
      );
      if (availableToday.length > 0) {
        datesWithAvailability.push(date);
      }
    }

    // Take as many days as we can, up to the requirement. A short supply is a
    // partial result (review finding F-21), not a discarded one.
    const assignments: import('./base-strategy').ProposedAssignment[] = [];
    const requiredDates = datesWithAvailability.slice(0, totalDays);
    const insufficientDates = datesWithAvailability.length < totalDays;

    // Track rotation index for round-robin
    let rotationIndex = 0;
    let previousPreceptorId: string | null = null;

    // Track assignments made in this call (for daily capacity within this student's assignment)
    const localAssignmentsByPreceptorDate = new Map<string, Map<string, number>>();

    // Assign each day, rotating through preceptors
    for (const date of requiredDates) {
      // Find preceptors available on this date with remaining daily capacity
      // Check both pending assignments (from context) and local assignments (this call)
      const availableToday = candidates.filter(p => {
        if (!this.isDateAvailable(p, date)) return false;

        // Check pending assignments from context
        const pendingCount = context.assignmentsByPreceptorDate?.get(p.id)?.get(date) ?? 0;
        // Check local assignments made in this call
        const localCount = localAssignmentsByPreceptorDate.get(p.id)?.get(date) ?? 0;
        const totalDailyCount = pendingCount + localCount;

        return totalDailyCount < p.maxStudentsPerDay;
      });

      if (availableToday.length === 0) {
        // Skip this day rather than discarding the whole result — keep the days
        // already placed and let the engine report the gap (F-21).
        continue;
      }

      // Try to select a DIFFERENT preceptor than the previous assignment (rotation behavior)
      let selectedPreceptor: (typeof candidates)[0] | null = null;

      // If we have multiple available preceptors, prefer one different from previous
      if (availableToday.length > 1 && previousPreceptorId) {
        const differentPreceptors = availableToday.filter(p => p.id !== previousPreceptorId);
        if (differentPreceptors.length > 0) {
          // Round-robin through the different preceptors
          selectedPreceptor = differentPreceptors[rotationIndex % differentPreceptors.length];
          rotationIndex++;
        }
      }

      // Fallback: use round-robin from all available today
      if (!selectedPreceptor) {
        selectedPreceptor = availableToday[rotationIndex % availableToday.length];
        rotationIndex++;
      }

      // Track this assignment locally
      if (!localAssignmentsByPreceptorDate.has(selectedPreceptor.id)) {
        localAssignmentsByPreceptorDate.set(selectedPreceptor.id, new Map());
      }
      const dateMap = localAssignmentsByPreceptorDate.get(selectedPreceptor.id)!;
      const currentCount = dateMap.get(date) ?? 0;
      dateMap.set(date, currentCount + 1);

      // Create assignment
      assignments.push(
        this.createAssignment(student.id, selectedPreceptor.id, clerkship.id, date, {
          requirementType: config.requirementType,
        })
      );

      previousPreceptorId = selectedPreceptor.id;
    }

    const complete = assignments.length >= totalDays;
    return {
      success: complete,
      assignments,
      error: complete
        ? undefined
        : insufficientDates
          ? `Insufficient dates with preceptor availability: ${datesWithAvailability.length} < ${totalDays}`
          : `Only ${assignments.length} of ${totalDays} days could be assigned`,
      metadata: {
        strategyUsed: this.getName(),
        preceptorsConsidered: candidates.length,
        assignmentCount: assignments.length,
      },
    };
  }
}
