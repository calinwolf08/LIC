/**
 * Integration Test: Multi-Requirement Scheduling
 *
 * Tests that clerkships with multiple requirements (e.g., outpatient + elective)
 * are properly scheduled, with each requirement counting toward the clerkship's total.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import {
  createTestClerkship,
  createTestRequirement,
  createTestStudents,
  createTestPreceptor,
  createTestHealthSystem,
  createPreceptorAvailability,
  clearAllTestData,
  generateDateRange,
  createTestTeam,
} from '$lib/testing/integration-helpers';
import { nanoid } from 'nanoid';

describe('Integration Suite 13: Multi-Requirement Scheduling', () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    db = await createTestDatabaseWithMigrations();
  });

  afterEach(async () => {
    await clearAllTestData(db);
    await cleanupTestDatabase(db);
  });

  /**
   * Helper to create an elective with associations
   */
  async function createElective(
    requirementId: string,
    options: {
      name: string;
      minimumDays: number;
      isRequired: boolean;
      siteIds: string[];
      preceptorIds: string[];
    }
  ): Promise<string> {
    const electiveId = nanoid();

    await db
      .insertInto('clerkship_electives')
      .values({
        id: electiveId,
        requirement_id: requirementId,
        name: options.name,
        minimum_days: options.minimumDays,
        specialty: null,
        is_required: options.isRequired ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Add site associations
    for (const siteId of options.siteIds) {
      await db
        .insertInto('elective_sites')
        .values({
          id: nanoid(),
          elective_id: electiveId,
          site_id: siteId,
          created_at: new Date().toISOString(),
        })
        .execute();
    }

    // Add preceptor associations
    for (const preceptorId of options.preceptorIds) {
      await db
        .insertInto('elective_preceptors')
        .values({
          id: nanoid(),
          elective_id: electiveId,
          preceptor_id: preceptorId,
          created_at: new Date().toISOString(),
        })
        .execute();
    }

    return electiveId;
  }

  describe('Test 1: Clerkship with Outpatient + Elective Requirements', () => {
    it('should schedule both outpatient and elective requirements for the same clerkship', async () => {
      const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

      // Create clerkship with 20 total required days
      const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

      // Create outpatient requirement (15 days)
      const outpatientReqId = await createTestRequirement(db, clerkshipId, {
        requirementType: 'outpatient',
        requiredDays: 15,
      });

      // Create elective requirement (5 days)
      const electiveReqId = await createTestRequirement(db, clerkshipId, {
        requirementType: 'elective',
        requiredDays: 5,
      });

      // Create preceptor for outpatient
      const outpatientPreceptorId = await createTestPreceptor(db, {
        name: 'Dr. Outpatient',
        healthSystemId,
        siteId,
      });

      // Create team for outpatient requirement
      await createTestTeam(
        db,
        clerkshipId,
        'Outpatient Team',
        [{ preceptorId: outpatientPreceptorId, priority: 1, isFallbackOnly: false }]
      );

      // Create preceptor for elective
      const electivePreceptorId = await createTestPreceptor(db, {
        name: 'Dr. Cardiology',
        healthSystemId,
        siteId,
      });

      // Create elective
      const electiveId = await createElective(electiveReqId, {
        name: 'Cardiology Elective',
        minimumDays: 5,
        isRequired: true,
        siteIds: [siteId],
        preceptorIds: [electivePreceptorId],
      });

      // Create student
      const studentIds = await createTestStudents(db, 1);
      const dates = generateDateRange('2025-12-01', 30);

      // Create availability for both preceptors
      await createPreceptorAvailability(db, outpatientPreceptorId, siteId, dates);
      await createPreceptorAvailability(db, electivePreceptorId, siteId, dates);

      // Generate schedule
      const engine = new ConfigurableSchedulingEngine(db);
      const result = await engine.schedule(studentIds, [clerkshipId], {
        startDate: '2025-12-01',
        endDate: '2025-12-31',
      });

      // Verify schedule succeeded
      expect(result.success).toBe(true);

      // Verify assignments were created
      const allAssignments = await db
        .selectFrom('schedule_assignments')
        .selectAll()
        .where('student_id', '=', studentIds[0])
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      // Should have 20 total days (15 outpatient + 5 elective)
      expect(allAssignments.length).toBeGreaterThanOrEqual(20);

      // Verify elective assignments
      const electiveAssignments = allAssignments.filter((a) => a.elective_id === electiveId);
      expect(electiveAssignments.length).toBeGreaterThanOrEqual(5);

      // Verify outpatient assignments (no elective_id)
      const outpatientAssignments = allAssignments.filter((a) => !a.elective_id);
      expect(outpatientAssignments.length).toBeGreaterThanOrEqual(15);

      // Verify no date conflicts (student not assigned to two things on same day)
      const dateMap = new Map<string, number>();
      for (const assignment of allAssignments) {
        const count = dateMap.get(assignment.date) || 0;
        dateMap.set(assignment.date, count + 1);
      }

      for (const [date, count] of dateMap.entries()) {
        expect(count).toBe(1); // Each date should have exactly 1 assignment
      }
    });
  });

  describe('Test 2: Multiple Students with Multi-Requirement Clerkship', () => {
    it('should schedule multiple students to clerkship with outpatient and elective requirements', async () => {
      const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

      // Create clerkship
      const clerkshipId = await createTestClerkship(db, 'Internal Medicine', 'outpatient');

      // Create outpatient requirement (10 days)
      await createTestRequirement(db, clerkshipId, {
        requirementType: 'outpatient',
        requiredDays: 10,
      });

      // Create elective requirement (5 days)
      const electiveReqId = await createTestRequirement(db, clerkshipId, {
        requirementType: 'elective',
        requiredDays: 5,
      });

      // Create preceptors
      const preceptor1Id = await createTestPreceptor(db, {
        name: 'Dr. Outpatient 1',
        healthSystemId,
        siteId,
      });

      const preceptor2Id = await createTestPreceptor(db, {
        name: 'Dr. Elective',
        healthSystemId,
        siteId,
      });

      // Create team for outpatient
      await createTestTeam(
        db,
        clerkshipId,
        'IM Team',
        [{ preceptorId: preceptor1Id, priority: 1, isFallbackOnly: false }]
      );

      // Create elective
      await createElective(electiveReqId, {
        name: 'Cardiology',
        minimumDays: 5,
        isRequired: true,
        siteIds: [siteId],
        preceptorIds: [preceptor2Id],
      });

      // Create 2 students
      const studentIds = await createTestStudents(db, 2);
      const dates = generateDateRange('2025-12-01', 30);

      // Create availability
      await createPreceptorAvailability(db, preceptor1Id, siteId, dates);
      await createPreceptorAvailability(db, preceptor2Id, siteId, dates);

      // Generate schedule
      const engine = new ConfigurableSchedulingEngine(db);
      const result = await engine.schedule(studentIds, [clerkshipId], {
        startDate: '2025-12-01',
        endDate: '2025-12-31',
      });

      expect(result.success).toBe(true);

      // Verify both students got scheduled
      for (const studentId of studentIds) {
        const assignments = await db
          .selectFrom('schedule_assignments')
          .selectAll()
          .where('student_id', '=', studentId)
          .where('clerkship_id', '=', clerkshipId)
          .execute();

        // Each student should have at least 15 days (10 outpatient + 5 elective)
        expect(assignments.length).toBeGreaterThanOrEqual(15);

        // Verify elective days
        const electiveAssignments = assignments.filter((a) => a.elective_id);
        expect(electiveAssignments.length).toBeGreaterThanOrEqual(5);

        // Verify outpatient days
        const outpatientAssignments = assignments.filter((a) => !a.elective_id);
        expect(outpatientAssignments.length).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('Test 3: Multiple Outpatient Requirements + Elective', () => {
    it('should schedule clerkship with multiple outpatient requirements plus elective', async () => {
      const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

      // Create outpatient clerkship with 28 total days
      const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

      // Create two separate outpatient requirements (e.g., clinic vs continuity)
      await createTestRequirement(db, clerkshipId, {
        requirementType: 'outpatient',
        requiredDays: 12,
      });

      await createTestRequirement(db, clerkshipId, {
        requirementType: 'outpatient',
        requiredDays: 8,
      });

      // Create elective requirement
      const electiveReqId = await createTestRequirement(db, clerkshipId, {
        requirementType: 'elective',
        requiredDays: 8,
      });

      // Create preceptors for each requirement type
      const outpatientPreceptor1Id = await createTestPreceptor(db, {
        name: 'Dr. Clinic',
        healthSystemId,
        siteId,
      });

      const outpatientPreceptor2Id = await createTestPreceptor(db, {
        name: 'Dr. Continuity',
        healthSystemId,
        siteId,
      });

      const electivePreceptorId = await createTestPreceptor(db, {
        name: 'Dr. Sports Medicine',
        healthSystemId,
        siteId,
      });

      // Create teams for outpatient requirements
      await createTestTeam(
        db,
        clerkshipId,
        'Clinic Team',
        [{ preceptorId: outpatientPreceptor1Id, priority: 1, isFallbackOnly: false }]
      );

      await createTestTeam(
        db,
        clerkshipId,
        'Continuity Team',
        [{ preceptorId: outpatientPreceptor2Id, priority: 1, isFallbackOnly: false }]
      );

      // Create elective
      await createElective(electiveReqId, {
        name: 'Sports Medicine Elective',
        minimumDays: 8,
        isRequired: true,
        siteIds: [siteId],
        preceptorIds: [electivePreceptorId],
      });

      // Create student and availability
      const studentIds = await createTestStudents(db, 1);
      const dates = generateDateRange('2025-12-01', 40);

      await createPreceptorAvailability(db, outpatientPreceptor1Id, siteId, dates);
      await createPreceptorAvailability(db, outpatientPreceptor2Id, siteId, dates);
      await createPreceptorAvailability(db, electivePreceptorId, siteId, dates);

      // Generate schedule
      const engine = new ConfigurableSchedulingEngine(db);
      const result = await engine.schedule(studentIds, [clerkshipId], {
        startDate: '2025-12-01',
        endDate: '2026-01-31',
      });

      expect(result.success).toBe(true);

      const assignments = await db
        .selectFrom('schedule_assignments')
        .selectAll()
        .where('student_id', '=', studentIds[0])
        .where('clerkship_id', '=', clerkshipId)
        .execute();

      // Should have at least 28 days total (12 + 8 + 8)
      expect(assignments.length).toBeGreaterThanOrEqual(28);

      // Check elective vs non-elective assignments
      const electiveCount = assignments.filter((a) => a.elective_id).length;
      const outpatientCount = assignments.filter((a) => !a.elective_id).length;

      expect(electiveCount).toBeGreaterThanOrEqual(8);
      expect(outpatientCount).toBeGreaterThanOrEqual(20); // 12 + 8 = 20 outpatient days

      // Verify no date conflicts
      const dateMap = new Map<string, number>();
      for (const assignment of assignments) {
        const count = dateMap.get(assignment.date) || 0;
        dateMap.set(assignment.date, count + 1);
      }

      for (const [date, count] of dateMap.entries()) {
        expect(count).toBe(1); // Each date should have exactly 1 assignment
      }
    });
  });
});
