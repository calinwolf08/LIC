/**
 * Capacity Checker
 *
 * Validates preceptor capacity constraints with hierarchical rule resolution.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

/**
 * Capacity Check Result
 */
export interface CapacityCheckResult {
  hasCapacity: boolean;
  reason?: string;
  currentCount?: number;
  maxAllowed?: number;
  checkType?: 'daily' | 'yearly' | 'block';
}

/**
 * Capacity Rule (resolved from hierarchy)
 */
export interface ResolvedCapacityRule {
  maxStudentsPerDay: number;
  maxStudentsPerYear: number;
  maxStudentsPerBlock?: number;
  maxBlocksPerYear?: number;
  source: 'clerkship-specific' | 'requirement-type-specific' | 'general' | 'default';
}

/**
 * Capacity Checker
 *
 * Checks if preceptor has capacity for assignment.
 * Implements hierarchical rule resolution:
 * 1. Clerkship-specific + requirement-type (most specific)
 * 2. Clerkship-specific
 * 3. Requirement-type-specific
 * 4. General preceptor rule
 * 5. Default from preceptors table
 */
export class CapacityChecker {
  constructor(private db: Kysely<DB>) {}

  /**
   * Check if preceptor has capacity for assignment
   */
  async checkCapacity(
    preceptorId: string,
    date: string,
    options: {
      clerkshipId?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      blockNumber?: number;
      academicYear?: number;
    } = {}
  ): Promise<CapacityCheckResult> {
    // Resolve capacity rule
    const rule = await this.resolveCapacityRule(
      preceptorId,
      options.clerkshipId,
      options.requirementType
    );

    // Check daily capacity
    const dailyCheck = await this.checkDailyCapacity(preceptorId, date, rule.maxStudentsPerDay);
    if (!dailyCheck.hasCapacity) {
      return dailyCheck;
    }

    // Check yearly capacity
    const year = options.academicYear || new Date(date).getFullYear();
    const yearlyCheck = await this.checkYearlyCapacity(preceptorId, year, rule.maxStudentsPerYear);
    if (!yearlyCheck.hasCapacity) {
      return yearlyCheck;
    }

    // Check block capacity if applicable
    if (options.blockNumber !== undefined && rule.maxStudentsPerBlock && rule.maxBlocksPerYear) {
      const blockCheck = await this.checkBlockCapacity(
        preceptorId,
        year,
        rule.maxStudentsPerBlock,
        rule.maxBlocksPerYear
      );
      if (!blockCheck.hasCapacity) {
        return blockCheck;
      }
    }

    return { hasCapacity: true };
  }

  /**
   * Resolve capacity rule using hierarchy
   */
  async resolveCapacityRule(
    preceptorId: string,
    clerkshipId?: string,
    requirementType?: 'outpatient' | 'inpatient' | 'elective'
  ): Promise<ResolvedCapacityRule> {
    // Try clerkship-specific + requirement-type (most specific)
    if (clerkshipId && requirementType) {
      const rule = await this.db
        .selectFrom('preceptor_capacity_rules')
        .selectAll()
        .where('preceptor_id', '=', preceptorId)
        .where('clerkship_id', '=', clerkshipId)
        .where('requirement_type', '=', requirementType)
        .executeTakeFirst();

      if (rule) {
        return {
          maxStudentsPerDay: rule.max_students_per_day,
          maxStudentsPerYear: rule.max_students_per_year,
          maxStudentsPerBlock: rule.max_students_per_block || undefined,
          maxBlocksPerYear: rule.max_blocks_per_year || undefined,
          source: 'clerkship-specific',
        };
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
        return {
          maxStudentsPerDay: rule.max_students_per_day,
          maxStudentsPerYear: rule.max_students_per_year,
          maxStudentsPerBlock: rule.max_students_per_block || undefined,
          maxBlocksPerYear: rule.max_blocks_per_year || undefined,
          source: 'clerkship-specific',
        };
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
        return {
          maxStudentsPerDay: rule.max_students_per_day,
          maxStudentsPerYear: rule.max_students_per_year,
          maxStudentsPerBlock: rule.max_students_per_block || undefined,
          maxBlocksPerYear: rule.max_blocks_per_year || undefined,
          source: 'requirement-type-specific',
        };
      }
    }

    // Try general preceptor rule
    const rule = await this.db
      .selectFrom('preceptor_capacity_rules')
      .selectAll()
      .where('preceptor_id', '=', preceptorId)
      .where('clerkship_id', 'is', null)
      .where('requirement_type', 'is', null)
      .executeTakeFirst();

    if (rule) {
      return {
        maxStudentsPerDay: rule.max_students_per_day,
        maxStudentsPerYear: rule.max_students_per_year,
        maxStudentsPerBlock: rule.max_students_per_block || undefined,
        maxBlocksPerYear: rule.max_blocks_per_year || undefined,
        source: 'general',
      };
    }

    // Default from preceptors table
    const preceptor = await this.db
      .selectFrom('preceptors')
      .select('max_students')
      .where('id', '=', preceptorId)
      .executeTakeFirst();

    return {
      maxStudentsPerDay: 2, // Default
      maxStudentsPerYear: preceptor?.max_students || 20, // Default
      source: 'default',
    };
  }

  /**
   * Check daily capacity
   */
  private async checkDailyCapacity(
    preceptorId: string,
    date: string,
    maxPerDay: number
  ): Promise<CapacityCheckResult> {
    const count = await this.db
      .selectFrom('schedule_assignments')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('preceptor_id', '=', preceptorId)
      .where('date', '=', date)
      .executeTakeFirst();

    const currentCount = count?.count || 0;

    if (currentCount >= maxPerDay) {
      return {
        hasCapacity: false,
        reason: `Preceptor at daily capacity (${currentCount}/${maxPerDay})`,
        currentCount,
        maxAllowed: maxPerDay,
        checkType: 'daily',
      };
    }

    return { hasCapacity: true };
  }

  /**
   * Check yearly capacity
   */
  private async checkYearlyCapacity(
    preceptorId: string,
    year: number,
    maxPerYear: number
  ): Promise<CapacityCheckResult> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const count = await this.db
      .selectFrom('schedule_assignments')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('preceptor_id', '=', preceptorId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .executeTakeFirst();

    const currentCount = count?.count || 0;

    if (currentCount >= maxPerYear) {
      return {
        hasCapacity: false,
        reason: `Preceptor at yearly capacity (${currentCount}/${maxPerYear})`,
        currentCount,
        maxAllowed: maxPerYear,
        checkType: 'yearly',
      };
    }

    return { hasCapacity: true };
  }

  /**
   * Check block capacity
   */
  private async checkBlockCapacity(
    preceptorId: string,
    year: number,
    maxPerBlock: number,
    maxBlocks: number
  ): Promise<CapacityCheckResult> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Count distinct blocks assigned
    const assignments = await this.db
      .selectFrom('schedule_assignments')
      .select(['block_number'])
      .where('preceptor_id', '=', preceptorId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .where('block_number', 'is not', null)
      .execute();

    const uniqueBlocks = new Set(assignments.map(a => a.block_number).filter(b => b !== null));
    const blockCount = uniqueBlocks.size;

    if (blockCount >= maxBlocks) {
      return {
        hasCapacity: false,
        reason: `Preceptor at yearly block limit (${blockCount}/${maxBlocks} blocks)`,
        currentCount: blockCount,
        maxAllowed: maxBlocks,
        checkType: 'block',
      };
    }

    return { hasCapacity: true };
  }
}
