/**
 * Fallback Resolver
 *
 * Selects appropriate fallback preceptor when primary is unavailable.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { CapacityChecker } from '../capacity/capacity-checker';

/**
 * Fallback Resolution Result
 */
export interface FallbackResult {
  success: boolean;
  fallbackPreceptorId?: string;
  requiresApproval?: boolean;
  fallbackDepth?: number;
  reason?: string;
  healthSystemOverrideUsed?: boolean;
}

/**
 * Fallback Chain Entry
 */
interface FallbackEntry {
  id: string;
  fallbackPreceptorId: string;
  priority: number;
  requiresApproval: boolean;
  allowDifferentHealthSystem: boolean;
}

/**
 * Fallback Resolver
 *
 * Implements fallback preceptor selection with:
 * - Priority-based chain traversal
 * - Circular reference detection
 * - Availability checking
 * - Capacity validation
 * - Health system rule enforcement
 */
export class FallbackResolver {
  private capacityChecker: CapacityChecker;

  constructor(private db: Kysely<DB>) {
    this.capacityChecker = new CapacityChecker(db);
  }

  /**
   * Resolve fallback preceptor for unavailable primary
   */
  async resolveFallback(
    primaryPreceptorId: string,
    requiredDates: string[],
    options: {
      clerkshipId?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      specialty?: string;
      healthSystemId?: string | null;
      allowHealthSystemOverride?: boolean;
    } = {}
  ): Promise<FallbackResult> {
    // Get fallback chain
    const chain = await this.getFallbackChain(primaryPreceptorId, options.clerkshipId);

    if (chain.length === 0) {
      return {
        success: false,
        reason: 'No fallback chain configured for primary preceptor',
      };
    }

    // Detect circular references
    const circularCheck = this.detectCircularReferences(chain);
    if (!circularCheck.isValid) {
      return {
        success: false,
        reason: `Circular reference detected in fallback chain: ${circularCheck.cycle}`,
      };
    }

    // Try each fallback in priority order
    for (let i = 0; i < chain.length; i++) {
      const fallback = chain[i];

      // Note: Specialty matching disabled - preceptors no longer have specialty field

      // Check health system rules
      if (options.healthSystemId && !fallback.allowDifferentHealthSystem) {
        const preceptor = await this.db
          .selectFrom('preceptors')
          .select('health_system_id')
          .where('id', '=', fallback.fallbackPreceptorId)
          .executeTakeFirst();

        if (preceptor?.health_system_id !== options.healthSystemId) {
          if (!options.allowHealthSystemOverride) {
            continue; // Try next fallback
          }
        }
      }

      // Check availability for all required dates
      const isAvailable = await this.checkAvailability(
        fallback.fallbackPreceptorId,
        requiredDates
      );

      if (!isAvailable) {
        continue; // Try next fallback
      }

      // Check capacity for each date
      let hasCapacity = true;
      for (const date of requiredDates) {
        const capacityCheck = await this.capacityChecker.checkCapacity(
          fallback.fallbackPreceptorId,
          date,
          {
            clerkshipId: options.clerkshipId,
            requirementType: options.requirementType,
          }
        );

        if (!capacityCheck.hasCapacity) {
          hasCapacity = false;
          break;
        }
      }

      if (!hasCapacity) {
        continue; // Try next fallback
      }

      // Found valid fallback!
      return {
        success: true,
        fallbackPreceptorId: fallback.fallbackPreceptorId,
        requiresApproval: fallback.requiresApproval,
        fallbackDepth: i + 1,
        healthSystemOverrideUsed: fallback.allowDifferentHealthSystem,
      };
    }

    // No valid fallback found
    return {
      success: false,
      reason: `No valid fallback found after checking ${chain.length} candidates`,
    };
  }

  /**
   * Get fallback chain for preceptor
   */
  private async getFallbackChain(
    primaryPreceptorId: string,
    clerkshipId?: string
  ): Promise<FallbackEntry[]> {
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

    return fallbacks
      .filter(f => f.id !== null)
      .map(f => ({
        id: f.id as string,
        fallbackPreceptorId: f.fallback_preceptor_id,
        priority: f.priority,
        requiresApproval: Boolean(f.requires_approval),
        allowDifferentHealthSystem: Boolean(f.allow_different_health_system),
      }));
  }

  /**
   * Check if preceptor is available for all dates
   */
  private async checkAvailability(
    preceptorId: string,
    dates: string[]
  ): Promise<boolean> {
    const availability = await this.db
      .selectFrom('preceptor_availability')
      .select('date')
      .where('preceptor_id', '=', preceptorId)
      .where('is_available', '=', 1)
      .execute();

    const availableDates = new Set(availability.map(a => a.date));

    return dates.every(date => availableDates.has(date));
  }

  /**
   * Detect circular references in fallback chain
   */
  private detectCircularReferences(chain: FallbackEntry[]): {
    isValid: boolean;
    cycle?: string;
  } {
    const seen = new Set<string>();

    for (const entry of chain) {
      if (seen.has(entry.fallbackPreceptorId)) {
        return {
          isValid: false,
          cycle: entry.fallbackPreceptorId,
        };
      }
      seen.add(entry.fallbackPreceptorId);
    }

    return { isValid: true };
  }

  /**
   * Resolve fallback with cascading support
   *
   * If a fallback preceptor is also unavailable, check their fallbacks recursively.
   */
  async resolveFallbackWithCascading(
    primaryPreceptorId: string,
    requiredDates: string[],
    options: {
      clerkshipId?: string;
      requirementType?: 'outpatient' | 'inpatient' | 'elective';
      specialty?: string;
      healthSystemId?: string | null;
      allowHealthSystemOverride?: boolean;
      maxDepth?: number;
    } = {}
  ): Promise<FallbackResult> {
    const maxDepth = options.maxDepth || 5;
    const visited = new Set<string>();

    return this.resolveFallbackRecursive(
      primaryPreceptorId,
      requiredDates,
      options,
      visited,
      0,
      maxDepth
    );
  }

  /**
   * Recursive fallback resolution
   */
  private async resolveFallbackRecursive(
    preceptorId: string,
    requiredDates: string[],
    options: any,
    visited: Set<string>,
    currentDepth: number,
    maxDepth: number
  ): Promise<FallbackResult> {
    // Prevent infinite loops
    if (visited.has(preceptorId)) {
      return {
        success: false,
        reason: `Circular reference detected at preceptor ${preceptorId}`,
      };
    }

    if (currentDepth >= maxDepth) {
      return {
        success: false,
        reason: `Maximum fallback depth (${maxDepth}) exceeded`,
      };
    }

    visited.add(preceptorId);

    // Try direct fallback
    const result = await this.resolveFallback(preceptorId, requiredDates, options);

    if (result.success) {
      return {
        ...result,
        fallbackDepth: currentDepth + (result.fallbackDepth || 1),
      };
    }

    // If direct fallback failed, try cascading
    const chain = await this.getFallbackChain(preceptorId, options.clerkshipId);

    for (const fallback of chain) {
      const cascadeResult = await this.resolveFallbackRecursive(
        fallback.fallbackPreceptorId,
        requiredDates,
        options,
        visited,
        currentDepth + 1,
        maxDepth
      );

      if (cascadeResult.success) {
        return cascadeResult;
      }
    }

    return {
      success: false,
      reason: `No valid fallback found at depth ${currentDepth}`,
    };
  }
}
