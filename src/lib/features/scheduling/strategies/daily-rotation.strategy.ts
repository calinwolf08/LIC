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
 * Provides maximum variety and load balancing.
 *
 * Algorithm:
 * 1. Create a rotation pool of available preceptors
 * 2. For each required day:
 *    a. Try to use a DIFFERENT preceptor than the previous day
 *    b. Round-robin through available preceptors
 *    c. Check daily capacity
 * 3. Generate one assignment per day, rotating preceptors
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

    // Check if we have enough dates
    if (availableDates.length < totalDays) {
      return {
        success: false,
        assignments: [],
        error: `Insufficient available dates: ${availableDates.length} < ${totalDays}`,
      };
    }

    // Filter preceptors by specialty
    let candidates = clerkship.specialty
      ? this.filterBySpecialty(availablePreceptors, clerkship.specialty)
      : availablePreceptors;

    // Sort by load for initial ordering
    candidates = this.sortByLoad(candidates);

    const assignments: import('./base-strategy').ProposedAssignment[] = [];
    const requiredDates = availableDates.slice(0, totalDays);

    // Track rotation index for round-robin
    let rotationIndex = 0;
    let previousPreceptorId: string | null = null;

    // Assign each day, rotating through preceptors
    for (const date of requiredDates) {
      // Find preceptors available on this date
      const availableToday = candidates.filter(p => this.isDateAvailable(p, date));

      if (availableToday.length === 0) {
        return {
          success: false,
          assignments: [],
          error: `No preceptor available on date ${date}`,
          metadata: {
            strategyUsed: this.getName(),
            preceptorsConsidered: candidates.length,
            assignmentCount: assignments.length,
          },
        };
      }

      // Try to select a DIFFERENT preceptor than yesterday (rotation behavior)
      let selectedPreceptor: typeof candidates[0] | null = null;

      // If we have multiple available preceptors, prefer one different from yesterday
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
