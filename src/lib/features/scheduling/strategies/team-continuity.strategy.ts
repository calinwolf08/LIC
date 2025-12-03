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
    return config.assignmentStrategy === 'team_continuity';
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

    // For each team member by priority, assign their available days
    for (const member of teamMembers) {
      if (remainingDays <= 0) break;

      const preceptor = availablePreceptors.find(p => p.id === member.preceptorId);
      if (!preceptor) continue;

      // Track primary preceptor (first one we try to assign)
      if (primaryPreceptorId === null) {
        primaryPreceptorId = preceptor.id;
      }

      // Get preceptor's available dates that we haven't used yet
      const preceptorAvailableDates = preceptor.availability
        .filter(date => availableDates.includes(date) && !usedDates.has(date))
        .sort(); // Sort chronologically

      // Assign as many days as possible with this preceptor
      for (const date of preceptorAvailableDates) {
        if (remainingDays <= 0) break;

        // Check daily capacity
        const assignmentsOnDate = assignments.filter(
          a => a.preceptorId === preceptor.id && a.date === date
        ).length;

        if (assignmentsOnDate >= preceptor.maxStudentsPerDay) {
          continue; // Skip, preceptor at capacity for this day
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
        config.requirementType
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
   * Get team members sorted by priority.
   * Falls back to all available preceptors sorted by load if no team exists.
   */
  private getTeamMembersSortedByPriority(
    context: StrategyContext
  ): Array<{ preceptorId: string; priority: number; teamId?: string }> {
    const { teams, availablePreceptors, clerkship } = context;

    // Look for a team associated with this clerkship
    const clerkshipTeam = teams?.find(team => {
      // Check if any team member is in available preceptors
      return team.members.some(m =>
        availablePreceptors.some(p => p.id === m.preceptorId)
      );
    });

    if (clerkshipTeam && clerkshipTeam.members.length > 0) {
      // Return team members sorted by priority (lower = higher priority)
      return clerkshipTeam.members
        .filter(m => availablePreceptors.some(p => p.id === m.preceptorId))
        .sort((a, b) => a.priority - b.priority)
        .map(m => ({
          preceptorId: m.preceptorId,
          priority: m.priority,
          teamId: clerkshipTeam.id,
        }));
    }

    // No team found - treat all available preceptors as an implicit team
    // Sort by load (fewer assignments = higher priority)
    const sortedPreceptors = this.sortByLoad(availablePreceptors);

    return sortedPreceptors.map((p, index) => ({
      preceptorId: p.id,
      priority: index + 1, // Assign priority based on load order
      teamId: undefined,
    }));
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
    requirementType?: 'outpatient' | 'inpatient' | 'elective'
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

        // Check capacity
        const assignmentsOnDate = assignments.filter(
          a => a.preceptorId === preceptor.id && a.date === date
        ).length;

        if (assignmentsOnDate >= preceptor.maxStudentsPerDay) continue;

        assignments.push(
          this.createAssignment(studentId, preceptor.id, clerkshipId, date, {
            requirementType,
          })
        );

        usedDates.add(date);
        break; // Move to next date
      }
    }

    return assignments;
  }
}
