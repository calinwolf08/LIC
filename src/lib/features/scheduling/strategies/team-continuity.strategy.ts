/**
 * Team Continuity Strategy
 *
 * Maximizes preceptor continuity within a team context.
 * Assigns as many days as possible to the primary preceptor,
 * then fills remaining days with other team members by priority.
 */

import { BaseStrategy, type StrategyContext, type StrategyResult } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

/**
 * Team Continuity Strategy
 *
 * Algorithm:
 * 1. Get team for this clerkship (or use all available preceptors as implicit team)
 * 2. Sort team members by priority (lower = higher priority)
 * 3. For primary preceptor (highest priority): assign ALL their available days first
 * 4. If requirement not met: move to next team member, assign their available days
 * 5. Repeat until requirement met or no more team members
 *
 * This ensures maximum continuity with the primary preceptor while
 * allowing fallback to team members only when necessary.
 */
export class TeamContinuityStrategy extends BaseStrategy {
  getName(): string {
    return 'TeamContinuityStrategy';
  }

  canHandle(config: ResolvedRequirementConfiguration): boolean {
    // team_continuity is the default strategy when none is specified
    // Also handles 'continuous_single' for backward compatibility (deprecated)
    return (
      config.assignmentStrategy === 'team_continuity' ||
      config.assignmentStrategy === 'continuous_single' ||
      config.assignmentStrategy === undefined
    );
  }

