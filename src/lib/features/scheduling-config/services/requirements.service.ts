/**
 * Requirement Service
 *
 * Manages clerkship requirements (outpatient/inpatient/elective splits) with validation.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { ClerkshipRequirement } from '$lib/features/scheduling-config/types';
import {
  requirementInputSchema,
  type RequirementInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling-config:requirements');

/**
 * Requirement Service
 *
 * Provides CRUD operations for clerkship requirements with validation
 * of requirement splits and business rules.
 */
export class RequirementService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new requirement
   */
  async createRequirement(input: RequirementInput): Promise<ServiceResult<ClerkshipRequirement>> {
    log.debug('Creating requirement', {
      clerkshipId: input.clerkshipId,
      requirementType: input.requirementType,
      requiredDays: input.requiredDays
    });

    // Validate input
    const validation = requirementInputSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Requirement creation validation failed', {
        clerkshipId: input.clerkshipId,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid requirement data', validation.error.errors)
      );
    }

    try {
      const requirement = await this.db
        .insertInto('clerkship_requirements')
        .values({
          id: nanoid(),
          clerkship_id: input.clerkshipId,
          requirement_type: input.requirementType,
          required_days: input.requiredDays,
          override_mode: input.overrideMode,
          override_assignment_strategy: input.overrideAssignmentStrategy || null,
          override_health_system_rule: input.overrideHealthSystemRule || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Requirement created', {
        id: requirement.id,
        clerkshipId: requirement.clerkship_id,
        requirementType: requirement.requirement_type,
        requiredDays: requirement.required_days,
        overrideMode: requirement.override_mode
      });

      return Result.success(this.mapRequirement(requirement));
    } catch (error) {
      log.error('Failed to create requirement', { clerkshipId: input.clerkshipId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to create requirement', error));
    }
  }

  /**
   * Get requirement by ID
   */
  async getRequirement(id: string): Promise<ServiceResult<ClerkshipRequirement | null>> {
    log.debug('Fetching requirement', { id });

    try {
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!requirement) {
        log.debug('Requirement not found', { id });
        return Result.success(null);
      }

      log.info('Requirement fetched', {
        id: requirement.id,
        clerkshipId: requirement.clerkship_id,
        requirementType: requirement.requirement_type
      });

      return Result.success(this.mapRequirement(requirement));
    } catch (error) {
      log.error('Failed to fetch requirement', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch requirement', error));
    }
  }

  /**
   * Get all requirements for a clerkship
   */
  async getRequirementsByClerkship(clerkshipId: string): Promise<ServiceResult<ClerkshipRequirement[]>> {
    log.debug('Fetching requirements for clerkship', { clerkshipId });

    try {
      const requirements = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      log.info('Requirements fetched for clerkship', {
        clerkshipId,
        requirementCount: requirements.length,
        requirementTypes: requirements.map(r => r.requirement_type)
      });

      return Result.success(requirements.map(r => this.mapRequirement(r)));
    } catch (error) {
      log.error('Failed to fetch requirements for clerkship', { clerkshipId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch requirements', error));
    }
  }

  /**
   * Update requirement
   */
  async updateRequirement(
    id: string,
    input: Partial<RequirementInput>
  ): Promise<ServiceResult<ClerkshipRequirement>> {
    log.debug('Updating requirement', { id, updates: Object.keys(input) });

    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        log.warn('Requirement not found for update', { id });
        return Result.failure(ServiceErrors.notFound('Requirement', id));
      }

      // Build merged requirement for validation
      const mergedRequirement: any = {
        clerkshipId: input.clerkshipId ?? existing.clerkship_id,
        requirementType: input.requirementType ?? existing.requirement_type,
        requiredDays: input.requiredDays ?? existing.required_days,
        overrideMode: input.overrideMode ?? existing.override_mode,
      };

      // Add optional override fields only if they have values (not null/undefined)
      const assignmentStrategy = input.overrideAssignmentStrategy ?? existing.override_assignment_strategy;
      if (assignmentStrategy) mergedRequirement.overrideAssignmentStrategy = assignmentStrategy;

      const healthSystemRule = input.overrideHealthSystemRule ?? existing.override_health_system_rule;
      if (healthSystemRule) mergedRequirement.overrideHealthSystemRule = healthSystemRule;

      // Validate merged requirement
      const validation = requirementInputSchema.safeParse(mergedRequirement);
      if (!validation.success) {
        log.warn('Requirement update validation failed', {
          id,
          errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
        return Result.failure(
          ServiceErrors.validationError('Invalid requirement update', validation.error.errors)
        );
      }

      // Build update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.requiredDays !== undefined) updateData.required_days = input.requiredDays;
      if (input.overrideMode !== undefined) updateData.override_mode = input.overrideMode;
      if (input.overrideAssignmentStrategy !== undefined)
        updateData.override_assignment_strategy = input.overrideAssignmentStrategy || null;
      if (input.overrideHealthSystemRule !== undefined)
        updateData.override_health_system_rule = input.overrideHealthSystemRule || null;
      if (input.overrideMaxStudentsPerDay !== undefined)
        updateData.override_max_students_per_day = input.overrideMaxStudentsPerDay || null;
      if (input.overrideMaxStudentsPerYear !== undefined)
        updateData.override_max_students_per_year = input.overrideMaxStudentsPerYear || null;
      if (input.overrideMaxStudentsPerBlock !== undefined)
        updateData.override_max_students_per_block = input.overrideMaxStudentsPerBlock || null;
      if (input.overrideMaxBlocksPerYear !== undefined)
        updateData.override_max_blocks_per_year = input.overrideMaxBlocksPerYear || null;
      if (input.overrideBlockSizeDays !== undefined)
        updateData.override_block_length_days = input.overrideBlockSizeDays || null;
      if (input.overrideAllowPartialBlocks !== undefined)
        updateData.override_allow_partial_blocks = input.overrideAllowPartialBlocks;
      if (input.overridePreferContinuousBlocks !== undefined)
        updateData.override_prefer_continuous_blocks = input.overridePreferContinuousBlocks;
      if (input.overrideAllowTeams !== undefined)
        updateData.override_allow_teams = input.overrideAllowTeams;
      if (input.overrideAllowFallbacks !== undefined)
        updateData.override_allow_fallbacks = input.overrideAllowFallbacks;
      if (input.overrideFallbackRequiresApproval !== undefined)
        updateData.override_fallback_requires_approval = input.overrideFallbackRequiresApproval;
      if (input.overrideFallbackAllowCrossSystem !== undefined)
        updateData.override_fallback_allow_cross_system = input.overrideFallbackAllowCrossSystem;

      const updated = await this.db
        .updateTable('clerkship_requirements')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Requirement updated', {
        id: updated.id,
        clerkshipId: updated.clerkship_id,
        requirementType: updated.requirement_type,
        updatedFields: Object.keys(updateData).filter(k => k !== 'updated_at')
      });

      return Result.success(this.mapRequirement(updated));
    } catch (error) {
      log.error('Failed to update requirement', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to update requirement', error));
    }
  }

  /**
   * Delete requirement
   */
  async deleteRequirement(id: string): Promise<ServiceResult<boolean>> {
    log.debug('Deleting requirement', { id });

    try {
      // Check for dependent electives
      const electiveCount = await this.db
        .selectFrom('clerkship_electives')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('requirement_id', '=', id)
        .executeTakeFirst();

      if (electiveCount && electiveCount.count > 0) {
        log.warn('Requirement deletion blocked by dependencies', {
          id,
          electiveCount: electiveCount.count
        });
        return Result.failure(
          ServiceErrors.dependencyError('Requirement', 'electives', {
            electiveCount: electiveCount.count,
          })
        );
      }

      const result = await this.db.deleteFrom('clerkship_requirements').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        log.warn('Requirement not found for deletion', { id });
        return Result.failure(ServiceErrors.notFound('Requirement', id));
      }

      log.info('Requirement deleted', { id });
      return Result.success(true);
    } catch (error) {
      log.error('Failed to delete requirement', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to delete requirement', error));
    }
  }

  /**
   * Validate that requirement days sum to clerkship total
   *
   * Business rule: Total required days must equal clerkship.required_days
   */
  async validateRequirementSplit(clerkshipId: string): Promise<ServiceResult<{
    valid: boolean;
    totalRequiredDays: number;
    clerkshipTotalDays: number;
  }>> {
    log.debug('Validating requirement split', { clerkshipId });

    try {
      // Get clerkship total days
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select('required_days')
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        log.warn('Clerkship not found for requirement split validation', { clerkshipId });
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Sum requirement days
      const requirements = await this.db
        .selectFrom('clerkship_requirements')
        .select('required_days')
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      const totalRequiredDays = requirements.reduce((sum, req) => sum + req.required_days, 0);
      const valid = totalRequiredDays === clerkship.required_days;

      log.info('Requirement split validated', {
        clerkshipId,
        valid,
        totalRequiredDays,
        clerkshipTotalDays: clerkship.required_days,
        requirementCount: requirements.length
      });

      return Result.success({
        valid,
        totalRequiredDays,
        clerkshipTotalDays: clerkship.required_days,
      });
    } catch (error) {
      log.error('Failed to validate requirement split', { clerkshipId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to validate requirement split', error));
    }
  }

  /**
   * Map database row to ClerkshipRequirement type
   */
  private mapRequirement(row: any): ClerkshipRequirement {
    return {
      id: row.id,
      clerkshipId: row.clerkship_id,
      requirementType: row.requirement_type,
      requiredDays: row.required_days,
      overrideMode: row.override_mode,
      overrideAssignmentStrategy: row.override_assignment_strategy || undefined,
      overrideHealthSystemRule: row.override_health_system_rule || undefined,
      overrideMaxStudentsPerDay: row.override_max_students_per_day || undefined,
      overrideMaxStudentsPerYear: row.override_max_students_per_year || undefined,
      overrideMaxStudentsPerBlock: row.override_max_students_per_block || undefined,
      overrideMaxBlocksPerYear: row.override_max_blocks_per_year || undefined,
      overrideBlockSizeDays: row.override_block_length_days || undefined,
      overrideAllowPartialBlocks: row.override_allow_partial_blocks ?? undefined,
      overridePreferContinuousBlocks: row.override_prefer_continuous_blocks ?? undefined,
      overrideAllowTeams: row.override_allow_teams ?? undefined,
      overrideAllowFallbacks: row.override_allow_fallbacks ?? undefined,
      overrideFallbackRequiresApproval: row.override_fallback_requires_approval ?? undefined,
      overrideFallbackAllowCrossSystem: row.override_fallback_allow_cross_system ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
