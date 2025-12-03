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

    // Find dates where ANY preceptor is available (skip dates with no availability)
    const datesWithAvailability: string[] = [];
    for (const date of availableDates) {
      const availableToday = candidates.filter(p => this.isDateAvailable(p, date));
      if (availableToday.length > 0) {
        datesWithAvailability.push(date);
      }
    }

    // Check if we have enough dates with preceptor availability
    if (datesWithAvailability.length < totalDays) {
      return {
        success: false,
        assignments: [],
        error: `Insufficient dates with preceptor availability: ${datesWithAvailability.length} < ${totalDays}`,
      };
    }

    const assignments: import('./base-strategy').ProposedAssignment[] = [];
    const requiredDates = datesWithAvailability.slice(0, totalDays);

    // Track rotation index for round-robin
    let rotationIndex = 0;
    let previousPreceptorId: string | null = null;

    // Assign each day, rotating through preceptors
    for (const date of requiredDates) {
      // Find preceptors available on this date (we already know there's at least one)
      const availableToday = candidates.filter(p => this.isDateAvailable(p, date));

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

      // Check daily capacity
      const assignmentsToday = assignments.filter(
        a => a.preceptorId === selectedPreceptor!.id && a.date === date
      ).length;

      if (assignmentsToday >= selectedPreceptor.maxStudentsPerDay) {
        // Try to find another preceptor with capacity
        const nextPreceptor = availableToday.find(p => {
          if (p.id === selectedPreceptor!.id) return false;
          const dailyCount = assignments.filter(a => a.preceptorId === p.id && a.date === date).length;
          return dailyCount < p.maxStudentsPerDay;
        });

        if (!nextPreceptor) {
          return {
            success: false,
            assignments: [],
            error: `No preceptor with available capacity on date ${date}`,
            metadata: {
              strategyUsed: this.getName(),
              preceptorsConsidered: candidates.length,
              assignmentCount: assignments.length,
            },
          };
        }

        selectedPreceptor = nextPreceptor;
      }

      // Create assignment
      assignments.push(
        this.createAssignment(student.id, selectedPreceptor.id, clerkship.id, date, {
          requirementType: config.requirementType,
        })
      );

      previousPreceptorId = selectedPreceptor.id;
    }

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