  async generateAssignments(context: StrategyContext): Promise<StrategyResult> {
    const { student, clerkship, config, availableDates, availablePreceptors, teams } = context;

    // Validate required IDs
    if (!student.id) {
      return { success: false, assignments: [], error: 'Student must have a valid ID' };
    }
    if (!clerkship.id) {
      return { success: false, assignments: [], error: 'Clerkship must have a valid ID' };
    }

    // Use config.requiredDays which respects requirement overrides
    const requiredDays = config.requiredDays;

    // Check if we have enough dates available
    if (availableDates.length < requiredDays) {
      return {
        success: false,
        assignments: [],
        error: `Insufficient available dates: ${availableDates.length} < ${requiredDays}`,
      };
    }

    // Get team members sorted by priority, or fall back to all preceptors
    const teamMembers = this.getTeamMembersSortedByPriority(context);

    if (teamMembers.length === 0) {
      return {
        success: false,
        assignments: [],
        error: 'No preceptors available for scheduling',
      };
    }

    const assignments: ReturnType<typeof this.createAssignment>[] = [];
    const usedDates = new Set<string>();
    let remainingDays = requiredDays;

    // Track which preceptors we used
    const preceptorsUsed: string[] = [];
    let primaryPreceptorId: string | null = null;

    // Track assignments made to each preceptor in this strategy run (for capacity calculations)
    const assignmentsPerPreceptor = new Map<string, number>();

    // For each team member by priority, assign their available days
    for (const member of teamMembers) {
      if (remainingDays <= 0) break;

      const preceptor = availablePreceptors.find(p => p.id === member.preceptorId);
      if (!preceptor) continue;

      // Track primary preceptor (first one we try to assign)
      if (primaryPreceptorId === null) {
        primaryPreceptorId = preceptor.id;
      }

      // Check yearly capacity before attempting to assign days
      // Calculate how many days we can assign to this preceptor
      // Include both context-tracked pending assignments AND assignments made in this strategy run
      const contextYearlyAssignments = preceptor.currentAssignmentCount;
      const strategyRunAssignments = assignmentsPerPreceptor.get(preceptor.id) ?? 0;
      const totalYearlyAssignments = contextYearlyAssignments + strategyRunAssignments;
      const maxYearlyCapacity = preceptor.maxStudentsPerYear;
      const yearlyCapacityRemaining = maxYearlyCapacity - totalYearlyAssignments;

      if (yearlyCapacityRemaining <= 0) {
        continue; // Skip this preceptor, yearly capacity exhausted
      }

      // Get preceptor's available dates that we haven't used yet
      // AND where preceptor has daily capacity remaining (using context for batch tracking)
      const preceptorAvailableDates = preceptor.availability
        .filter(date => availableDates.includes(date) && !usedDates.has(date))
        .filter(date => this.hasDailyCapacity(context, preceptor, date))
        .sort(); // Sort chronologically

      // Track assignments made for this preceptor in this strategy run
      let assignedToThisPreceptor = 0;

      // Assign as many days as possible with this preceptor
      for (const date of preceptorAvailableDates) {
        if (remainingDays <= 0) break;

        // Check if we've exceeded yearly capacity for this preceptor
        if (assignedToThisPreceptor >= yearlyCapacityRemaining) {
          break; // Move to next preceptor
        }

        // Create assignment
        assignments.push(
          this.createAssignment(student.id, preceptor.id, clerkship.id, date, {
            requirementType: config.requirementType,
            teamId: member.teamId,
          })
        );

        usedDates.add(date);
        remainingDays--;
        assignedToThisPreceptor++;

        // Track assignment for this preceptor in this strategy run
        assignmentsPerPreceptor.set(preceptor.id, (assignmentsPerPreceptor.get(preceptor.id) ?? 0) + 1);

        if (!preceptorsUsed.includes(preceptor.id)) {
          preceptorsUsed.push(preceptor.id);
        }
      }
    }

    // Check if we met the requirement
    if (assignments.length < requiredDays) {
      // Try to find any available preceptor for remaining dates
      const additionalAssignments = this.fillRemainingDays(
        context,
        availableDates.filter(d => !usedDates.has(d)),
        requiredDays - assignments.length,
        student.id,
        clerkship.id,
        config.requirementType,
        assignmentsPerPreceptor
      );

      assignments.push(...additionalAssignments);
    }

    // Final check
    if (assignments.length < requiredDays) {
      return {
        success: false,
        assignments: [],
        error: `Could only assign ${assignments.length} of ${requiredDays} required days. Team members have insufficient availability.`,
        metadata: {
          strategyUsed: this.getName(),
          preceptorsConsidered: teamMembers.length,
          assignmentCount: assignments.length,
        },
      };
    }

    // Calculate continuity metrics
    const primaryPreceptorDays = assignments.filter(a => a.preceptorId === primaryPreceptorId).length;
    const continuityPercent = Math.round((primaryPreceptorDays / assignments.length) * 100);

    return {
      success: true,
      assignments,
      metadata: {
        strategyUsed: this.getName(),
        preceptorsConsidered: teamMembers.length,
        assignmentCount: assignments.length,
        teamUsed: teamMembers[0]?.teamId,
        // Additional metadata for continuity tracking
        primaryPreceptorId,
        primaryPreceptorDays,
        continuityPercent,
        preceptorsUsedCount: preceptorsUsed.length,
      } as any,
    };
  }

