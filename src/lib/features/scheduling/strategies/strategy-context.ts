/**
 * Strategy Context Builder
 *
 * Assembles all information needed by scheduling strategies.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Student } from '$lib/features/students/types';
import type { Clerkship } from '$lib/features/clerkships/types';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';
import type { StrategyContext } from './base-strategy';

/**
 * Pending assignment from current scheduling batch
 */
export interface PendingAssignment {
  studentId: string;
  preceptorId: string;
  clerkshipId: string;
  date: string;
}

/**
 * Strategy Context Builder
 *
 * Fetches and assembles all data needed for scheduling strategies.
 */
export class StrategyContextBuilder {
  constructor(private db: Kysely<DB>) {}

  /**
   * Build complete strategy context
   */
  async buildContext(
    student: Student,
    clerkship: Clerkship,
    config: ResolvedRequirementConfiguration,
    options: {
      startDate?: string;
      endDate?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      pendingAssignments?: PendingAssignment[];
    } = {}
  ): Promise<StrategyContext> {
    if (!clerkship.id) {
      throw new Error('Clerkship must have a valid ID');
    }

    // Build available dates
    const availableDates = await this.buildAvailableDates(
      clerkship,
      student,
      options.startDate,
      options.endDate
    );

    // Get available preceptors (with pending assignment counts)
    const pendingAssignments = options.pendingAssignments ?? [];
    const availablePreceptors = await this.buildAvailablePreceptors(
      clerkship,
      config,
      availableDates,
      options.requirementType,
      pendingAssignments
    );

    // Build daily assignment counts per preceptor (includes both DB and pending)
    const assignmentsByPreceptorDate = await this.buildAssignmentsByPreceptorDate(pendingAssignments);

    // Get teams if needed
    const teams = await this.buildTeams(clerkship.id);

    // Get existing assignments
    const existingAssignments = await this.buildExistingAssignments();

    // Get health systems
    const { healthSystems, sites } = await this.buildHealthSystemInfo();

    return {
      student,
      clerkship,
      config,
      availableDates,
      availablePreceptors,
      teams,
      existingAssignments,
      healthSystems,
      sites,
      assignmentsByPreceptorDate,
    };
  }

  /**
   * Build daily assignment counts per preceptor from both DB and pending assignments
   */
  private async buildAssignmentsByPreceptorDate(
    pendingAssignments: PendingAssignment[]
  ): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();

    // First, load existing assignments from the database
    const dbAssignments = await this.db
      .selectFrom('schedule_assignments')
      .select(['preceptor_id', 'date'])
      .execute();

    // Add DB assignments to the map
    for (const assignment of dbAssignments) {
      if (!result.has(assignment.preceptor_id)) {
        result.set(assignment.preceptor_id, new Map());
      }
      const dateMap = result.get(assignment.preceptor_id)!;
      const currentCount = dateMap.get(assignment.date) ?? 0;
      dateMap.set(assignment.date, currentCount + 1);
    }

    // Then add pending assignments from the current batch
    for (const assignment of pendingAssignments) {
      if (!result.has(assignment.preceptorId)) {
        result.set(assignment.preceptorId, new Map());
      }
      const dateMap = result.get(assignment.preceptorId)!;
      const currentCount = dateMap.get(assignment.date) ?? 0;
      dateMap.set(assignment.date, currentCount + 1);
    }

