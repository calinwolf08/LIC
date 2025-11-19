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

    // Get available preceptors
    const availablePreceptors = await this.buildAvailablePreceptors(
      clerkship,
      config,
      availableDates,
      options.requirementType
    );

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
    };
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

    // Generate date range
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const dates: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      if (!blackoutSet.has(dateStr)) {
        dates.push(dateStr);
      }
      current.setDate(current.getDate() + 1);
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
    requirementType?: 'outpatient' | 'inpatient' | 'elective'
  ): Promise<StrategyContext['availablePreceptors']> {
    // Get all preceptors
    let query = this.db.selectFrom('preceptors').selectAll();

    // Filter by specialty if configured
    if (clerkship.specialty) {
      query = query.where('specialty', '=', clerkship.specialty);
    }

    const preceptors = await query.execute();

    // For each preceptor, get availability and current assignments
    const result: StrategyContext['availablePreceptors'] = [];

    for (const preceptor of preceptors) {
      // Get preceptor availability
      const availability = await this.db
        .selectFrom('preceptor_availability')
        .select('date')
        .where('preceptor_id', '=', preceptor.id)
        .where('is_available', '=', 1)
        .execute();

      const availabilityDates = availability.map(a => a.date);

      // Get current assignment count
      const assignmentCount = await this.db
        .selectFrom('schedule_assignments')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('preceptor_id', '=', preceptor.id)
        .executeTakeFirst();

      // Get capacity rules (simplified - would need to resolve hierarchy)
      const capacityRule = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('preceptor_id', '=', preceptor.id)
        .where('clerkship_id', 'is', null)
        .where('requirement_type', 'is', null)
        .executeTakeFirst();

      // Skip preceptors without valid IDs
      if (!preceptor.id) continue;

      result.push({
        id: preceptor.id,
        name: preceptor.name,
        specialty: preceptor.specialty,
        healthSystemId: preceptor.health_system_id,
        siteId: preceptor.site_id,
        availability: availabilityDates,
        currentAssignmentCount: assignmentCount?.count ?? 0,
        maxStudentsPerDay: capacityRule?.max_students_per_day ?? 2,
        maxStudentsPerYear: capacityRule?.max_students_per_year ?? 20,
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
    sites: Map<string, { id: string; healthSystemId: string; name: string }>;
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
