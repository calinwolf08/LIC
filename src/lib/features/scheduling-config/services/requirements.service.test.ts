/**
 * Requirement Service Tests
 *
 * Tests requirement CRUD operations and validation of requirement totals.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { nanoid } from 'nanoid';
import { RequirementService } from './requirements.service';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { clearAllTestData } from '$lib/testing/integration-helpers';

describe('RequirementService', () => {
  let db: Kysely<DB>;
  let service: RequirementService;
  let testClerkshipId: string;

  beforeEach(async () => {
    db = await createTestDatabaseWithMigrations();
    service = new RequirementService(db);

    // Create a test clerkship with 20 required days
    testClerkshipId = nanoid();
    await db
      .insertInto('clerkships')
      .values({
        id: testClerkshipId,
        name: 'Test Clerkship',
        clerkship_type: 'outpatient',
        required_days: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  afterEach(async () => {
    await clearAllTestData(db);
    await cleanupTestDatabase(db);
  });

  describe('Requirement Total Validation', () => {
    it('should allow creating requirement that fits within clerkship total', async () => {
      const result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.requiredDays).toBe(5);
    });

    it('should reject requirement that exceeds clerkship total', async () => {
      const result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 25, // Exceeds 20-day total
        overrideMode: 'inherit',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.message).toContain('would exceed clerkship total');
    });

    it('should allow creating multiple requirements that sum to clerkship total', async () => {
      // Create elective requirement (5 days)
      const electiveResult = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });
      expect(electiveResult.success).toBe(true);

      // Create outpatient requirement (15 days) - should total 20
      const outpatientResult = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 15,
        overrideMode: 'inherit',
      });
      expect(outpatientResult.success).toBe(true);
    });

    it('should reject creating requirement that would exceed total with existing requirements', async () => {
      // Create first requirement (15 days)
      await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 15,
        overrideMode: 'inherit',
      });

      // Try to create second requirement (10 days) - would total 25
      const result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 10,
        overrideMode: 'inherit',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.message).toContain('would exceed clerkship total');
      expect(result.error.message).toContain('Current requirements total 15 days');
    });

    it('should allow updating requirement if total stays within limit', async () => {
      // Create requirement (5 days)
      const createResult = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) throw new Error('Expected success');

      // Update to 10 days (still within 20-day total)
      const updateResult = await service.updateRequirement(createResult.data.id, {
        requiredDays: 10,
      });

      expect(updateResult.success).toBe(true);
      if (!updateResult.success) throw new Error('Expected success');
      expect(updateResult.data.requiredDays).toBe(10);
    });

    it('should reject updating requirement if total would exceed limit', async () => {
      // Create two requirements (10 + 5 = 15 days)
      const req1Result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 10,
        overrideMode: 'inherit',
      });
      expect(req1Result.success).toBe(true);
      if (!req1Result.success) throw new Error('Expected success');

      const req2Result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });
      expect(req2Result.success).toBe(true);
      if (!req2Result.success) throw new Error('Expected success');

      // Try to update req2 to 15 days (would total 25)
      const updateResult = await service.updateRequirement(req2Result.data.id, {
        requiredDays: 15,
      });

      expect(updateResult.success).toBe(false);
      if (updateResult.success) throw new Error('Expected failure');
      expect(updateResult.error.message).toContain('would exceed clerkship total');
      expect(updateResult.error.message).toContain('Other requirements total 10 days');
    });

    it('should handle clerkship with exact sum of requirements', async () => {
      // Create requirements that exactly match the clerkship total (20 days)
      const req1 = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 10,
        overrideMode: 'inherit',
      });
      expect(req1.success).toBe(true);

      const req2 = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'inpatient',
        requiredDays: 5,
        overrideMode: 'inherit',
      });
      expect(req2.success).toBe(true);

      const req3 = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });
      expect(req3.success).toBe(true);

      // Try to add one more day - should fail
      const req4 = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 1,
        overrideMode: 'inherit',
      });
      expect(req4.success).toBe(false);
    });
  });

  describe('Basic CRUD Operations', () => {
    it('should create requirement successfully', async () => {
      const result = await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.clerkshipId).toBe(testClerkshipId);
      expect(result.data.requirementType).toBe('elective');
      expect(result.data.requiredDays).toBe(5);
    });

    it('should get requirements by clerkship', async () => {
      // Create two requirements
      await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'outpatient',
        requiredDays: 10,
        overrideMode: 'inherit',
      });

      await service.createRequirement({
        clerkshipId: testClerkshipId,
        requirementType: 'elective',
        requiredDays: 5,
        overrideMode: 'inherit',
      });

      const result = await service.getRequirementsByClerkship(testClerkshipId);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.length).toBe(2);
      expect(result.data.some((r) => r.requirementType === 'outpatient')).toBe(true);
      expect(result.data.some((r) => r.requirementType === 'elective')).toBe(true);
    });
  });
});
