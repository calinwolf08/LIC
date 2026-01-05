/**
 * Health System Service
 *
 * Manages health systems and clinical sites with CRUD operations and business rules.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { HealthSystem, Site } from '$lib/features/scheduling-config/types';
import {
  healthSystemInputSchema,
  siteInputSchema,
  type HealthSystemInput,
  type SiteInput,
} from '../schemas';
import { siteValidationSchema } from '../schemas/health-systems.schemas';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { nanoid } from 'nanoid';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling-config:health-systems');

/**
 * Health System Service
 *
 * Provides CRUD operations for health systems and sites with validation
 * and business rule enforcement.
 */
export class HealthSystemService {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create a new health system
   */
  async createHealthSystem(input: HealthSystemInput): Promise<ServiceResult<HealthSystem>> {
    log.debug('Creating health system', { name: input.name });

    // Validate input
    const validation = healthSystemInputSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Health system creation validation failed', {
        name: input.name,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid health system data', validation.error.errors)
      );
    }

    try {
      const healthSystem = await this.db
        .insertInto('health_systems')
        .values({
          id: nanoid(),
          name: input.name,
          location: input.location || null,
          description: input.description || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Health system created', {
        id: healthSystem.id,
        name: healthSystem.name,
        location: healthSystem.location
      });

      return Result.success(this.mapHealthSystem(healthSystem));
    } catch (error) {
      log.error('Failed to create health system', { name: input.name, error });
      return Result.failure(ServiceErrors.databaseError('Failed to create health system', error));
    }
  }

  /**
   * Get health system by ID
   */
  async getHealthSystem(id: string): Promise<ServiceResult<HealthSystem | null>> {
    log.debug('Fetching health system', { id });

    try {
      const healthSystem = await this.db
        .selectFrom('health_systems')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!healthSystem) {
        log.debug('Health system not found', { id });
        return Result.success(null);
      }

      log.info('Health system fetched', {
        id: healthSystem.id,
        name: healthSystem.name
      });

      return Result.success(this.mapHealthSystem(healthSystem));
    } catch (error) {
      log.error('Failed to fetch health system', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch health system', error));
    }
  }

  /**
   * List all health systems
   */
  async listHealthSystems(): Promise<ServiceResult<HealthSystem[]>> {
    log.debug('Listing all health systems');

    try {
      const healthSystems = await this.db
        .selectFrom('health_systems')
        .selectAll()
        .orderBy('name', 'asc')
        .execute();

      log.info('Health systems listed', { count: healthSystems.length });

      return Result.success(healthSystems.map(hs => this.mapHealthSystem(hs)));
    } catch (error) {
      log.error('Failed to list health systems', { error });
      return Result.failure(ServiceErrors.databaseError('Failed to list health systems', error));
    }
  }

  /**
   * Update health system
   */
  async updateHealthSystem(id: string, input: HealthSystemInput): Promise<ServiceResult<HealthSystem>> {
    log.debug('Updating health system', { id, name: input.name });

    // Validate input
    const validation = healthSystemInputSchema.safeParse(input);
    if (!validation.success) {
      log.warn('Health system update validation failed', {
        id,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(
        ServiceErrors.validationError('Invalid health system data', validation.error.errors)
      );
    }

    try {
      // Check if exists
      const existing = await this.db
        .selectFrom('health_systems')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        log.warn('Health system not found for update', { id });
        return Result.failure(ServiceErrors.notFound('Health system', id));
      }

      const updated = await this.db
        .updateTable('health_systems')
        .set({
          name: input.name,
          location: input.location || null,
          description: input.description || null,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Health system updated', {
        id: updated.id,
        name: updated.name,
        location: updated.location
      });

      return Result.success(this.mapHealthSystem(updated));
    } catch (error) {
      log.error('Failed to update health system', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to update health system', error));
    }
  }

  /**
   * Get dependency counts for a health system
   * Returns counts of all entities that reference this health system
   */
  async getHealthSystemDependencies(id: string): Promise<ServiceResult<{
    sites: number;
    preceptors: number;
    studentOnboarding: number;
    total: number;
  }>> {
    log.debug('Checking health system dependencies', { id });

    try {
      // Check for dependent sites
      const siteCount = await this.db
        .selectFrom('sites')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('health_system_id', '=', id)
        .executeTakeFirst();

      // Check for dependent preceptors
      const preceptorCount = await this.db
        .selectFrom('preceptors')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('health_system_id', '=', id)
        .executeTakeFirst();

      // Check for student onboarding records (these cascade delete, but good to know)
      const studentOnboardingCount = await this.db
        .selectFrom('student_health_system_onboarding')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('health_system_id', '=', id)
        .executeTakeFirst();

      const sites = siteCount?.count ?? 0;
      const preceptors = preceptorCount?.count ?? 0;
      const studentOnboarding = studentOnboardingCount?.count ?? 0;

      log.info('Health system dependencies checked', {
        id,
        sites,
        preceptors,
        studentOnboarding,
        total: sites + preceptors
      });

      return Result.success({
        sites,
        preceptors,
        studentOnboarding,
        total: sites + preceptors
      });
    } catch (error) {
      log.error('Failed to check health system dependencies', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to check dependencies', error));
    }
  }

  /**
   * Delete health system
   *
   * Business rule: Cannot delete if sites or preceptors assigned
   */
  async deleteHealthSystem(id: string): Promise<ServiceResult<boolean>> {
    log.debug('Deleting health system', { id });

    try {
      // Check for dependent sites
      const siteCount = await this.db
        .selectFrom('sites')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('health_system_id', '=', id)
        .executeTakeFirst();

      if (siteCount && siteCount.count > 0) {
        log.warn('Health system deletion blocked by site dependencies', {
          id,
          siteCount: siteCount.count
        });
        return Result.failure(
          ServiceErrors.dependencyError('Health system', 'sites', {
            siteCount: siteCount.count,
          })
        );
      }

      // Check for dependent preceptors
      const preceptorCount = await this.db
        .selectFrom('preceptors')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('health_system_id', '=', id)
        .executeTakeFirst();

      if (preceptorCount && preceptorCount.count > 0) {
        log.warn('Health system deletion blocked by preceptor dependencies', {
          id,
          preceptorCount: preceptorCount.count
        });
        return Result.failure(
          ServiceErrors.dependencyError('Health system', 'preceptors', {
            preceptorCount: preceptorCount.count,
          })
        );
      }

      // Delete
      const result = await this.db.deleteFrom('health_systems').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        log.warn('Health system not found for deletion', { id });
        return Result.failure(ServiceErrors.notFound('Health system', id));
      }

      log.info('Health system deleted', { id });
      return Result.success(true);
    } catch (error) {
      log.error('Failed to delete health system', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to delete health system', error));
    }
  }

  /**
   * Create a new site within a health system
   */
  async createSite(healthSystemId: string, input: SiteInput): Promise<ServiceResult<Site>> {
    log.debug('Creating site', { healthSystemId, siteName: input.name });

    // Validate input
    const validation = siteValidationSchema.safeParse({
      ...input,
      healthSystemId,
    });
    if (!validation.success) {
      log.warn('Site creation validation failed', {
        healthSystemId,
        siteName: input.name,
        errors: validation.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
      return Result.failure(ServiceErrors.validationError('Invalid site data', validation.error.errors));
    }

    try {
      // Check health system exists
      const healthSystem = await this.db
        .selectFrom('health_systems')
        .select('id')
        .where('id', '=', healthSystemId)
        .executeTakeFirst();

      if (!healthSystem) {
        log.warn('Health system not found for site creation', { healthSystemId });
        return Result.failure(ServiceErrors.notFound('Health system', healthSystemId));
      }

      const site = await this.db
        .insertInto('sites')
        .values({
          id: nanoid(),
          health_system_id: healthSystemId,
          name: input.name,
          address: input.address || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Site created', {
        id: site.id,
        healthSystemId: site.health_system_id,
        name: site.name
      });

      return Result.success(this.mapSite(site));
    } catch (error) {
      log.error('Failed to create site', { healthSystemId, siteName: input.name, error });
      return Result.failure(ServiceErrors.databaseError('Failed to create site', error));
    }
  }

  /**
   * Get site by ID
   */
  async getSite(id: string): Promise<ServiceResult<Site | null>> {
    log.debug('Fetching site', { id });

    try {
      const site = await this.db.selectFrom('sites').selectAll().where('id', '=', id).executeTakeFirst();

      if (!site) {
        log.debug('Site not found', { id });
        return Result.success(null);
      }

      log.info('Site fetched', {
        id: site.id,
        healthSystemId: site.health_system_id,
        name: site.name
      });

      return Result.success(this.mapSite(site));
    } catch (error) {
      log.error('Failed to fetch site', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch site', error));
    }
  }

  /**
   * Get all sites for a health system
   */
  async getSitesBySystem(healthSystemId: string): Promise<ServiceResult<Site[]>> {
    log.debug('Fetching sites for health system', { healthSystemId });

    try {
      const sites = await this.db
        .selectFrom('sites')
        .selectAll()
        .where('health_system_id', '=', healthSystemId)
        .orderBy('name', 'asc')
        .execute();

      log.info('Sites fetched for health system', {
        healthSystemId,
        siteCount: sites.length
      });

      return Result.success(sites.map(site => this.mapSite(site)));
    } catch (error) {
      log.error('Failed to fetch sites for health system', { healthSystemId, error });
      return Result.failure(ServiceErrors.databaseError('Failed to fetch sites', error));
    }
  }

  /**
   * Update site
   */
  async updateSite(id: string, input: Partial<SiteInput>): Promise<ServiceResult<Site>> {
    log.debug('Updating site', { id, updates: Object.keys(input) });

    try {
      // Check if exists
      const existing = await this.db.selectFrom('sites').select('id').where('id', '=', id).executeTakeFirst();

      if (!existing) {
        log.warn('Site not found for update', { id });
        return Result.failure(ServiceErrors.notFound('Site', id));
      }

      const updateData: { name?: string; address?: string | null; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      if (input.address !== undefined) {
        updateData.address = input.address || null;
      }

      const updated = await this.db
        .updateTable('sites')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      log.info('Site updated', {
        id: updated.id,
        healthSystemId: updated.health_system_id,
        name: updated.name
      });

      return Result.success(this.mapSite(updated));
    } catch (error) {
      log.error('Failed to update site', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to update site', error));
    }
  }

  /**
   * Delete site
   *
   * Business rule: Cannot delete if preceptors assigned
   */
  async deleteSite(id: string): Promise<ServiceResult<boolean>> {
    log.debug('Deleting site', { id });

    try {
      // Check for dependent preceptors (via preceptor_sites table)
      const preceptorCount = await this.db
        .selectFrom('preceptor_sites')
        .select(({ fn }) => [fn.count<number>('preceptor_id').as('count')])
        .where('site_id', '=', id)
        .executeTakeFirst();

      if (preceptorCount && preceptorCount.count > 0) {
        log.warn('Site deletion blocked by preceptor dependencies', {
          id,
          preceptorCount: preceptorCount.count
        });
        return Result.failure(
          ServiceErrors.dependencyError('Site', 'preceptors', {
            preceptorCount: preceptorCount.count,
          })
        );
      }

      // Delete
      const result = await this.db.deleteFrom('sites').where('id', '=', id).execute();

      if (result[0].numDeletedRows === BigInt(0)) {
        log.warn('Site not found for deletion', { id });
        return Result.failure(ServiceErrors.notFound('Site', id));
      }

      log.info('Site deleted', { id });
      return Result.success(true);
    } catch (error) {
      log.error('Failed to delete site', { id, error });
      return Result.failure(ServiceErrors.databaseError('Failed to delete site', error));
    }
  }

  /**
   * Map database row to HealthSystem type
   */
  private mapHealthSystem(row: any): HealthSystem {
    return {
      id: row.id,
      name: row.name,
      location: row.location || undefined,
      description: row.description || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to Site type
   */
  private mapSite(row: any): Site {
    return {
      id: row.id,
      healthSystemId: row.health_system_id,
      name: row.name,
      address: row.address || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
