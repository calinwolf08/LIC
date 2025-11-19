/**
 * Health System Service Tests
 *
 * Comprehensive tests for HealthSystemService CRUD operations and business rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthSystemService } from './health-systems.service';
import { ServiceErrorCode } from './service-errors';
import { createTestDatabase, cleanupTestDatabase } from '$lib/db/test-utils';
import type { Kysely } from 'kysely';
import type { Database } from '$lib/db/types';

describe('HealthSystemService', () => {
  let db: Kysely<Database>;
  let service: HealthSystemService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = new HealthSystemService(db);
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  describe('createHealthSystem', () => {
    it('should create a health system with valid data', async () => {
      const input = {
        name: 'Test Health System',
        location: 'Test City',
        description: 'A test health system',
      };

      const result = await service.createHealthSystem(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(input.name);
        expect(result.data.location).toBe(input.location);
        expect(result.data.description).toBe(input.description);
        expect(result.data.id).toBeDefined();
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should create a health system with minimal data', async () => {
      const input = {
        name: 'Minimal System',
      };

      const result = await service.createHealthSystem(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(input.name);
        expect(result.data.location).toBeUndefined();
        expect(result.data.description).toBeUndefined();
      }
    });

    it('should reject empty name', async () => {
      const input = {
        name: '',
      };

      const result = await service.createHealthSystem(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ServiceErrorCode.VALIDATION_ERROR);
      }
    });
  });

  describe('getHealthSystem', () => {
    it('should retrieve an existing health system', async () => {
      const input = {
        name: 'Test System',
        location: 'Test Location',
      };

      const createResult = await service.createHealthSystem(input);
      expect(createResult.success).toBe(true);

      if (createResult.success) {
        const getResult = await service.getHealthSystem(createResult.data.id);

        expect(getResult.success).toBe(true);
        if (getResult.success && getResult.data) {
          expect(getResult.data.id).toBe(createResult.data.id);
          expect(getResult.data.name).toBe(input.name);
        }
      }
    });

    it('should return null for non-existent health system', async () => {
      const result = await service.getHealthSystem('non-existent-id');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('listHealthSystems', () => {
    it('should return empty list when no health systems exist', async () => {
      const result = await service.listHealthSystems();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('should return all health systems sorted by name', async () => {
      await service.createHealthSystem({ name: 'B System' });
      await service.createHealthSystem({ name: 'A System' });
      await service.createHealthSystem({ name: 'C System' });

      const result = await service.listHealthSystems();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe('A System');
        expect(result.data[1].name).toBe('B System');
        expect(result.data[2].name).toBe('C System');
      }
    });
  });

  describe('updateHealthSystem', () => {
    it('should update an existing health system', async () => {
      const createResult = await service.createHealthSystem({
        name: 'Original Name',
        location: 'Original Location',
      });

      expect(createResult.success).toBe(true);

      if (createResult.success) {
        const updateResult = await service.updateHealthSystem(createResult.data.id, {
          name: 'Updated Name',
          location: 'Updated Location',
          description: 'New description',
        });

        expect(updateResult.success).toBe(true);
        if (updateResult.success) {
          expect(updateResult.data.name).toBe('Updated Name');
          expect(updateResult.data.location).toBe('Updated Location');
          expect(updateResult.data.description).toBe('New description');
        }
      }
    });

    it('should return error for non-existent health system', async () => {
      const result = await service.updateHealthSystem('non-existent-id', {
        name: 'Updated Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ServiceErrorCode.NOT_FOUND);
      }
    });
  });

  describe('deleteHealthSystem', () => {
    it('should delete an existing health system', async () => {
      const createResult = await service.createHealthSystem({ name: 'To Delete' });
      expect(createResult.success).toBe(true);

      if (createResult.success) {
        const deleteResult = await service.deleteHealthSystem(createResult.data.id);

        expect(deleteResult.success).toBe(true);

        // Verify it's deleted
        const getResult = await service.getHealthSystem(createResult.data.id);
        expect(getResult.success).toBe(true);
        if (getResult.success) {
          expect(getResult.data).toBeNull();
        }
      }
    });

    it('should return error for non-existent health system', async () => {
      const result = await service.deleteHealthSystem('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ServiceErrorCode.NOT_FOUND);
      }
    });

    it('should prevent deletion when sites exist', async () => {
      const hsResult = await service.createHealthSystem({ name: 'System with Sites' });
      expect(hsResult.success).toBe(true);

      if (hsResult.success) {
        // Create a site
        await service.createSite(hsResult.data.id, { name: 'Test Site' });

        // Try to delete health system
        const deleteResult = await service.deleteHealthSystem(hsResult.data.id);

        expect(deleteResult.success).toBe(false);
        if (!deleteResult.success) {
          expect(deleteResult.error.code).toBe(ServiceErrorCode.DEPENDENCY_ERROR);
        }
      }
    });
  });

  describe('createSite', () => {
    it('should create a site within a health system', async () => {
      const hsResult = await service.createHealthSystem({ name: 'Test System' });
      expect(hsResult.success).toBe(true);

      if (hsResult.success) {
        const siteInput = {
          name: 'Test Site',
          address: '123 Test St',
        };

        const siteResult = await service.createSite(hsResult.data.id, siteInput);

        expect(siteResult.success).toBe(true);
        if (siteResult.success) {
          expect(siteResult.data.name).toBe(siteInput.name);
          expect(siteResult.data.address).toBe(siteInput.address);
          expect(siteResult.data.healthSystemId).toBe(hsResult.data.id);
        }
      }
    });

    it('should reject site for non-existent health system', async () => {
      const result = await service.createSite('non-existent-id', { name: 'Test Site' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ServiceErrorCode.NOT_FOUND);
      }
    });
  });

  describe('getSitesBySystem', () => {
    it('should return all sites for a health system', async () => {
      const hsResult = await service.createHealthSystem({ name: 'Test System' });
      expect(hsResult.success).toBe(true);

      if (hsResult.success) {
        await service.createSite(hsResult.data.id, { name: 'Site A' });
        await service.createSite(hsResult.data.id, { name: 'Site B' });

        const sitesResult = await service.getSitesBySystem(hsResult.data.id);

        expect(sitesResult.success).toBe(true);
        if (sitesResult.success) {
          expect(sitesResult.data).toHaveLength(2);
        }
      }
    });
  });

  describe('updateSite', () => {
    it('should update an existing site', async () => {
      const hsResult = await service.createHealthSystem({ name: 'Test System' });
      expect(hsResult.success).toBe(true);

      if (hsResult.success) {
        const siteResult = await service.createSite(hsResult.data.id, {
          name: 'Original Site',
        });

        expect(siteResult.success).toBe(true);

        if (siteResult.success) {
          const updateResult = await service.updateSite(siteResult.data.id, {
            name: 'Updated Site',
            address: 'New Address',
          });

          expect(updateResult.success).toBe(true);
          if (updateResult.success) {
            expect(updateResult.data.name).toBe('Updated Site');
            expect(updateResult.data.address).toBe('New Address');
          }
        }
      }
    });
  });

  describe('deleteSite', () => {
    it('should delete an existing site', async () => {
      const hsResult = await service.createHealthSystem({ name: 'Test System' });
      expect(hsResult.success).toBe(true);

      if (hsResult.success) {
        const siteResult = await service.createSite(hsResult.data.id, { name: 'To Delete' });
        expect(siteResult.success).toBe(true);

        if (siteResult.success) {
          const deleteResult = await service.deleteSite(siteResult.data.id);

          expect(deleteResult.success).toBe(true);

          // Verify it's deleted
          const getResult = await service.getSite(siteResult.data.id);
          expect(getResult.success).toBe(true);
          if (getResult.success) {
            expect(getResult.data).toBeNull();
          }
        }
      }
    });
  });
});
