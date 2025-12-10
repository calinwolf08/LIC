/**
 * Team Service
 *
 * Manages preceptor teams with business rule validation (same health system, specialty, etc.).
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { PreceptorTeam, PreceptorTeamMember } from '$lib/features/scheduling-config/types';
import {
  preceptorTeamInputSchema,
  preceptorTeamMemberInputSchema,
  type PreceptorTeamInput,
  type PreceptorTeamMemberInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';

/**
 * Team with members aggregate
 */
export interface TeamWithMembers extends PreceptorTeam {
  members: PreceptorTeamMember[];
  sites?: Array<{ id: string; name: string }>;
  clerkshipName?: string;
}

/**
 * Team Service
 *
 * Provides CRUD operations for preceptor teams with validation
 * of team formation rules.
 */
export class TeamService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new team
   */
  async createTeam(clerkshipId: string, input: PreceptorTeamInput): Promise<ServiceResult<TeamWithMembers>> {
    // Validate input
    const validation = preceptorTeamInputSchema.safeParse(input);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid team data', validation.error.errors)
      );
    }

    try {
      // Check clerkship exists
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select('id')
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Validate team rules
      const validationResult = await this.validateTeamRules(input);
      if (!validationResult.success) {
        return Result.failure(validationResult.error);
      }

      // Create team in transaction
      return await this.db.transaction().execute(async (trx) => {
        const team = await trx
          .insertInto('preceptor_teams')
          .values({
            id: nanoid(),
            clerkship_id: clerkshipId,
            name: input.name || null,
            require_same_health_system: input.requireSameHealthSystem ? 1 : 0,
            require_same_site: input.requireSameSite ? 1 : 0,
            require_same_specialty: input.requireSameSpecialty ? 1 : 0,
            requires_admin_approval: input.requiresAdminApproval ? 1 : 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        // Create team members
        const members: PreceptorTeamMember[] = [];
        for (const memberInput of input.members) {
          const member = await trx
            .insertInto('preceptor_team_members')
            .values({
              id: nanoid(),
              team_id: team.id!,
              preceptor_id: memberInput.preceptorId,
              role: memberInput.role ?? null,
              priority: memberInput.priority,
              is_fallback_only: memberInput.isFallbackOnly ? 1 : 0,
              created_at: new Date().toISOString(),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

          members.push(this.mapTeamMember(member));
        }

        return Result.success({
          ...this.mapTeam(team),
          members,
        });
      });
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to create team', error));
    }
  }

  /**
   * Get team by ID with members
   */
  async getTeam(teamId: string): Promise<ServiceResult<TeamWithMembers | null>> {
    try {
      const team = await this.db
        .selectFrom('preceptor_teams')
        .selectAll()
        .where('id', '=', teamId)
        .executeTakeFirst();

      if (!team) {
        return Result.success(null);
      }

      const members = await this.db
        .selectFrom('preceptor_team_members')
        .selectAll()
        .where('team_id', '=', teamId)
        .orderBy('priority', 'asc')
        .execute();

      return Result.success({
        ...this.mapTeam(team),
        members: members.map(m => this.mapTeamMember(m)),
      });
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch team', error));
    }
  }

  /**
   * Get all teams for a clerkship
   */
  async getTeamsByClerkship(clerkshipId: string): Promise<ServiceResult<TeamWithMembers[]>> {
    try {
      const teams = await this.db
        .selectFrom('preceptor_teams')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      const teamsWithMembers: TeamWithMembers[] = [];
      for (const team of teams) {
        const members = await this.db
          .selectFrom('preceptor_team_members')
          .innerJoin('preceptors', 'preceptors.id', 'preceptor_team_members.preceptor_id')
          .select([
            'preceptor_team_members.id',
            'preceptor_team_members.team_id',
            'preceptor_team_members.preceptor_id',
            'preceptor_team_members.role',
            'preceptor_team_members.priority',
            'preceptor_team_members.is_fallback_only',
            'preceptor_team_members.created_at',
            'preceptors.name as preceptorName'
          ])
          .where('team_id', '=', team.id)
          .orderBy('priority', 'asc')
          .execute();

        teamsWithMembers.push({
          ...this.mapTeam(team),
          members: members.map((m: any) => ({
            ...this.mapTeamMember(m),
            preceptorName: m.preceptorName
          })),
        });
      }

      return Result.success(teamsWithMembers);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch teams', error));
    }
  }

  /**
   * Update team
   */
  async updateTeam(teamId: string, input: Partial<PreceptorTeamInput>): Promise<ServiceResult<TeamWithMembers>> {
    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('preceptor_teams')
        .selectAll()
        .where('id', '=', teamId)
        .executeTakeFirst();

      if (!existing) {
        return Result.failure(ServiceErrors.notFound('Team', teamId));
      }

      // Build update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) updateData.name = input.name || null;
      if (input.requireSameHealthSystem !== undefined)
        updateData.require_same_health_system = input.requireSameHealthSystem ? 1 : 0;
      if (input.requireSameSite !== undefined)
        updateData.require_same_site = input.requireSameSite ? 1 : 0;
      if (input.requireSameSpecialty !== undefined)
        updateData.require_same_specialty = input.requireSameSpecialty ? 1 : 0;
      if (input.requiresAdminApproval !== undefined)
        updateData.requires_admin_approval = input.requiresAdminApproval ? 1 : 0;

      // Validate team rules BEFORE starting transaction to avoid SQLite deadlock
      // (validateTeamRules uses this.db, not trx)
      if (input.members) {
        // First validate against schema (includes fallback-only validation)
        const teamForValidation = {
          ...input,
          members: input.members,
          requireSameHealthSystem: Boolean(updateData.require_same_health_system ?? existing.require_same_health_system),
          requireSameSite: Boolean(updateData.require_same_site ?? existing.require_same_site),
          requireSameSpecialty: Boolean(updateData.require_same_specialty ?? existing.require_same_specialty),
        } as PreceptorTeamInput;

        const schemaValidation = preceptorTeamInputSchema.safeParse(teamForValidation);
        if (!schemaValidation.success) {
          return Result.failure(
            ServiceErrors.validationError('Invalid team data', schemaValidation.error.errors)
          );
        }

        // Then validate team rules (health system, site, specialty)
        const validationResult = await this.validateTeamRules(teamForValidation);

        if (!validationResult.success) {
          return Result.failure(validationResult.error);
        }
      }

      return this.db.transaction().execute(async (trx) => {
        const updated = await trx
          .updateTable('preceptor_teams')
          .set(updateData)
          .where('id', '=', teamId)
          .returningAll()
          .executeTakeFirstOrThrow();

        // If members provided, update them
        let members: any[] = [];
        if (input.members) {
          // Delete existing members
          await trx.deleteFrom('preceptor_team_members').where('team_id', '=', teamId).execute();

          // Insert new members
          for (const memberInput of input.members) {
            const member = await trx
              .insertInto('preceptor_team_members')
              .values({
                id: nanoid(),
                team_id: teamId,
                preceptor_id: memberInput.preceptorId,
                role: memberInput.role ?? null,
                priority: memberInput.priority,
                is_fallback_only: memberInput.isFallbackOnly ? 1 : 0,
                created_at: new Date().toISOString(),
              })
              .returningAll()
              .executeTakeFirstOrThrow();

            members.push(member);
          }
        } else {
          // Get current members if not updating them
          members = await trx
            .selectFrom('preceptor_team_members')
            .selectAll()
            .where('team_id', '=', teamId)
            .orderBy('priority', 'asc')
            .execute();
        }

        return Result.success({
          ...this.mapTeam(updated),
          members: members.map(m => this.mapTeamMember(m)),
        });
      });
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to update team', error));
    }
  }

  /**
   * Delete team
   *
   * Business rule: Cannot delete if currently assigned to students
   */
  async deleteTeam(teamId: string): Promise<ServiceResult<boolean>> {
    try {
      // Check for assignments (would need assignments table)
      // For now, just delete

      await this.db.transaction().execute(async (trx) => {
        // Delete members first
        await trx.deleteFrom('preceptor_team_members').where('team_id', '=', teamId).execute();

        // Delete team
        const result = await trx.deleteFrom('preceptor_teams').where('id', '=', teamId).execute();

        if (result[0].numDeletedRows === BigInt(0)) {
          throw new Error('Team not found');
        }
      });

      return Result.success(true);
    } catch (error) {
      if (error instanceof Error && error.message === 'Team not found') {
        return Result.failure(ServiceErrors.notFound('Team', teamId));
      }
      return Result.failure(ServiceErrors.databaseError('Failed to delete team', error));
    }
  }

  /**
   * Add member to team
   */
  async addTeamMember(
    teamId: string,
    memberInput: PreceptorTeamMemberInput
  ): Promise<ServiceResult<PreceptorTeamMember>> {
    // Validate input
    const validation = preceptorTeamMemberInputSchema.safeParse(memberInput);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid team member data', validation.error.errors)
      );
    }

    try {
      // Check team exists
      const team = await this.db
        .selectFrom('preceptor_teams')
        .selectAll()
        .where('id', '=', teamId)
        .executeTakeFirst();

      if (!team) {
        return Result.failure(ServiceErrors.notFound('Team', teamId));
      }

      // Check preceptor exists
      const preceptor = await this.db
        .selectFrom('preceptors')
        .selectAll()
        .where('id', '=', memberInput.preceptorId)
        .executeTakeFirst();

      if (!preceptor) {
        return Result.failure(ServiceErrors.notFound('Preceptor', memberInput.preceptorId));
      }

      // Check for duplicate priority
      const existingPriority = await this.db
        .selectFrom('preceptor_team_members')
        .select('id')
        .where('team_id', '=', teamId)
        .where('priority', '=', memberInput.priority)
        .executeTakeFirst();

      if (existingPriority) {
        return Result.failure(
          ServiceErrors.conflict(`Priority ${memberInput.priority} already assigned in team`)
        );
      }

      // Check for duplicate preceptor
      const existingMember = await this.db
        .selectFrom('preceptor_team_members')
        .select('id')
        .where('team_id', '=', teamId)
        .where('preceptor_id', '=', memberInput.preceptorId)
        .executeTakeFirst();

      if (existingMember) {
        return Result.failure(ServiceErrors.conflict('Preceptor already in team'));
      }

      const member = await this.db
        .insertInto('preceptor_team_members')
        .values({
          id: nanoid(),
          team_id: teamId,
          preceptor_id: memberInput.preceptorId,
          role: memberInput.role || null,
          priority: memberInput.priority,
          is_fallback_only: memberInput.isFallbackOnly ? 1 : 0,
          created_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapTeamMember(member));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to add team member', error));
    }
  }

  /**
   * Remove member from team
   */
  async removeTeamMember(teamId: string, preceptorId: string): Promise<ServiceResult<boolean>> {
    try {
      // Check team has at least 3 members (will have 2 after removal)
      const memberCount = await this.db
        .selectFrom('preceptor_team_members')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('team_id', '=', teamId)
        .executeTakeFirst();

      if (!memberCount || memberCount.count < 3) {
        return Result.failure(
          ServiceErrors.conflict('Cannot remove member - team must have at least 2 members')
        );
      }

      const result = await this.db
        .deleteFrom('preceptor_team_members')
        .where('team_id', '=', teamId)
        .where('preceptor_id', '=', preceptorId)
        .execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        return Result.failure(
          ServiceErrors.notFound('Team member', `${teamId}/${preceptorId}`)
        );
      }

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to remove team member', error));
    }
  }

  /**
   * Validate team formation rules
   */
  async validateTeamRules(input: PreceptorTeamInput): Promise<ServiceResult<boolean>> {
    try {
      // Get all preceptors in team
      const preceptorIds = input.members.map(m => m.preceptorId);
      const preceptors = await this.db
        .selectFrom('preceptors')
        .selectAll()
        .where('id', 'in', preceptorIds)
        .execute();

      if (preceptors.length !== preceptorIds.length) {
        return Result.failure(ServiceErrors.conflict('One or more preceptors not found'));
      }

      // Check same health system if required
      if (input.requireSameHealthSystem) {
        const healthSystems = new Set(preceptors.map(p => p.health_system_id));
        const hasNull = preceptors.some(p => p.health_system_id === null);
        if (healthSystems.size > 1 || hasNull) {
          return Result.failure(
            ServiceErrors.conflict('All team members must be in the same health system')
          );
        }
      }

      // Check same site if required (via preceptor_sites junction table)
      if (input.requireSameSite) {
        // Get all sites for all team preceptors
        const preceptorSites = await this.db
          .selectFrom('preceptor_sites')
          .select(['preceptor_id', 'site_id'])
          .where('preceptor_id', 'in', preceptorIds)
          .execute();

        // Group sites by preceptor
        const sitesByPreceptor = new Map<string, Set<string>>();
        for (const ps of preceptorSites) {
          if (!sitesByPreceptor.has(ps.preceptor_id)) {
            sitesByPreceptor.set(ps.preceptor_id, new Set());
          }
          sitesByPreceptor.get(ps.preceptor_id)!.add(ps.site_id);
        }

        // Check if all preceptors share at least one common site
        const allPreceptorSiteSets = preceptorIds.map(id => sitesByPreceptor.get(id) || new Set<string>());

        // If any preceptor has no sites, they can't share a site
        if (allPreceptorSiteSets.some(sites => sites.size === 0)) {
          return Result.failure(
            ServiceErrors.conflict('All team members must be at the same site')
          );
        }

        // Find intersection of all site sets
        let commonSites = allPreceptorSiteSets[0];
        for (let i = 1; i < allPreceptorSiteSets.length; i++) {
          commonSites = new Set([...commonSites].filter(site => allPreceptorSiteSets[i].has(site)));
        }

        if (commonSites.size === 0) {
          return Result.failure(
            ServiceErrors.conflict('All team members must be at the same site')
          );
        }
      }

      // Note: Specialty validation removed - preceptors no longer have specialty field
      // The requireSameSpecialty option is kept for potential future use

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to validate team rules', error));
    }
  }

  /**
   * Map database row to PreceptorTeam type
   */
  private mapTeam(row: any): PreceptorTeam {
    return {
      id: row.id,
      clerkshipId: row.clerkship_id,
      name: row.name || undefined,
      requireSameHealthSystem: Boolean(row.require_same_health_system),
      requireSameSite: Boolean(row.require_same_site),
      requireSameSpecialty: Boolean(row.require_same_specialty),
      requiresAdminApproval: Boolean(row.requires_admin_approval),
      members: [], // Will be populated by caller
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to PreceptorTeamMember type
   */
  private mapTeamMember(row: any): PreceptorTeamMember {
    return {
      id: row.id,
      teamId: row.team_id,
      preceptorId: row.preceptor_id,
      role: row.role || undefined,
      priority: row.priority,
      isFallbackOnly: Boolean(row.is_fallback_only),
      createdAt: new Date(row.created_at),
    };
  }

  // ============================================================================
  // Multi-Site Management
  // ============================================================================

  /**
   * Get site IDs for a team
   */
  async getTeamSites(teamId: string): Promise<string[]> {
    const sites = await this.db
      .selectFrom('team_sites')
      .select('site_id')
      .where('team_id', '=', teamId)
      .execute();
    return sites.map((s) => s.site_id);
  }

  /**
   * Set sites for a team (replaces all existing)
   */
  async setTeamSites(teamId: string, siteIds: string[]): Promise<void> {
    // Delete existing associations
    await this.db.deleteFrom('team_sites').where('team_id', '=', teamId).execute();

    // Add new associations
    if (siteIds.length > 0) {
      await this.db
        .insertInto('team_sites')
        .values(
          siteIds.map((siteId) => ({
            team_id: teamId,
            site_id: siteId
          }))
        )
        .execute();
    }
  }

  /**
   * Get all teams with members, sites, and clerkship info
   * Optionally filter by clerkship
   */
  async getAllTeams(clerkshipId?: string): Promise<ServiceResult<TeamWithMembers[]>> {
    try {
      let query = this.db
        .selectFrom('preceptor_teams')
        .innerJoin('clerkships', 'clerkships.id', 'preceptor_teams.clerkship_id')
        .select([
          'preceptor_teams.id',
          'preceptor_teams.clerkship_id',
          'preceptor_teams.name',
          'preceptor_teams.require_same_health_system',
          'preceptor_teams.require_same_site',
          'preceptor_teams.require_same_specialty',
          'preceptor_teams.requires_admin_approval',
          'preceptor_teams.created_at',
          'preceptor_teams.updated_at',
          'clerkships.name as clerkship_name'
        ]);

      if (clerkshipId) {
        query = query.where('preceptor_teams.clerkship_id', '=', clerkshipId);
      }

      const teams = await query.execute();

      const teamsWithMembers: TeamWithMembers[] = [];
      for (const team of teams) {
        // Get members
        const members = await this.db
          .selectFrom('preceptor_team_members')
          .innerJoin('preceptors', 'preceptors.id', 'preceptor_team_members.preceptor_id')
          .select([
            'preceptor_team_members.id',
            'preceptor_team_members.team_id',
            'preceptor_team_members.preceptor_id',
            'preceptor_team_members.role',
            'preceptor_team_members.priority',
            'preceptor_team_members.is_fallback_only',
            'preceptor_team_members.created_at',
            'preceptors.name as preceptorName'
          ])
          .where('team_id', '=', team.id)
          .orderBy('priority', 'asc')
          .execute();

        // Get sites
        const sites = await this.db
          .selectFrom('team_sites')
          .innerJoin('sites', 'sites.id', 'team_sites.site_id')
          .select(['sites.id', 'sites.name'])
          .where('team_sites.team_id', '=', team.id)
          .execute();

        teamsWithMembers.push({
          ...this.mapTeam(team),
          clerkshipName: team.clerkship_name,
          members: members.map((m: any) => ({
            ...this.mapTeamMember(m),
            preceptorName: m.preceptorName
          })),
          sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
        });
      }

      return Result.success(teamsWithMembers);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch teams', error));
    }
  }

  /**
   * Create team with site IDs
   */
  async createTeamWithSites(
    clerkshipId: string,
    input: PreceptorTeamInput,
    siteIds: string[]
  ): Promise<ServiceResult<TeamWithMembers>> {
    const result = await this.createTeam(clerkshipId, input);
    if (!result.success) {
      return result;
    }

    // Set sites for the team
    if (siteIds.length > 0) {
      await this.setTeamSites(result.data.id, siteIds);
    }

    // Get sites to return
    const sites = await this.db
      .selectFrom('team_sites')
      .innerJoin('sites', 'sites.id', 'team_sites.site_id')
      .select(['sites.id', 'sites.name'])
      .where('team_sites.team_id', '=', result.data.id)
      .execute();

    return Result.success({
      ...result.data,
      sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
    });
  }

  /**
   * Update team with site IDs
   */
  async updateTeamWithSites(
    teamId: string,
    input: Partial<PreceptorTeamInput>,
    siteIds?: string[]
  ): Promise<ServiceResult<TeamWithMembers>> {
    const result = await this.updateTeam(teamId, input);
    if (!result.success) {
      return result;
    }

    // Update sites if provided
    if (siteIds !== undefined) {
      await this.setTeamSites(teamId, siteIds);
    }

    // Get sites to return
    const sites = await this.db
      .selectFrom('team_sites')
      .innerJoin('sites', 'sites.id', 'team_sites.site_id')
      .select(['sites.id', 'sites.name'])
      .where('team_sites.team_id', '=', teamId)
      .execute();

    return Result.success({
      ...result.data,
      sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
    });
  }
}
