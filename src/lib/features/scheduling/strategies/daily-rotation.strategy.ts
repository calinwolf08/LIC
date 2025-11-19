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
 * Assigns a preceptor for each day independently. Preceptor can change daily.
 * Provides maximum flexibility but minimal continuity.
 *
 * Algorithm:
 * 1. For each required day:
 *    a. Find all preceptors available on that date
 *    b. Filter by specialty and health system rules
 *    c. Check daily capacity
 *    d. Prefer less loaded preceptors (load balancing)
 *    e. Try to minimize preceptor changes (soft preference)
 * 2. Generate one assignment per day
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

    const totalDays = clerkship.required_days;

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

    const assignments: import('./base-strategy').ProposedAssignment[] = [];
    let previousPreceptor: typeof candidates[0] | null = null;
    const requiredDates = availableDates.slice(0, totalDays);

    // Assign each day
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

      // Sort by load
      const sortedCandidates = this.sortByLoad(availableToday);

      // Soft preference: try to use previous preceptor if available (minimize changes)
      let selectedPreceptor: typeof candidates[0];

      if (previousPreceptor && availableToday.some(p => p.id === previousPreceptor!.id)) {
        // Check if previous preceptor hasn't exceeded daily capacity
        const assignmentsToday = assignments.filter(
          a => a.preceptorId === previousPreceptor!.id && a.date === date
        ).length;

        if (assignmentsToday < previousPreceptor.maxStudentsPerDay) {
          selectedPreceptor = previousPreceptor;
        } else {
          selectedPreceptor = sortedCandidates[0];
        }
      } else {
        selectedPreceptor = sortedCandidates[0];
      }

      // Check daily capacity
      const assignmentsToday = assignments.filter(
        a => a.preceptorId === selectedPreceptor.id && a.date === date
      ).length;

      if (assignmentsToday >= selectedPreceptor.maxStudentsPerDay) {
        // Try next available preceptor
        const nextPreceptor = sortedCandidates.find(p => {
          const dailyCount = assignments.filter(a => a.preceptorId === p.id && a.date === date)
            .length;
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

      previousPreceptor = selectedPreceptor;
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
