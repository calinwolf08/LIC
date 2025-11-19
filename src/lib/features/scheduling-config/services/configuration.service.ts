/**
 * Configuration Service
 *
 * Orchestrates all configuration services for complete clerkship configuration management.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { CompleteClerkshipConfiguration } from '../types/aggregates';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { RequirementService } from './requirements.service';
import { ElectiveService } from './electives.service';
import { TeamService } from './teams.service';

/**
 * Configuration Service
 *
 * High-level service that orchestrates operations across multiple
 * configuration services to provide complete configuration management.
 */
export class ConfigurationService {
  private requirementService: RequirementService;
  private electiveService: ElectiveService;
  private teamService: TeamService;

  constructor(private db: Kysely<DB>) {
    this.requirementService = new RequirementService(db);
    this.electiveService = new ElectiveService(db);
    this.teamService = new TeamService(db);
  }

  /**
   * Get complete configuration for a clerkship
   *
   * Fetches clerkship with all related entities (requirements, electives, teams)
   */
  async getCompleteConfiguration(
    clerkshipId: string
  ): ServiceResult<CompleteClerkshipConfiguration | null> {
    try {
      // Get clerkship
      const clerkship = await this.db
        .selectFrom('clerkships')
        .selectAll()
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship || !clerkship.id) {
        return Result.success(null);
      }

      // Get requirements
      const requirementsResult = await this.requirementService.getRequirementsByClerkship(clerkshipId);
      if (!requirementsResult.success) {
        return Result.failure(requirementsResult.error);
      }

      // Get electives for each requirement
      const requirements = [];
      for (const requirement of requirementsResult.data) {
        let electives: any[] = [];
        if (requirement.requirementType === 'elective') {
          const electivesResult = await this.electiveService.getElectivesByRequirement(requirement.id);
          if (electivesResult.success) {
            electives = electivesResult.data;
          }
        }

        requirements.push({
          requirement,
          resolvedConfig: {} as any, // Would need to implement config resolution
          electives: electives.length > 0 ? electives : undefined,
        });
      }

      // Get teams
      const teamsResult = await this.teamService.getTeamsByClerkship(clerkshipId);
      const teams = teamsResult.success ? teamsResult.data : undefined;

      // Calculate total required days
      const totalRequiredDays = requirementsResult.data.reduce(
        (sum, req) => sum + req.requiredDays,
        0
      );

      return Result.success({
        clerkshipId: clerkship.id,
        clerkshipName: clerkship.name,
        totalRequiredDays,
        requirements,
        teams,
      });
    } catch (error) {
      return Result.failure(
        ServiceErrors.databaseError('Failed to fetch complete configuration', error)
      );
    }
  }

  /**
   * Validate complete configuration
   *
   * Checks if configuration is complete and valid for scheduling
   */
  async validateConfiguration(
    clerkshipId: string
  ): ServiceResult<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check clerkship exists
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select(['id', 'required_days'])
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Validate requirement split
      const splitResult = await this.requirementService.validateRequirementSplit(clerkshipId);
      if (!splitResult.success) {
        return Result.failure(splitResult.error);
      }

      if (!splitResult.data.valid) {
        errors.push(
          `Requirement days (${splitResult.data.totalRequiredDays}) do not match clerkship total (${splitResult.data.clerkshipTotalDays})`
        );
      }

      // Check each requirement has necessary configuration
      const requirementsResult = await this.requirementService.getRequirementsByClerkship(clerkshipId);
      if (!requirementsResult.success) {
        return Result.failure(requirementsResult.error);
      }

      if (requirementsResult.data.length === 0 && clerkship.required_days > 0) {
        errors.push('Clerkship has required days but no requirements defined');
      }

      // Check elective requirements have electives
      for (const requirement of requirementsResult.data) {
        if (requirement.requirementType === 'elective') {
          const electivesResult = await this.electiveService.getElectivesByRequirement(requirement.id);
          if (electivesResult.success && electivesResult.data.length === 0) {
            errors.push(
              `Elective requirement ${requirement.id} has no elective options defined`
            );
          }
        }
      }

      return Result.success({
        valid: errors.length === 0,
        errors,
      });
    } catch (error) {
      return Result.failure(
        ServiceErrors.databaseError('Failed to validate configuration', error)
      );
    }
  }

  /**
   * Clone configuration from one clerkship to another
   *
   * Copies all requirements, electives, and teams
   */
  async cloneConfiguration(
    sourceClerkshipId: string,
    targetClerkshipId: string
  ): ServiceResult<boolean> {
    try {
      // Verify both clerkships exist
      const sourceClerkship = await this.db
        .selectFrom('clerkships')
        .select('id')
        .where('id', '=', sourceClerkshipId)
        .executeTakeFirst();

      if (!sourceClerkship) {
        return Result.failure(ServiceErrors.notFound('Source clerkship', sourceClerkshipId));
      }

      const targetClerkship = await this.db
        .selectFrom('clerkships')
        .select('id')
        .where('id', '=', targetClerkshipId)
        .executeTakeFirst();

      if (!targetClerkship) {
        return Result.failure(ServiceErrors.notFound('Target clerkship', targetClerkshipId));
      }

      // Get complete source configuration
      const configResult = await this.getCompleteConfiguration(sourceClerkshipId);
      if (!configResult.success) {
        return Result.failure(configResult.error);
      }

      if (!configResult.data) {
        return Result.failure(ServiceErrors.notFound('Source configuration', sourceClerkshipId));
      }

      // Clone in transaction
      await this.db.transaction().execute(async (trx) => {
        // Clone requirements
        for (const req of configResult.data!.requirements) {
          const reqInput = {
            requirementType: req.requirement.requirementType,
            requiredDays: req.requirement.requiredDays,
            overrideMode: req.requirement.overrideMode,
            overrideAssignmentStrategy: req.requirement.overrideAssignmentStrategy,
            overrideHealthSystemRule: req.requirement.overrideHealthSystemRule,
            // ... other override fields
            clerkshipId: targetClerkshipId,
          };

          const newReqService = new RequirementService(trx);
          const newReqResult = await newReqService.createRequirement(reqInput);

          // Clone electives if any
          if (req.electives && newReqResult.success) {
            const electiveService = new ElectiveService(trx);
            for (const elective of req.electives) {
              await electiveService.createElective(newReqResult.data.id, {
                name: elective.name,
                minimumDays: elective.minimumDays,
                specialty: elective.specialty,
                availablePreceptorIds: elective.availablePreceptorIds,
              });
            }
          }
        }

        // Clone teams
        if (configResult.data!.teams) {
          const teamService = new TeamService(trx);
          for (const team of configResult.data!.teams) {
            await teamService.createTeam(targetClerkshipId, {
              name: team.name,
              requireSameHealthSystem: team.requireSameHealthSystem,
              requireSameSite: team.requireSameSite,
              requireSameSpecialty: team.requireSameSpecialty,
              requiresAdminApproval: team.requiresAdminApproval,
              members: team.members.map(m => ({
                preceptorId: m.preceptorId,
                role: m.role,
                priority: m.priority,
              })),
            });
          }
        }
      });

      return Result.success(true);
    } catch (error) {
      return Result.failure(
        ServiceErrors.databaseError('Failed to clone configuration', error)
      );
    }
  }

  /**
   * Delete entire configuration for a clerkship
   */
  async deleteConfiguration(clerkshipId: string): ServiceResult<boolean> {
    try {
      // Check for active assignments (would need assignments table)
      // For now, just delete

      await this.db.transaction().execute(async (trx) => {
        // Delete electives first
        const requirements = await trx
          .selectFrom('clerkship_requirements')
          .select('id')
          .where('clerkship_id', '=', clerkshipId)
          .execute();

        for (const req of requirements) {
          await trx.deleteFrom('clerkship_electives').where('requirement_id', '=', req.id).execute();
        }

        // Delete requirements
        await trx.deleteFrom('clerkship_requirements').where('clerkship_id', '=', clerkshipId).execute();

        // Delete team members
        const teams = await trx
          .selectFrom('preceptor_teams')
          .select('id')
          .where('clerkship_id', '=', clerkshipId)
          .execute();

        for (const team of teams) {
          await trx.deleteFrom('preceptor_team_members').where('team_id', '=', team.id).execute();
        }

        // Delete teams
        await trx.deleteFrom('preceptor_teams').where('clerkship_id', '=', clerkshipId).execute();
      });

      return Result.success(true);
    } catch (error) {
      return Result.failure(
        ServiceErrors.databaseError('Failed to delete configuration', error)
      );
    }
  }
}
