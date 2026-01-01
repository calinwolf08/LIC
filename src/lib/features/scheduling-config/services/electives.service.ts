/**
 * Elective Service
 *
 * Manages clerkship elective options with validation, site and preceptor associations.
 * Electives link directly to clerkships (not through requirements).
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { ClerkshipElective, ClerkshipElectiveWithDetails } from '$lib/features/scheduling-config/types';
import {
  clerkshipElectiveInputSchema,
  clerkshipElectiveUpdateSchema,
  type ClerkshipElectiveInput,
  type ClerkshipElectiveUpdateInput,
} from '../schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling-config:electives');

/**
 * Elective Service
 *
 * Provides CRUD operations for clerkship electives with validation,
 * plus site and preceptor association management.
 */
export class ElectiveService {
  constructor(private db: Kysely<DB>) {}

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Create a new elective for a clerkship
   */
  async createElective(
    clerkshipId: string,
    input: ClerkshipElectiveInput
  ): Promise<ServiceResult<ClerkshipElective>> {
    log.debug('Creating elective', {
      clerkshipId,
      name: input.name,
      minimumDays: input.minimumDays
    });

    // Validate input
    const validation = clerkshipElectiveInputSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Elective creation validation failed', {
        clerkshipId,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid elective data', validation.error.errors)
      );
    }

    const data = validation.data;

    try {
      // Check clerkship exists
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select(['id', 'required_days'])
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        log.warn('Clerkship not found for elective', { clerkshipId });
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Validate that adding this elective won't exceed clerkship total days
      const validation = await this.validateElectiveDays(clerkshipId, data.minimumDays);
      if (!validation.success) {
        return validation as ServiceResult<ClerkshipElective>;
      }

      const electiveId = nanoid();
      const now = new Date().toISOString();

      const elective = await this.db
        .insertInto('clerkship_electives')
        .values({
          id: electiveId,
          clerkship_id: clerkshipId,
          name: data.name,
          minimum_days: data.minimumDays,
          is_required: data.isRequired ? 1 : 0,
          specialty: data.specialty || null,
          override_mode: 'inherit',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Add site associations if provided
      if (data.siteIds && data.siteIds.length > 0) {
        await this.setSitesForElective(electiveId, data.siteIds);
      }

      // Add preceptor associations if provided
      if (data.preceptorIds && data.preceptorIds.length > 0) {
        await this.setPreceptorsForElective(electiveId, data.preceptorIds);
      }

      log.info('Elective created', {
        id: elective.id,
        clerkshipId: elective.clerkship_id,
        name: elective.name,
        minimumDays: elective.minimum_days,
        siteCount: data.siteIds?.length || 0,
        preceptorCount: data.preceptorIds?.length || 0
      });

      return Result.success(this.mapElective(elective));
    } catch (error) {
      log.error('Failed to create elective', { clerkshipId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to create elective', error));
    }
  }

  /**
   * Validate that adding/updating elective days won't exceed clerkship total
   */
  async validateElectiveDays(
    clerkshipId: string,
    newDays: number,
    excludeElectiveId?: string
  ): Promise<ServiceResult<void>> {
    try {
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select(['id', 'required_days'])
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      // Get current sum of elective days (excluding the one being updated if applicable)
      let query = this.db
        .selectFrom('clerkship_electives')
        .select(({ fn }) => [fn.sum<number>('minimum_days').as('total_days')])
        .where('clerkship_id', '=', clerkshipId);

      if (excludeElectiveId) {
        query = query.where('id', '!=', excludeElectiveId);
      }

      const result = await query.executeTakeFirst();
      const currentTotal = Number(result?.total_days || 0);
      const newTotal = currentTotal + newDays;

      if (newTotal > clerkship.required_days) {
        log.warn('Elective days validation failed - exceeds clerkship total', {
          clerkshipId,
          currentTotal,
          newDays,
          newTotal,
          clerkshipRequiredDays: clerkship.required_days
        });
        return Result.failure(
          ServiceErrors.conflict(
            `Total elective days (${newTotal}) cannot exceed clerkship required days (${clerkship.required_days}). ` +
            `Current elective total: ${currentTotal} days, attempting to add: ${newDays} days.`
          )
        );
      }

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to validate elective days', error));
    }
  }

  /**
   * Get summary of elective days for a clerkship
   */
  async getElectiveDaysSummary(clerkshipId: string): Promise<ServiceResult<{
    clerkshipRequiredDays: number;
    totalElectiveDays: number;
    remainingDays: number;
    nonElectiveDays: number;
  }>> {
    try {
      const clerkship = await this.db
        .selectFrom('clerkships')
        .select(['id', 'required_days'])
        .where('id', '=', clerkshipId)
        .executeTakeFirst();

      if (!clerkship) {
        return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
      }

      const result = await this.db
        .selectFrom('clerkship_electives')
        .select(({ fn }) => [fn.sum<number>('minimum_days').as('total_days')])
        .where('clerkship_id', '=', clerkshipId)
        .executeTakeFirst();

      const totalElectiveDays = Number(result?.total_days || 0);
      const remainingDays = clerkship.required_days - totalElectiveDays;
      const nonElectiveDays = remainingDays; // Same as remaining days

      return Result.success({
        clerkshipRequiredDays: clerkship.required_days,
        totalElectiveDays,
        remainingDays,
        nonElectiveDays,
      });
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to get elective days summary', error));
    }
  }

  /**
   * Get elective by ID
   */
  async getElective(id: string): Promise<ServiceResult<ClerkshipElective | null>> {
    log.debug('Fetching elective', { id });

    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!elective) {
        log.debug('Elective not found', { id });
        return Result.success(null);
      }

      log.info('Elective fetched', { id, name: elective.name });
      return Result.success(this.mapElective(elective));
    } catch (error) {
      log.error('Failed to fetch elective', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch elective', error));
    }
  }

  /**
   * Get elective with full details including sites and preceptors
   */
  async getElectiveWithDetails(id: string): Promise<ServiceResult<ClerkshipElectiveWithDetails | null>> {
    log.debug('Fetching elective with details', { id });

    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!elective) {
        log.debug('Elective not found for details fetch', { id });
        return Result.success(null);
      }

      // Get associated sites
      const sites = await this.db
        .selectFrom('elective_sites')
        .innerJoin('sites', 'sites.id', 'elective_sites.site_id')
        .select(['sites.id', 'sites.name'])
        .where('elective_sites.elective_id', '=', id)
        .execute();

      // Get associated preceptors
      const preceptors = await this.db
        .selectFrom('elective_preceptors')
        .innerJoin('preceptors', 'preceptors.id', 'elective_preceptors.preceptor_id')
        .select(['preceptors.id', 'preceptors.name'])
        .where('elective_preceptors.elective_id', '=', id)
        .execute();

      log.info('Elective with details fetched', {
        id,
        name: elective.name,
        siteCount: sites.length,
        preceptorCount: preceptors.length
      });

      return Result.success({
        ...this.mapElective(elective),
        sites: sites.map(s => ({ id: s.id!, name: s.name })),
        preceptors: preceptors.map(p => ({ id: p.id!, name: p.name })),
      });
    } catch (error) {
      log.error('Failed to fetch elective details', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch elective details', error));
    }
  }

  /**
   * Get all electives for a clerkship
   */
  async getElectivesByClerkship(clerkshipId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    log.debug('Fetching electives for clerkship', { clerkshipId });

    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      log.info('Electives fetched for clerkship', { clerkshipId, count: electives.length });
      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      log.error('Failed to fetch electives for clerkship', { clerkshipId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch electives', error));
    }
  }

  /**
   * Get required electives for a clerkship
   */
  async getRequiredElectives(clerkshipId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .where('is_required', '=', 1)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch required electives', error));
    }
  }

  /**
   * Get optional electives for a clerkship
   */
  async getOptionalElectives(clerkshipId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('clerkship_id', '=', clerkshipId)
        .where('is_required', '=', 0)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch optional electives', error));
    }
  }

  /**
   * Update elective
   */
  async updateElective(
    id: string,
    input: ClerkshipElectiveUpdateInput
  ): Promise<ServiceResult<ClerkshipElective>> {
    log.debug('Updating elective', { id, updates: Object.keys(input) });

    // Validate input
    const validation = clerkshipElectiveUpdateSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Elective update validation failed', {
        id,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid elective data', validation.error.errors)
      );
    }

    const data = validation.data;

    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        log.warn('Elective not found for update', { id });
        return Result.failure(ServiceErrors.notFound('Elective', id));
      }

      // Build update data
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.minimumDays !== undefined) {
        // Validate that updating days won't exceed clerkship total
        const daysValidation = await this.validateElectiveDays(
          existing.clerkship_id,
          data.minimumDays,
          id
        );
        if (!daysValidation.success) {
          return daysValidation as ServiceResult<ClerkshipElective>;
        }
        updateData.minimum_days = data.minimumDays;
      }
      if (data.isRequired !== undefined) updateData.is_required = data.isRequired ? 1 : 0;
      if (data.specialty !== undefined) updateData.specialty = data.specialty || null;

      const updated = await this.db
        .updateTable('clerkship_electives')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update site associations if provided
      if (data.siteIds !== undefined) {
        await this.setSitesForElective(id, data.siteIds);
      }

      // Update preceptor associations if provided
      if (data.preceptorIds !== undefined) {
        await this.setPreceptorsForElective(id, data.preceptorIds);
      }

      log.info('Elective updated', {
        id: updated.id,
        name: updated.name,
        updatedFields: Object.keys(data).filter(k => k !== 'siteIds' && k !== 'preceptorIds')
      });

      return Result.success(this.mapElective(updated));
    } catch (error) {
      log.error('Failed to update elective', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to update elective', error));
    }
  }

  /**
   * Delete elective
   */
  async deleteElective(id: string): Promise<ServiceResult<boolean>> {
    log.debug('Deleting elective', { id });

    try {
      // Check for current student assignments
      const assignments = await this.db
        .selectFrom('schedule_assignments')
        .select('id')
        .where('elective_id', '=', id)
        .limit(1)
        .execute();

      if (assignments.length > 0) {
        log.warn('Elective deletion blocked by existing assignments', { id });
        return Result.failure(
          ServiceErrors.conflict('Cannot delete elective with existing assignments')
        );
      }

      const result = await this.db.deleteFrom('clerkship_electives').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        log.warn('Elective not found for deletion', { id });
        return Result.failure(ServiceErrors.notFound('Elective', id));
      }

      log.info('Elective deleted', { id });
      return Result.success(true);
    } catch (error) {
      log.error('Failed to delete elective', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to delete elective', error));
    }
  }

  // ============================================
  // Site Associations
  // ============================================

  /**
   * Get sites for an elective
   */
  async getSitesForElective(electiveId: string): Promise<ServiceResult<Array<{ id: string; name: string }>>> {
    try {
      const sites = await this.db
        .selectFrom('elective_sites')
        .innerJoin('sites', 'sites.id', 'elective_sites.site_id')
        .select(['sites.id', 'sites.name'])
        .where('elective_sites.elective_id', '=', electiveId)
        .execute();

      return Result.success(sites.map(s => ({ id: s.id!, name: s.name })));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch sites for elective', error));
    }
  }

  /**
   * Add a site to an elective
   */
  async addSiteToElective(electiveId: string, siteId: string): Promise<ServiceResult<void>> {
    try {
      // Check elective exists
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .select('id')
        .where('id', '=', electiveId)
        .executeTakeFirst();

      if (!elective) {
        return Result.failure(ServiceErrors.notFound('Elective', electiveId));
      }

      // Check site exists
      const site = await this.db
        .selectFrom('sites')
        .select('id')
        .where('id', '=', siteId)
        .executeTakeFirst();

      if (!site) {
        return Result.failure(ServiceErrors.notFound('Site', siteId));
      }

      // Check if already exists
      const existing = await this.db
        .selectFrom('elective_sites')
        .select('id')
        .where('elective_id', '=', electiveId)
        .where('site_id', '=', siteId)
        .executeTakeFirst();

      if (existing) {
        return Result.success(undefined); // Already exists, no-op
      }

      await this.db
        .insertInto('elective_sites')
        .values({
          id: nanoid(),
          elective_id: electiveId,
          site_id: siteId,
          created_at: new Date().toISOString(),
        })
        .execute();

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to add site to elective', error));
    }
  }

  /**
   * Remove a site from an elective
   */
  async removeSiteFromElective(electiveId: string, siteId: string): Promise<ServiceResult<void>> {
    try {
      await this.db
        .deleteFrom('elective_sites')
        .where('elective_id', '=', electiveId)
        .where('site_id', '=', siteId)
        .execute();

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to remove site from elective', error));
    }
  }

  /**
   * Set all sites for an elective (replaces existing)
   */
  async setSitesForElective(electiveId: string, siteIds: string[]): Promise<ServiceResult<void>> {
    try {
      // Delete existing associations
      await this.db
        .deleteFrom('elective_sites')
        .where('elective_id', '=', electiveId)
        .execute();

      // Add new associations
      if (siteIds.length > 0) {
        const now = new Date().toISOString();
        await this.db
          .insertInto('elective_sites')
          .values(
            siteIds.map(siteId => ({
              id: nanoid(),
              elective_id: electiveId,
              site_id: siteId,
              created_at: now,
            }))
          )
          .execute();
      }

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to set sites for elective', error));
    }
  }

  // ============================================
  // Preceptor Associations
  // ============================================

  /**
   * Get preceptors for an elective
   */
  async getPreceptorsForElective(electiveId: string): Promise<ServiceResult<Array<{ id: string; name: string }>>> {
    try {
      const preceptors = await this.db
        .selectFrom('elective_preceptors')
        .innerJoin('preceptors', 'preceptors.id', 'elective_preceptors.preceptor_id')
        .select(['preceptors.id', 'preceptors.name'])
        .where('elective_preceptors.elective_id', '=', electiveId)
        .execute();

      return Result.success(preceptors.map(p => ({ id: p.id!, name: p.name })));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch preceptors for elective', error));
    }
  }

  /**
   * Add a preceptor to an elective
   */
  async addPreceptorToElective(electiveId: string, preceptorId: string): Promise<ServiceResult<void>> {
    try {
      // Check elective exists
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .select('id')
        .where('id', '=', electiveId)
        .executeTakeFirst();

      if (!elective) {
        return Result.failure(ServiceErrors.notFound('Elective', electiveId));
      }

      // Check preceptor exists
      const preceptor = await this.db
        .selectFrom('preceptors')
        .select('id')
        .where('id', '=', preceptorId)
        .executeTakeFirst();

      if (!preceptor) {
        return Result.failure(ServiceErrors.notFound('Preceptor', preceptorId));
      }

      // Check if already exists
      const existing = await this.db
        .selectFrom('elective_preceptors')
        .select('id')
        .where('elective_id', '=', electiveId)
        .where('preceptor_id', '=', preceptorId)
        .executeTakeFirst();

      if (existing) {
        return Result.success(undefined); // Already exists, no-op
      }

      await this.db
        .insertInto('elective_preceptors')
        .values({
          id: nanoid(),
          elective_id: electiveId,
          preceptor_id: preceptorId,
          created_at: new Date().toISOString(),
        })
        .execute();

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to add preceptor to elective', error));
    }
  }

  /**
   * Remove a preceptor from an elective
   */
  async removePreceptorFromElective(electiveId: string, preceptorId: string): Promise<ServiceResult<void>> {
    try {
      await this.db
        .deleteFrom('elective_preceptors')
        .where('elective_id', '=', electiveId)
        .where('preceptor_id', '=', preceptorId)
        .execute();

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to remove preceptor from elective', error));
    }
  }

  /**
   * Set all preceptors for an elective (replaces existing)
   */
  async setPreceptorsForElective(electiveId: string, preceptorIds: string[]): Promise<ServiceResult<void>> {
    try {
      // Delete existing associations
      await this.db
        .deleteFrom('elective_preceptors')
        .where('elective_id', '=', electiveId)
        .execute();

      // Add new associations
      if (preceptorIds.length > 0) {
        const now = new Date().toISOString();
        await this.db
          .insertInto('elective_preceptors')
          .values(
            preceptorIds.map(preceptorId => ({
              id: nanoid(),
              elective_id: electiveId,
              preceptor_id: preceptorId,
              created_at: now,
            }))
          )
          .execute();
      }

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to set preceptors for elective', error));
    }
  }

  /**
   * Get available preceptors for an elective (filtered by elective's sites)
   */
  async getAvailablePreceptorsForElective(electiveId: string): Promise<ServiceResult<Array<{ id: string; name: string; siteId: string; siteName: string }>>> {
    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .select('id')
        .where('id', '=', electiveId)
        .executeTakeFirst();

      if (!elective) {
        return Result.failure(ServiceErrors.notFound('Elective', electiveId));
      }

      // Get sites associated with this elective
      const electiveSites = await this.db
        .selectFrom('elective_sites')
        .select('site_id')
        .where('elective_id', '=', electiveId)
        .execute();

      const electiveSiteIds = electiveSites.map(s => s.site_id);

      if (electiveSiteIds.length === 0) {
        // No sites, return empty list
        return Result.success([]);
      }

      // Get preceptors who have availability at these sites
      const preceptors = await this.db
        .selectFrom('preceptors')
        .innerJoin('preceptor_sites', 'preceptor_sites.preceptor_id', 'preceptors.id')
        .innerJoin('sites', 'sites.id', 'preceptor_sites.site_id')
        .select(['preceptors.id', 'preceptors.name', 'sites.id as siteId', 'sites.name as siteName'])
        .where('preceptor_sites.site_id', 'in', electiveSiteIds)
        .execute();

      return Result.success(preceptors.map(p => ({
        id: p.id!,
        name: p.name,
        siteId: p.siteId!,
        siteName: p.siteName,
      })));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch available preceptors', error));
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Map database row to ClerkshipElective type
   */
  private mapElective(row: any): ClerkshipElective {
    return {
      id: row.id,
      clerkshipId: row.clerkship_id,
      name: row.name,
      minimumDays: row.minimum_days,
      isRequired: Boolean(row.is_required),
      specialty: row.specialty || undefined,
      overrideMode: row.override_mode || 'inherit',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
