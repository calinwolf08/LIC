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
  async createRequirement(input: RequirementInput): ServiceResult<ClerkshipRequirement> {
    // Validate input
    const validation = requirementInputSchema.safeParse(input);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid requirement data', validation.error.errors)
      );
    }

    try {
      // Note: This would need clerkshipId in the input
      // For now, we'll assume it's part of a larger transaction

      const requirement = await this.db
        .insertInto('clerkship_requirements')
        .values({
          id: nanoid(),
          clerkship_id: (input as any).clerkshipId, // Would need to add this to schema
          requirement_type: input.requirementType,
          required_days: input.requiredDays,
          override_mode: input.overrideMode,
          override_assignment_strategy: input.overrideAssignmentStrategy || null,
          override_health_system_rule: input.overrideHealthSystemRule || null,
          override_max_students_per_day: input.overrideMaxStudentsPerDay || null,
          override_max_students_per_year: input.overrideMaxStudentsPerYear || null,
          override_max_students_per_block: input.overrideMaxStudentsPerBlock || null,
          override_max_blocks_per_year: input.overrideMaxBlocksPerYear || null,
          override_block_size_days: input.overrideBlockSizeDays || null,
          override_allow_partial_blocks: input.overrideAllowPartialBlocks ?? null,
          override_prefer_continuous_blocks: input.overridePreferContinuousBlocks ?? null,
          override_allow_teams: input.overrideAllowTeams ?? null,
          override_allow_fallbacks: input.overrideAllowFallbacks ?? null,
          override_fallback_requires_approval: input.overrideFallbackRequiresApproval ?? null,
          override_fallback_allow_cross_system: input.overrideFallbackAllowCrossSystem ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapRequirement(requirement));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to create requirement', error));
    }
  }

  /**
   * Get requirement by ID
   */
  async getRequirement(id: string): ServiceResult<ClerkshipRequirement | null> {
    try {
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!requirement) {
        return Result.success(null);
      }

      return Result.success(this.mapRequirement(requirement));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch requirement', error));
    }
  }

  /**
   * Get all requirements for a clerkship
   */
  async getRequirementsByClerkship(clerkshipId: string): ServiceResult<ClerkshipRequirement[]> {
    try {
      const requirements = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      return Result.success(requirements.map(r => this.mapRequirement(r)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch requirements', error));
    }
  }

  /**
   * Update requirement
   */
  async updateRequirement(
    id: string,
    input: Partial<RequirementInput>
  ): ServiceResult<ClerkshipRequirement> {
    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return Result.failure(ServiceErrors.notFound('Requirement', id));
      }

      // Build merged requirement for validation
      const mergedRequirement: any = {
        requirementType: input.requirementType ?? existing.requirement_type,
        requiredDays: input.requiredDays ?? existing.required_days,
        overrideMode: input.overrideMode ?? existing.override_mode,
        overrideAssignmentStrategy: input.overrideAssignmentStrategy ?? existing.override_assignment_strategy,
        overrideHealthSystemRule: input.overrideHealthSystemRule ?? existing.override_health_system_rule,
        overrideMaxStudentsPerDay: input.overrideMaxStudentsPerDay ?? existing.override_max_students_per_day,
        overrideMaxStudentsPerYear: input.overrideMaxStudentsPerYear ?? existing.override_max_students_per_year,
        overrideMaxStudentsPerBlock: input.overrideMaxStudentsPerBlock ?? existing.override_max_students_per_block,
        overrideMaxBlocksPerYear: input.overrideMaxBlocksPerYear ?? existing.override_max_blocks_per_year,
        overrideBlockSizeDays: input.overrideBlockSizeDays ?? existing.override_block_size_days,
        overrideAllowPartialBlocks: input.overrideAllowPartialBlocks ?? existing.override_allow_partial_blocks,
        overridePreferContinuousBlocks: input.overridePreferContinuousBlocks ?? existing.override_prefer_continuous_blocks,
        overrideAllowTeams: input.overrideAllowTeams ?? existing.override_allow_teams,
        overrideAllowFallbacks: input.overrideAllowFallbacks ?? existing.override_allow_fallbacks,
        overrideFallbackRequiresApproval: input.overrideFallbackRequiresApproval ?? existing.override_fallback_requires_approval,
        overrideFallbackAllowCrossSystem: input.overrideFallbackAllowCrossSystem ?? existing.override_fallback_allow_cross_system,
      };

      // Validate merged requirement
      const validation = requirementInputSchema.safeParse(mergedRequirement);
      if (!validation.success) {
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
        updateData.override_block_size_days = input.overrideBlockSizeDays || null;
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

      return Result.success(this.mapRequirement(updated));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to update requirement', error));
    }
  }

  /**
   * Delete requirement
   */
  async deleteRequirement(id: string): ServiceResult<boolean> {
    try {
      // Check for dependent electives
      const electiveCount = await this.db
        .selectFrom('clerkship_electives')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('requirement_id', '=', id)
        .executeTakeFirst();

      if (electiveCount && electiveCount.count > 0) {
        return Result.failure(
          ServiceErrors.dependencyError('Requirement', 'electives', {
            electiveCount: electiveCount.count,
          })
        );
      }

      const result = await this.db.deleteFrom('clerkship_requirements').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        return Result.failure(ServiceErrors.notFound('Requirement', id));
      }

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to delete requirement', error));
    }
  }

  /**
   * Validate that requirement days sum to clerkship total
   *
   * Business rule: Total required days must equal clerkship.required_days
   */
  async validateRequirementSplit(clerkshipId: string): ServiceResult<{
    valid: boolean;
    totalRequiredDays: number;
    clerkshipTotalDays: number;
  }> {
    try {
      // Get clerkship total days
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select('required_days')
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Sum requirement days
      const requirements = await this.db
        .selectFrom('clerkship_requirements')
        .select('required_days')
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      const totalRequiredDays = requirements.reduce((sum, req) => sum + req.required_days, 0);

      return Result.success({
        valid: totalRequiredDays === clerkship.required_days,
        totalRequiredDays,
        clerkshipTotalDays: clerkship.required_days,
      });
    } catch (error) {
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
      overrideBlockSizeDays: row.override_block_size_days || undefined,
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
