/**
 * Capacity Rule Service
 *
 * Manages preceptor capacity rules with hierarchical support (global, clerkship-specific, requirement-type-specific).
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { PreceptorCapacityRule } from '$lib/features/scheduling-config/types';
import {
  preceptorCapacityRuleInputSchema,
  type PreceptorCapacityRuleInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';

/**
 * Capacity Rule Service
 *
 * Provides CRUD operations for preceptor capacity rules with validation
 * and hierarchical rule resolution.
 */
export class CapacityRuleService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new capacity rule
   */
  async createCapacityRule(input: PreceptorCapacityRuleInput): ServiceResult<PreceptorCapacityRule> {
    // Validate input
    const validation = preceptorCapacityRuleInputSchema.safeParse(input);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid capacity rule data', validation.error.errors)
      );
    }

    try {
      // Check preceptor exists
      const preceptor = await this.db
        .selectFrom('preceptors')
        .select('id')
        .where('id', '=', input.preceptorId)
        .executeTakeFirst();

      if (!preceptor) {
        return Result.failure(ServiceErrors.notFound('Preceptor', input.preceptorId));
      }

      // If clerkship specified, verify it exists
      if (input.clerkshipId) {
        const clerkship = await this.db
          .selectFrom('clerkships')
          .select('id')
          .where('id', '=', input.clerkshipId)
          .executeTakeFirst();

        if (!clerkship) {
          return Result.failure(ServiceErrors.notFound('Clerkship', input.clerkshipId));
        }
      }

      const rule = await this.db
        .insertInto('preceptor_capacity_rules')
        .values({
          id: nanoid(),
          preceptor_id: input.preceptorId,
          clerkship_id: input.clerkshipId || null,
          requirement_type: input.requirementType || null,
          max_students_per_day: input.maxStudentsPerDay,
          max_students_per_year: input.maxStudentsPerYear,
          max_students_per_block: input.maxStudentsPerBlock || null,
          max_blocks_per_year: input.maxBlocksPerYear || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapCapacityRule(rule));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to create capacity rule', error));
    }
  }

  /**
   * Get capacity rule by ID
   */
  async getCapacityRule(id: string): ServiceResult<PreceptorCapacityRule | null> {
    try {
      const rule = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!rule) {
        return Result.success(null);
      }

      return Result.success(this.mapCapacityRule(rule));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch capacity rule', error));
    }
  }

  /**
   * Get all capacity rules for a preceptor
   */
  async getCapacityRulesByPreceptor(preceptorId: string): ServiceResult<PreceptorCapacityRule[]> {
    try {
      const rules = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('preceptor_id', '=', preceptorId)
        .execute();

      return Result.success(rules.map(rule => this.mapCapacityRule(rule)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch capacity rules', error));
    }
  }

  /**
   * Get specific capacity rule for preceptor + clerkship combination
   *
   * Returns the most specific rule based on hierarchy:
   * 1. Preceptor + Clerkship + Requirement Type (most specific)
   * 2. Preceptor + Clerkship
   * 3. Preceptor + Requirement Type
   * 4. Preceptor (global)
   */
  async getEffectiveCapacityRule(
    preceptorId: string,
    clerkshipId?: string,
    requirementType?: 'outpatient' | 'inpatient' | 'elective'
  ): ServiceResult<PreceptorCapacityRule | null> {
    try {
      // Try most specific first
      if (clerkshipId && requirementType) {
        const rule = await this.db
          .selectFrom('preceptor_capacity_rules')
          .selectAll()
          .where('preceptor_id', '=', preceptorId)
          .where('clerkship_id', '=', clerkshipId)
          .where('requirement_type', '=', requirementType)
          .executeTakeFirst();

        if (rule) {
          return Result.success(this.mapCapacityRule(rule));
        }
      }

      // Try clerkship-specific
      if (clerkshipId) {
        const rule = await this.db
          .selectFrom('preceptor_capacity_rules')
          .selectAll()
          .where('preceptor_id', '=', preceptorId)
          .where('clerkship_id', '=', clerkshipId)
          .where('requirement_type', 'is', null)
          .executeTakeFirst();

        if (rule) {
          return Result.success(this.mapCapacityRule(rule));
        }
      }

      // Try requirement-type-specific
      if (requirementType) {
        const rule = await this.db
          .selectFrom('preceptor_capacity_rules')
          .selectAll()
          .where('preceptor_id', '=', preceptorId)
          .where('clerkship_id', 'is', null)
          .where('requirement_type', '=', requirementType)
          .executeTakeFirst();

        if (rule) {
          return Result.success(this.mapCapacityRule(rule));
        }
      }

      // Try global preceptor rule
      const rule = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('preceptor_id', '=', preceptorId)
        .where('clerkship_id', 'is', null)
        .where('requirement_type', 'is', null)
        .executeTakeFirst();

      if (rule) {
        return Result.success(this.mapCapacityRule(rule));
      }

      return Result.success(null);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch effective capacity rule', error));
    }
  }

  /**
   * Update capacity rule
   */
  async updateCapacityRule(
    id: string,
    input: Partial<PreceptorCapacityRuleInput>
  ): ServiceResult<PreceptorCapacityRule> {
    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return Result.failure(ServiceErrors.notFound('Capacity rule', id));
      }

      // Build update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.maxStudentsPerDay !== undefined) {
        updateData.max_students_per_day = input.maxStudentsPerDay;
      }
      if (input.maxStudentsPerYear !== undefined) {
        updateData.max_students_per_year = input.maxStudentsPerYear;
      }
      if (input.maxStudentsPerBlock !== undefined) {
        updateData.max_students_per_block = input.maxStudentsPerBlock;
      }
      if (input.maxBlocksPerYear !== undefined) {
        updateData.max_blocks_per_year = input.maxBlocksPerYear;
      }

      // Validate updated rule
      const mergedRule = {
        preceptorId: existing.preceptor_id,
        clerkshipId: existing.clerkship_id || undefined,
        requirementType: existing.requirement_type || undefined,
        maxStudentsPerDay: updateData.max_students_per_day ?? existing.max_students_per_day,
        maxStudentsPerYear: updateData.max_students_per_year ?? existing.max_students_per_year,
        maxStudentsPerBlock: updateData.max_students_per_block ?? existing.max_students_per_block,
        maxBlocksPerYear: updateData.max_blocks_per_year ?? existing.max_blocks_per_year,
      };

      const validation = preceptorCapacityRuleInputSchema.safeParse(mergedRule);
      if (!validation.success) {
        return Result.failure(
          ServiceErrors.validationError('Invalid capacity rule update', validation.error.errors)
        );
      }

      const updated = await this.db
        .updateTable('preceptor_capacity_rules')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapCapacityRule(updated));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to update capacity rule', error));
    }
  }

  /**
   * Delete capacity rule
   */
  async deleteCapacityRule(id: string): ServiceResult<boolean> {
    try {
      const result = await this.db.deleteFrom('preceptor_capacity_rules').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        return Result.failure(ServiceErrors.notFound('Capacity rule', id));
      }

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to delete capacity rule', error));
    }
  }

  /**
   * Check if preceptor has capacity for assignment
   *
   * This is a simple check - full capacity checking would involve counting current assignments
   */
  async checkCapacity(
    preceptorId: string,
    clerkshipId?: string,
    requirementType?: 'outpatient' | 'inpatient' | 'elective'
  ): ServiceResult<{ hasCapacity: boolean; rule: PreceptorCapacityRule | null }> {
    const ruleResult = await this.getEffectiveCapacityRule(preceptorId, clerkshipId, requirementType);

    if (!ruleResult.success) {
      return Result.failure(ruleResult.error);
    }

    // If no rule exists, assume unlimited capacity
    if (!ruleResult.data) {
      return Result.success({ hasCapacity: true, rule: null });
    }

    // For now, just return that rule exists
    // Full implementation would count current assignments and compare to limits
    return Result.success({ hasCapacity: true, rule: ruleResult.data });
  }

  /**
   * Map database row to PreceptorCapacityRule type
   */
  private mapCapacityRule(row: any): PreceptorCapacityRule {
    return {
      id: row.id,
      preceptorId: row.preceptor_id,
      clerkshipId: row.clerkship_id || undefined,
      requirementType: row.requirement_type || undefined,
      maxStudentsPerDay: row.max_students_per_day,
      maxStudentsPerYear: row.max_students_per_year,
      maxStudentsPerBlock: row.max_students_per_block || undefined,
      maxBlocksPerYear: row.max_blocks_per_year || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
