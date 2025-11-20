/**
 * Fallback Service
 *
 * Manages preceptor fallback chains with circular reference detection.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { PreceptorFallback } from '$lib/features/scheduling-config/types';
import {
  preceptorFallbackInputSchema,
  type PreceptorFallbackInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';

/**
 * Fallback Service
 *
 * Provides CRUD operations for preceptor fallbacks with validation
 * of fallback chains and circular reference detection.
 */
export class FallbackService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new fallback
   */
  async createFallback(input: PreceptorFallbackInput): Promise<ServiceResult<PreceptorFallback>> {
    // Validate input
    const validation = preceptorFallbackInputSchema.safeParse(input);
    if (!validation.success) {
      return Result.failure(
        ServiceErrors.validationError('Invalid fallback data', validation.error.errors)
      );
    }

    try {
      // Check primary preceptor exists
      const primaryPreceptor = await this.db
        .selectFrom('preceptors')
        .select('id')
        .where('id', '=', input.primaryPreceptorId)
        .executeTakeFirst();

      if (!primaryPreceptor) {
        return Result.failure(ServiceErrors.notFound('Primary preceptor', input.primaryPreceptorId));
      }

      // Check fallback preceptor exists
      const fallbackPreceptor = await this.db
        .selectFrom('preceptors')
        .select('id')
        .where('id', '=', input.fallbackPreceptorId)
        .executeTakeFirst();

      if (!fallbackPreceptor) {
        return Result.failure(ServiceErrors.notFound('Fallback preceptor', input.fallbackPreceptorId));
      }

      // Check for circular references
      const circularCheck = await this.checkCircularReference(
        input.primaryPreceptorId,
        input.fallbackPreceptorId,
        input.clerkshipId
      );
      if (!circularCheck.success) {
        return Result.failure(circularCheck.error);
      }

      // Check for duplicate priority in same chain
      if (input.clerkshipId) {
        const existingPriority = await this.db
          .selectFrom('preceptor_fallbacks')
          .select('id')
          .where('primary_preceptor_id', '=', input.primaryPreceptorId)
          .where('clerkship_id', '=', input.clerkshipId)
          .where('priority', '=', input.priority)
          .executeTakeFirst();

        if (existingPriority) {
          return Result.failure(
            ServiceErrors.conflict(`Priority ${input.priority} already used in fallback chain`)
          );
        }
      } else {
        const existingPriority = await this.db
          .selectFrom('preceptor_fallbacks')
          .select('id')
          .where('primary_preceptor_id', '=', input.primaryPreceptorId)
          .where('clerkship_id', 'is', null)
          .where('priority', '=', input.priority)
          .executeTakeFirst();

        if (existingPriority) {
          return Result.failure(
            ServiceErrors.conflict(`Priority ${input.priority} already used in fallback chain`)
          );
        }
      }

      const fallback = await this.db
        .insertInto('preceptor_fallbacks')
        .values({
          id: nanoid(),
          primary_preceptor_id: input.primaryPreceptorId,
          fallback_preceptor_id: input.fallbackPreceptorId,
          clerkship_id: input.clerkshipId || null,
          priority: input.priority,
          requires_approval: input.requiresApproval ? 1 : 0,
          allow_different_health_system: input.allowDifferentHealthSystem ? 1 : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapFallback(fallback));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to create fallback', error));
    }
  }

  /**
   * Get fallback by ID
   */
  async getFallback(id: string): Promise<ServiceResult<PreceptorFallback | null>> {
    try {
      const fallback = await this.db
        .selectFrom('preceptor_fallbacks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!fallback) {
        return Result.success(null);
      }

      return Result.success(this.mapFallback(fallback));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch fallback', error));
    }
  }

  /**
   * Get ordered fallback chain for a preceptor
   */
  async getFallbackChain(
    primaryPreceptorId: string,
    clerkshipId?: string
  ): Promise<ServiceResult<PreceptorFallback[]>> {
    try {
      let query = this.db
        .selectFrom('preceptor_fallbacks')
        .selectAll()
        .where('primary_preceptor_id', '=', primaryPreceptorId);

      if (clerkshipId) {
        query = query.where('clerkship_id', '=', clerkshipId);
      } else {
        query = query.where('clerkship_id', 'is', null);
      }

      const fallbacks = await query.orderBy('priority', 'asc').execute();

      return Result.success(fallbacks.map(f => this.mapFallback(f)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch fallback chain', error));
    }
  }

  /**
   * Update fallback
   */
  async updateFallback(
    id: string,
    input: Partial<PreceptorFallbackInput>
  ): Promise<ServiceResult<PreceptorFallback>> {
    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('preceptor_fallbacks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return Result.failure(ServiceErrors.notFound('Fallback', id));
      }

      // Build update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.requiresApproval !== undefined)
        updateData.requires_approval = input.requiresApproval;
      if (input.allowDifferentHealthSystem !== undefined)
        updateData.allow_different_health_system = input.allowDifferentHealthSystem;

      // If priority changed, check for conflicts
      if (input.priority !== undefined && input.priority !== existing.priority) {
        let conflictQuery = this.db
          .selectFrom('preceptor_fallbacks')
          .select('id')
          .where('primary_preceptor_id', '=', existing.primary_preceptor_id)
          .where('priority', '=', input.priority)
          .where('id', '!=', id);

        if (existing.clerkship_id) {
          conflictQuery = conflictQuery.where('clerkship_id', '=', existing.clerkship_id);
        } else {
          conflictQuery = conflictQuery.where('clerkship_id', 'is', null);
        }

        const conflict = await conflictQuery.executeTakeFirst();

        if (conflict) {
          return Result.failure(
            ServiceErrors.conflict(`Priority ${input.priority} already used in fallback chain`)
          );
        }
      }

      const updated = await this.db
        .updateTable('preceptor_fallbacks')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return Result.success(this.mapFallback(updated));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to update fallback', error));
    }
  }

  /**
   * Delete fallback
   */
  async deleteFallback(id: string): Promise<ServiceResult<boolean>> {
    try {
      const result = await this.db.deleteFrom('preceptor_fallbacks').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        return Result.failure(ServiceErrors.notFound('Fallback', id));
      }

      return Result.success(true);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to delete fallback', error));
    }
  }

  /**
   * Validate fallback chain for circular references
   */
  async validateFallbackChain(
    primaryPreceptorId: string,
    clerkshipId?: string
  ): Promise<ServiceResult<boolean>> {
    const chainResult = await this.getFallbackChain(primaryPreceptorId, clerkshipId);
    if (!chainResult.success) {
      return Result.failure(chainResult.error);
    }

    const visited = new Set<string>();
    visited.add(primaryPreceptorId);

    for (const fallback of chainResult.data) {
      if (visited.has(fallback.fallbackPreceptorId)) {
        return Result.failure(
          ServiceErrors.conflict(
            `Circular reference detected in fallback chain at preceptor ${fallback.fallbackPreceptorId}`
          )
        );
      }
      visited.add(fallback.fallbackPreceptorId);

      // Check if fallback preceptor has their own chain
      const nestedChainResult = await this.getFallbackChain(fallback.fallbackPreceptorId, clerkshipId);
      if (nestedChainResult.success) {
        for (const nestedFallback of nestedChainResult.data) {
          if (visited.has(nestedFallback.fallbackPreceptorId)) {
            return Result.failure(
              ServiceErrors.conflict(
                `Circular reference detected in nested fallback chain at preceptor ${nestedFallback.fallbackPreceptorId}`
              )
            );
          }
          visited.add(nestedFallback.fallbackPreceptorId);
        }
      }
    }

    return Result.success(true);
  }

  /**
   * Check if adding a fallback would create a circular reference
   */
  private async checkCircularReference(
    primaryPreceptorId: string,
    fallbackPreceptorId: string,
    clerkshipId?: string
  ): Promise<ServiceResult<boolean>> {
    // Check if fallback preceptor eventually points back to primary
    const visited = new Set<string>();
    let currentId = fallbackPreceptorId;

    while (currentId) {
      if (currentId === primaryPreceptorId) {
        return Result.failure(
          ServiceErrors.conflict('Adding this fallback would create a circular reference')
        );
      }

      if (visited.has(currentId)) {
        // Already checked this path
        break;
      }

      visited.add(currentId);

      // Get next in chain
      let query = this.db
        .selectFrom('preceptor_fallbacks')
        .select('fallback_preceptor_id')
        .where('primary_preceptor_id', '=', currentId)
        .orderBy('priority', 'asc')
        .limit(1);

      if (clerkshipId) {
        query = query.where('clerkship_id', '=', clerkshipId);
      } else {
        query = query.where('clerkship_id', 'is', null);
      }

      const nextFallback = await query.executeTakeFirst();

      if (!nextFallback) {
        break;
      }

      currentId = nextFallback.fallback_preceptor_id;
    }

    return Result.success(true);
  }

  /**
   * Map database row to PreceptorFallback type
   */
  private mapFallback(row: any): PreceptorFallback {
    return {
      id: row.id,
      primaryPreceptorId: row.primary_preceptor_id,
      fallbackPreceptorId: row.fallback_preceptor_id,
      clerkshipId: row.clerkship_id || undefined,
      priority: row.priority,
      requiresApproval: Boolean(row.requires_approval),
      allowDifferentHealthSystem: Boolean(row.allow_different_health_system),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
