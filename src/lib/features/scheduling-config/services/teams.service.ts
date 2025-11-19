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
  async createTeam(clerkshipId: string, input: PreceptorTeamInput): ServiceResult<TeamWithMembers> {
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
            require_same_health_system: input.requireSameHealthSystem ?? false,
            require_same_site: input.requireSameSite ?? false,
            require_same_specialty: input.requireSameSpecialty ?? false,
            requires_admin_approval: input.requiresAdminApproval ?? false,
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
              team_id: team.id,
              preceptor_id: memberInput.preceptorId,
              role: memberInput.role || null,
              priority: memberInput.priority,
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
  async getTeam(teamId: string): ServiceResult<TeamWithMembers | null> {
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
  async getTeamsByClerkship(clerkshipId: string): ServiceResult<TeamWithMembers[]> {
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
          .selectAll()
          .where('team_id', '=', team.id)
          .orderBy('priority', 'asc')
          .execute();

        teamsWithMembers.push({
          ...this.mapTeam(team),
          members: members.map(m => this.mapTeamMember(m)),
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
  async updateTeam(teamId: string, input: Partial<PreceptorTeamInput>): ServiceResult<TeamWithMembers> {
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
        updateData.require_same_health_system = input.requireSameHealthSystem;
      if (input.requireSameSite !== undefined) updateData.require_same_site = input.requireSameSite;
      if (input.requireSameSpecialty !== undefined)
        updateData.require_same_specialty = input.requireSameSpecialty;
      if (input.requiresAdminApproval !== undefined)
        updateData.requires_admin_approval = input.requiresAdminApproval;

      const updated = await this.db
        .updateTable('preceptor_teams')
        .set(updateData)
        .where('id', '=', teamId)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Get current members
      const members = await this.db
        .selectFrom('preceptor_team_members')
        .selectAll()
        .where('team_id', '=', teamId)
        .orderBy('priority', 'asc')
        .execute();

      // If members updated, validate team rules
      if (input.members) {
        const validationResult = await this.validateTeamRules({
          ...input,
          members: input.members,
          requireSameHealthSystem: updateData.require_same_health_system ?? existing.require_same_health_system,
          requireSameSite: updateData.require_same_site ?? existing.require_same_site,
          requireSameSpecialty: updateData.require_same_specialty ?? existing.require_same_specialty,
        } as PreceptorTeamInput);

        if (!validationResult.success) {
          return Result.failure(validationResult.error);
        }
      }

      return Result.success({
        ...this.mapTeam(updated),
        members: members.map(m => this.mapTeamMember(m)),
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
  async deleteTeam(teamId: string): ServiceResult<boolean> {
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
  ): ServiceResult<PreceptorTeamMember> {
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
  async removeTeamMember(teamId: string, preceptorId: string): ServiceResult<boolean> {
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
  async validateTeamRules(input: PreceptorTeamInput): ServiceResult<boolean> {
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
        if (healthSystems.size > 1 || healthSystems.has(null)) {
          return Result.failure(
            ServiceErrors.conflict('All team members must be in the same health system')
          );
        }
      }

      // Check same site if required
      if (input.requireSameSite) {
        const sites = new Set(preceptors.map(p => p.site_id));
        if (sites.size > 1 || sites.has(null)) {
          return Result.failure(
            ServiceErrors.conflict('All team members must be at the same site')
          );
        }
      }

      // Check same specialty if required
      if (input.requireSameSpecialty) {
        const specialties = new Set(preceptors.map(p => p.specialty));
        if (specialties.size > 1) {
          return Result.failure(
            ServiceErrors.conflict('All team members must have the same specialty')
          );
        }
      }

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
      createdAt: new Date(row.created_at),
    };
  }
}