    return result;
  }

  /**
   * Build list of available dates (excluding blackouts)
   */
  private async buildAvailableDates(
    clerkship: Clerkship,
    student: Student,
    startDate?: string,
    endDate?: string
  ): Promise<string[]> {
    // Get blackout dates
    const blackouts = await this.db
      .selectFrom('blackout_dates')
      .select('date')
      .execute();

    const blackoutSet = new Set(blackouts.map(b => b.date));

    // Generate date range using UTC to avoid timezone issues
    const start = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    const end = endDate
      ? new Date(endDate + 'T00:00:00.000Z')
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const dates: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      if (!blackoutSet.has(dateStr)) {
        dates.push(dateStr);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  /**
   * Build list of available preceptors with their availability
   */
  private async buildAvailablePreceptors(
    clerkship: Clerkship,
    config: ResolvedRequirementConfiguration,
    availableDates: string[],
    requirementType: 'outpatient' | 'inpatient' | 'elective' | undefined,
    pendingAssignments: PendingAssignment[]
  ): Promise<StrategyContext['availablePreceptors']> {
    // Get preceptors who are members of teams for this clerkship
    // Team membership is the authoritative source for clerkship associations
    const teamMemberPreceptorIds = await this.db
      .selectFrom('preceptor_team_members')
      .innerJoin('preceptor_teams', 'preceptor_teams.id', 'preceptor_team_members.team_id')
      .select('preceptor_team_members.preceptor_id')
      .where('preceptor_teams.clerkship_id', '=', clerkship.id!)
      .execute();

    const validPreceptorIds = new Set(teamMemberPreceptorIds.map(r => r.preceptor_id));

    let preceptors;
    if (validPreceptorIds.size > 0) {
      // Filter to only preceptors associated with this clerkship via team membership
      preceptors = await this.db
        .selectFrom('preceptors')
        .selectAll()
        .where('id', 'in', [...validPreceptorIds])
        .execute();
    } else {
      // No team associations for this clerkship - no preceptors available
      // Teams must be set up for proper clerkship-preceptor associations
      preceptors = [];
    }

    // Count pending assignments per preceptor (for yearly capacity)
    const pendingCountByPreceptor = new Map<string, number>();
    for (const pending of pendingAssignments) {
      const current = pendingCountByPreceptor.get(pending.preceptorId) ?? 0;
      pendingCountByPreceptor.set(pending.preceptorId, current + 1);
    }

    // For each preceptor, get availability and current assignments
    const result: StrategyContext['availablePreceptors'] = [];

    for (const preceptor of preceptors) {
      // Get preceptor availability with site info
      const availability = await this.db
        .selectFrom('preceptor_availability')
        .select(['date', 'site_id'])
        .where('preceptor_id', '=', preceptor.id)
        .where('is_available', '=', 1)
        .execute();

      const availabilityDates = availability.map(a => a.date);

      // Get current assignment count from database
      const dbAssignmentCount = await this.db
        .selectFrom('schedule_assignments')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('preceptor_id', '=', preceptor.id)
        .executeTakeFirst();

      // Add pending assignments to get total current count
      const dbCount = dbAssignmentCount?.count ?? 0;
      const pendingCount = pendingCountByPreceptor.get(preceptor.id) ?? 0;
      const totalAssignmentCount = dbCount + pendingCount;

      // Get capacity rules (simplified - would need to resolve hierarchy)
      const capacityRule = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('preceptor_id', '=', preceptor.id)
        .where('clerkship_id', 'is', null)
        .where('requirement_type', 'is', null)
        .executeTakeFirst();

      // Get preceptor's sites (from preceptor_sites table)
      const preceptorSites = await this.db
        .selectFrom('preceptor_sites')
        .select('site_id')
        .where('preceptor_id', '=', preceptor.id)
        .execute();

      // Skip preceptors without valid IDs
      if (!preceptor.id) continue;

      result.push({
        id: preceptor.id,
        name: preceptor.name,
        healthSystemId: preceptor.health_system_id,
        siteId: preceptorSites[0]?.site_id ?? null, // Use first site for backwards compat
        siteIds: preceptorSites.map(ps => ps.site_id),
        availability: availabilityDates,
        currentAssignmentCount: totalAssignmentCount,
        maxStudentsPerDay: capacityRule?.max_students_per_day ?? 2,
        maxStudentsPerYear: capacityRule?.max_students_per_year ?? 20,
        isGlobalFallbackOnly: Boolean(preceptor.is_global_fallback_only),
      });
    }

    return result;
  }

  /**
   * Build team configurations
   */
  private async buildTeams(clerkshipId: string): Promise<StrategyContext['teams']> {
    const teams = await this.db
      .selectFrom('preceptor_teams')
      .selectAll()
      .where('clerkship_id', '=', clerkshipId)
      .execute();

    const result: StrategyContext['teams'] = [];

    for (const team of teams) {
      // Skip teams without valid IDs
      if (!team.id) continue;

      const members = await this.db
        .selectFrom('preceptor_team_members')
        .selectAll()
        .where('team_id', '=', team.id)
        .orderBy('priority', 'asc')
        .execute();

      result.push({
        id: team.id,
        members: members.map(m => ({
          preceptorId: m.preceptor_id,
          priority: m.priority,
          role: m.role || undefined,
          isFallbackOnly: Boolean(m.is_fallback_only),
        })),
        requireSameHealthSystem: Boolean(team.require_same_health_system),
        requireSameSite: Boolean(team.require_same_site),
        requireSameSpecialty: Boolean(team.require_same_specialty),
      });
    }

    return result.length > 0 ? result : undefined;
  }

  /**
   * Build existing assignments
   */
  private async buildExistingAssignments(): Promise<StrategyContext['existingAssignments']> {
    const assignments = await this.db
      .selectFrom('schedule_assignments')
      .select(['student_id', 'preceptor_id', 'date'])
      .execute();

    return assignments.map(a => ({
      studentId: a.student_id,
      preceptorId: a.preceptor_id,
      date: a.date,
    }));
  }

  /**
   * Build health system and site information
   */
  private async buildHealthSystemInfo(): Promise<{
    healthSystems: Map<string, { id: string; name: string }>;
    sites: Map<string, { id: string; healthSystemId: string | null; name: string }>;
  }> {
    const healthSystems = await this.db.selectFrom('health_systems').selectAll().execute();

    const sites = await this.db.selectFrom('sites').selectAll().execute();

    return {
      healthSystems: new Map(
        healthSystems
          .filter(hs => hs.id !== null)
          .map(hs => [hs.id as string, { id: hs.id as string, name: hs.name }])
      ),
      sites: new Map(
        sites
          .filter(s => s.id !== null)
          .map(s => [
            s.id as string,
            { id: s.id as string, healthSystemId: s.health_system_id, name: s.name },
          ])
      ),
    };
  }
}
