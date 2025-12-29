/**
 * Elective Service
 *
 * Manages clerkship elective options with validation, site and preceptor associations.
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
   * Create a new elective
   */
  async createElective(
    requirementId: string,
    input: ClerkshipElectiveInput
  ): Promise<ServiceResult<ClerkshipElective>> {
    log.debug('Creating elective', {
      requirementId,
      name: input.name,
      minimumDays: input.minimumDays
    });

    // Validate input
    const validation = clerkshipElectiveInputSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Elective creation validation failed', {
        requirementId,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid elective data', validation.error.errors)
      );
    }

    const data = validation.data;

    try {
      // Check requirement exists and is elective type
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .select(['id', 'requirement_type', 'required_days'])
        .where('id', '=', requirementId)
        .executeTakeFirst();

      if (!requirement) {
        log.warn('Requirement not found for elective', { requirementId });
        return Result.failure(ServiceErrors.notFound('Requirement', requirementId));
      }

      if (requirement.requirement_type !== 'elective') {
        log.warn('Elective creation blocked - requirement not elective type', {
          requirementId,
          requirementType: requirement.requirement_type
        });
        return Result.failure(
          ServiceErrors.conflict('Electives can only be added to elective requirements')
        );
      }

      // Validate minimum days
      if (data.minimumDays > requirement.required_days) {
        log.warn('Elective creation blocked - minimum days exceeds requirement total', {
          minimumDays: data.minimumDays,
          requiredDays: requirement.required_days
        });
        return Result.failure(
          ServiceErrors.conflict(
            `Minimum days (${data.minimumDays}) cannot exceed requirement total (${requirement.required_days})`
          )
        );
      }

      const electiveId = nanoid();
      const now = new Date().toISOString();

      const elective = await this.db
        .insertInto('clerkship_electives')
        .values({
          id: electiveId,
          requirement_id: requirementId,
          name: data.name,
          minimum_days: data.minimumDays,
          is_required: data.isRequired ? 1 : 0,
          specialty: data.specialty || null,
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
        requirementId: elective.requirement_id,
        name: elective.name,
        minimumDays: elective.minimum_days,
        siteCount: data.siteIds?.length || 0,
        preceptorCount: data.preceptorIds?.length || 0
      });

      return Result.success(this.mapElective(elective));
    } catch (error) {
      log.error('Failed to create elective', { requirementId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to create elective', error));
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
   * Get all electives for a requirement
   */
  async getElectivesByRequirement(requirementId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    log.debug('Fetching electives for requirement', { requirementId });

    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('requirement_id', '=', requirementId)
        .execute();

      log.info('Electives fetched for requirement', { requirementId, count: electives.length });
      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      log.error('Failed to fetch electives for requirement', { requirementId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch electives', error));
    }
  }

  /**
   * Get required electives for a requirement
   */
  async getRequiredElectives(requirementId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('requirement_id', '=', requirementId)
        .where('is_required', '=', 1)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch required electives', error));
    }
  }

  /**
   * Get optional electives for a requirement
   */
  async getOptionalElectives(requirementId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .selectAll()
        .where('requirement_id', '=', requirementId)
        .where('is_required', '=', 0)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch optional electives', error));
    }
  }

  /**
   * Get all electives for a clerkship (across all requirements)
   */
  async getElectivesByClerkship(clerkshipId: string): Promise<ServiceResult<ClerkshipElective[]>> {
    try {
      const electives = await this.db
        .selectFrom('clerkship_electives')
        .innerJoin('clerkship_requirements', 'clerkship_requirements.id', 'clerkship_electives.requirement_id')
        .selectAll('clerkship_electives')
        .where('clerkship_requirements.clerkship_id', '=', clerkshipId)
        .execute();

      return Result.success(electives.map(e => this.mapElective(e)));
    } catch (error) {
      return Result.failure(ServiceErrors.databaseError('Failed to fetch electives for clerkship', error));
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

      // Get requirement for validation
      const requirement = await this.db
        .selectFrom('clerkship_requirements')
        .select(['id', 'required_days'])
        .where('id', '=', existing.requirement_id)
        .executeTakeFirst();

      if (!requirement) {
        return Result.failure(ServiceErrors.notFound('Requirement', existing.requirement_id));
      }

      // Build update data
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.minimumDays !== undefined) {
        if (data.minimumDays > requirement.required_days) {
          return Result.failure(
            ServiceErrors.conflict(
              `Minimum days (${data.minimumDays}) cannot exceed requirement total (${requirement.required_days})`
            )
          );
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
   * Get available preceptors for an elective
   *
   * Note: Returns all preceptors since specialty matching is disabled.
   */
  async getAvailablePreceptors(electiveId: string): Promise<ServiceResult<Array<{ id: string; name: string }>>> {
    try {
      const elective = await this.db
        .selectFrom('clerkship_electives')
        .select('id')
        .where('id', '=', electiveId)
        .executeTakeFirst();

      if (!elective) {
        return Result.failure(ServiceErrors.notFound('Elective', electiveId));
      }

      // Return all preceptors (specialty matching disabled)
      const preceptors = await this.db
        .selectFrom('preceptors')
        .select(['id', 'name'])
        .execute();

      return Result.success(preceptors.map(p => ({ id: p.id!, name: p.name })));
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
      requirementId: row.requirement_id,
      name: row.name,
      minimumDays: row.minimum_days,
      isRequired: Boolean(row.is_required),
      specialty: row.specialty || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