  /**
   * Get team members sorted by priority, with fallback-only members at the end.
   *
   * Order:
   * 1. Primary members (isFallbackOnly = false, isGlobalFallbackOnly = false) sorted by priority
   * 2. Fallback-only members (isFallbackOnly = true OR isGlobalFallbackOnly = true) sorted by priority
   *
   * Falls back to all available preceptors sorted by load if no team exists.
   */
  private getTeamMembersSortedByPriority(
    context: StrategyContext
  ): Array<{ preceptorId: string; priority: number; teamId?: string; isFallbackOnly?: boolean }> {
    const { teams, availablePreceptors } = context;

    // Helper to check if a preceptor is fallback-only (either team-level or global)
    const isFallbackOnlyPreceptor = (preceptorId: string, teamMemberFallbackOnly?: boolean): boolean => {
      // Check global fallback flag on the preceptor
      const preceptor = availablePreceptors.find(p => p.id === preceptorId);
      if (preceptor?.isGlobalFallbackOnly) return true;
      // Check team-level fallback flag
      return teamMemberFallbackOnly ?? false;
    };

    // Look for a team associated with this clerkship
    const clerkshipTeam = teams?.find(team => {
      // Check if any team member is in available preceptors
      return team.members.some(m =>
        availablePreceptors.some(p => p.id === m.preceptorId)
      );
    });

    if (clerkshipTeam && clerkshipTeam.members.length > 0) {
      // Get available team members
      const availableMembers = clerkshipTeam.members
        .filter(m => availablePreceptors.some(p => p.id === m.preceptorId))
        .map(m => ({
          preceptorId: m.preceptorId,
          priority: m.priority,
          teamId: clerkshipTeam.id,
          isFallbackOnly: isFallbackOnlyPreceptor(m.preceptorId, m.isFallbackOnly),
        }));

      // Separate into primary and fallback-only members
      const primaryMembers = availableMembers
        .filter(m => !m.isFallbackOnly)
        .sort((a, b) => a.priority - b.priority);

      const fallbackOnlyMembers = availableMembers
        .filter(m => m.isFallbackOnly)
        .sort((a, b) => a.priority - b.priority);

      // Return primary members first, then fallback-only members
      return [...primaryMembers, ...fallbackOnlyMembers];
    }

    // No team found - treat all available preceptors as an implicit team
    // Filter out global fallback-only preceptors for primary selection
    const primaryPreceptors = availablePreceptors.filter(p => !p.isGlobalFallbackOnly);
    const fallbackOnlyPreceptors = availablePreceptors.filter(p => p.isGlobalFallbackOnly);

    // Sort by load (fewer assignments = higher priority)
    const sortedPrimary = this.sortByLoad(primaryPreceptors);
    const sortedFallback = this.sortByLoad(fallbackOnlyPreceptors);

    const result: Array<{ preceptorId: string; priority: number; teamId?: string; isFallbackOnly?: boolean }> = [];

    // Primary preceptors first
    sortedPrimary.forEach((p, index) => {
      result.push({
        preceptorId: p.id,
        priority: index + 1,
        teamId: undefined,
        isFallbackOnly: false,
      });
    });

    // Then fallback-only preceptors
    sortedFallback.forEach((p, index) => {
      result.push({
        preceptorId: p.id,
        priority: sortedPrimary.length + index + 1,
        teamId: undefined,
        isFallbackOnly: true,
      });
    });

    return result;
  }

  /**
   * Fill remaining days with any available preceptor.
   * Used when team members can't fully cover the requirement.
   */
  private fillRemainingDays(
    context: StrategyContext,
    availableDates: string[],
    daysNeeded: number,
    studentId: string,
    clerkshipId: string,
    requirementType: 'outpatient' | 'inpatient' | 'elective' | undefined,
    assignmentsPerPreceptor: Map<string, number>
  ): ReturnType<typeof this.createAssignment>[] {
    const { availablePreceptors } = context;
    const assignments: ReturnType<typeof this.createAssignment>[] = [];
    const usedDates = new Set<string>();

    // Sort preceptors by load
    const sortedPreceptors = this.sortByLoad(availablePreceptors);

    for (const date of availableDates) {
      if (assignments.length >= daysNeeded) break;
      if (usedDates.has(date)) continue;

      // Find first preceptor available on this date with capacity
      for (const preceptor of sortedPreceptors) {
        if (!preceptor.availability.includes(date)) continue;

        // Check daily capacity using context (includes pending assignments from batch)
        if (!this.hasDailyCapacity(context, preceptor, date)) continue;

        // Check yearly capacity including assignments made in this strategy run
        const strategyRunAssignments = assignmentsPerPreceptor.get(preceptor.id) ?? 0;
        const totalYearlyAssignments = preceptor.currentAssignmentCount + strategyRunAssignments;
        if (totalYearlyAssignments >= preceptor.maxStudentsPerYear) continue;

        assignments.push(
          this.createAssignment(studentId, preceptor.id, clerkshipId, date, {
            requirementType,
          })
        );

        // Track this assignment
        assignmentsPerPreceptor.set(preceptor.id, strategyRunAssignments + 1);

        usedDates.add(date);
        break; // Move to next date
      }
    }

    return assignments;
  }
}
