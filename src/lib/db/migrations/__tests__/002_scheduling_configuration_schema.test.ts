// @ts-nocheck
/**
 * Migration 002: Scheduling Configuration Schema Tests
 *
 * Comprehensive tests for the scheduling configuration migration.
 * Tests table creation, constraints, foreign keys, indexes, and default data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect, sql } from 'kysely';
import Database from 'better-sqlite3';
import { up as runMigration } from '../002_scheduling_configuration_schema';
import { up as runInitialMigration } from '../001_initial_schema';

// Create test database
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = new Kysely({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  });

  return db;
}

describe('Migration 002: Scheduling Configuration Schema', () => {
  let db: any;

  beforeEach(async () => {
    db = createTestDb();
    // Run initial migration first
    await runInitialMigration(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('Table Creation', () => {
    it('should create all 13 new tables', async () => {
      await runMigration(db);

      const tables = await db
        .selectFrom(sql`sqlite_master`.as('sm'))
        .select('name')
        .where('type', '=', 'table')
        .execute();

      const tableNames = tables.map((t) => t.name);

      // Verify all new tables exist
      expect(tableNames).toContain('health_systems');
      expect(tableNames).toContain('sites');
      expect(tableNames).toContain('global_outpatient_defaults');
      expect(tableNames).toContain('global_inpatient_defaults');
      expect(tableNames).toContain('global_elective_defaults');
      expect(tableNames).toContain('clerkship_configurations');
      expect(tableNames).toContain('clerkship_requirements');
      expect(tableNames).toContain('clerkship_requirement_overrides');
      expect(tableNames).toContain('clerkship_electives');
      expect(tableNames).toContain('preceptor_teams');
      expect(tableNames).toContain('preceptor_team_members');
      expect(tableNames).toContain('preceptor_fallbacks');
      expect(tableNames).toContain('preceptor_capacity_rules');
    });

    it('should modify preceptors table with new columns', async () => {
      await runMigration(db);

      // Verify preceptors table has new columns
      const tableInfo = await db
        .selectFrom(sql`pragma_table_info('preceptors')`.as('pti'))
        .selectAll()
        .execute();

      const columnNames = tableInfo.map((col) => col.name);

      expect(columnNames).toContain('health_system_id');
      expect(columnNames).toContain('site_id');
    });
  });

  describe('Default Data Insertion', () => {
    it('should insert default outpatient configuration', async () => {
      await runMigration(db);

      const defaults = await db
        .selectFrom('global_outpatient_defaults')
        .selectAll()
        .executeTakeFirst();

      expect(defaults).toBeDefined();
      expect(defaults.id).toBe('default-outpatient');
      expect(defaults.assignment_strategy).toBe('continuous_single');
      expect(defaults.health_system_rule).toBe('enforce_same_system');
      expect(defaults.default_max_students_per_day).toBe(1);
      expect(defaults.default_max_students_per_year).toBe(10);
    });

    it('should insert default inpatient configuration', async () => {
      await runMigration(db);

      const defaults = await db
        .selectFrom('global_inpatient_defaults')
        .selectAll()
        .executeTakeFirst();

      expect(defaults).toBeDefined();
      expect(defaults.id).toBe('default-inpatient');
      expect(defaults.assignment_strategy).toBe('continuous_single');
      expect(defaults.block_size_days).toBe(14);
    });

    it('should insert default elective configuration', async () => {
      await runMigration(db);

      const defaults = await db
        .selectFrom('global_elective_defaults')
        .selectAll()
        .executeTakeFirst();

      expect(defaults).toBeDefined();
      expect(defaults.id).toBe('default-elective');
      expect(defaults.assignment_strategy).toBe('daily_rotation');
      expect(defaults.health_system_rule).toBe('no_preference');
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce health_system_id reference in sites table', async () => {
      await runMigration(db);

      // Try to insert site without valid health system
      await expect(
        db
          .insertInto('sites')
          .values({
            id: 'test-site',
            health_system_id: 'nonexistent-system',
            name: 'Test Site',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should allow site insertion with valid health system', async () => {
      await runMigration(db);

      // Insert health system first
      await db
        .insertInto('health_systems')
        .values({
          id: 'test-system',
          name: 'Test Health System',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Then insert site
      await db
        .insertInto('sites')
        .values({
          id: 'test-site',
          health_system_id: 'test-system',
          name: 'Test Site',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const site = await db
        .selectFrom('sites')
        .selectAll()
        .where('id', '=', 'test-site')
        .executeTakeFirst();

      expect(site).toBeDefined();
      expect(site.health_system_id).toBe('test-system');
    });

    it('should cascade delete sites when health system is deleted', async () => {
      await runMigration(db);

      // Create health system and site
      await db
        .insertInto('health_systems')
        .values({
          id: 'test-system',
          name: 'Test Health System',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('sites')
        .values({
          id: 'test-site',
          health_system_id: 'test-system',
          name: 'Test Site',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Delete health system
      await db
        .deleteFrom('health_systems')
        .where('id', '=', 'test-system')
        .execute();

      // Site should be deleted too
      const site = await db
        .selectFrom('sites')
        .selectAll()
        .where('id', '=', 'test-site')
        .executeTakeFirst();

      expect(site).toBeUndefined();
    });

    it('should enforce clerkship_id reference in clerkship_requirements', async () => {
      await runMigration(db);

      // Try to insert requirement without valid clerkship
      await expect(
        db
          .insertInto('clerkship_requirements')
          .values({
            id: 'test-req',
            clerkship_configuration_id: 'nonexistent-config',
            requirement_type: 'outpatient',
            required_days: 40,
            override_mode: 'inherit',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });
  });

  describe('Check Constraints', () => {
    it('should enforce valid assignment_strategy values', async () => {
      await runMigration(db);

      // Try to insert invalid strategy
      await expect(
        db
          .insertInto('global_outpatient_defaults')
          .values({
            id: 'test-invalid',
            assignment_strategy: 'invalid_strategy',
            health_system_rule: 'no_preference',
            default_max_students_per_day: 1,
            default_max_students_per_year: 10,
            allow_teams: 0,
            allow_fallbacks: 1,
            fallback_requires_approval: 0,
            fallback_allow_cross_system: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should enforce valid health_system_rule values', async () => {
      await runMigration(db);

      // Try to insert invalid rule
      await expect(
        db
          .insertInto('global_outpatient_defaults')
          .values({
            id: 'test-invalid-rule',
            assignment_strategy: 'continuous_single',
            health_system_rule: 'invalid_rule',
            default_max_students_per_day: 1,
            default_max_students_per_year: 10,
            allow_teams: 0,
            allow_fallbacks: 1,
            fallback_requires_approval: 0,
            fallback_allow_cross_system: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should enforce valid requirement_type values', async () => {
      await runMigration(db);

      // Create clerkship config first
      await db
        .insertInto('clerkships')
        .values({
          id: 'test-clerkship',
          name: 'Test Clerkship',
          specialty: 'Internal Medicine',
          required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('clerkship_configurations')
        .values({
          id: 'test-config',
          clerkship_id: 'test-clerkship',
          total_required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Try to insert invalid requirement type
      await expect(
        db
          .insertInto('clerkship_requirements')
          .values({
            id: 'test-req-invalid',
            clerkship_configuration_id: 'test-config',
            requirement_type: 'invalid_type',
            required_days: 40,
            override_mode: 'inherit',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should enforce valid override_mode values', async () => {
      await runMigration(db);

      // Create clerkship config first
      await db
        .insertInto('clerkships')
        .values({
          id: 'test-clerkship',
          name: 'Test Clerkship',
          specialty: 'Internal Medicine',
          required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('clerkship_configurations')
        .values({
          id: 'test-config',
          clerkship_id: 'test-clerkship',
          total_required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Try to insert invalid override mode
      await expect(
        db
          .insertInto('clerkship_requirements')
          .values({
            id: 'test-req-invalid-mode',
            clerkship_configuration_id: 'test-config',
            requirement_type: 'outpatient',
            required_days: 40,
            override_mode: 'invalid_mode',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should enforce positive required_days', async () => {
      await runMigration(db);

      // Create clerkship config first
      await db
        .insertInto('clerkships')
        .values({
          id: 'test-clerkship',
          name: 'Test Clerkship',
          specialty: 'Internal Medicine',
          required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('clerkship_configurations')
        .values({
          id: 'test-config',
          clerkship_id: 'test-clerkship',
          total_required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Try to insert zero or negative days
      await expect(
        db
          .insertInto('clerkship_requirements')
          .values({
            id: 'test-req-zero-days',
            clerkship_configuration_id: 'test-config',
            requirement_type: 'outpatient',
            required_days: 0,
            override_mode: 'inherit',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();

      await expect(
        db
          .insertInto('clerkship_requirements')
          .values({
            id: 'test-req-negative-days',
            clerkship_configuration_id: 'test-config',
            requirement_type: 'outpatient',
            required_days: -10,
            override_mode: 'inherit',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute()
      ).rejects.toThrow();
    });

    it('should enforce positive block_size_days when specified', async () => {
      await runMigration(db);

      // Try to insert invalid block size
      await expect(
        db
          .updateTable('global_inpatient_defaults')
          .set({ block_size_days: 0 })
          .where('id', '=', 'default-inpatient')
          .execute()
      ).rejects.toThrow();

      await expect(
        db
          .updateTable('global_inpatient_defaults')
          .set({ block_size_days: -7 })
          .where('id', '=', 'default-inpatient')
          .execute()
      ).rejects.toThrow();
    });
  });

  describe('Indexes', () => {
    it('should create index on health_systems.name', async () => {
      await runMigration(db);

      const indexes = await db
        .selectFrom(sql`pragma_index_list('health_systems')`.as('pil'))
        .selectAll()
        .execute();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('idx_health_systems_name');
    });

    it('should create index on sites.health_system_id', async () => {
      await runMigration(db);

      const indexes = await db
        .selectFrom(sql`pragma_index_list('sites')`.as('pil'))
        .selectAll()
        .execute();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('idx_sites_health_system_id');
    });

    it('should create index on clerkship_requirements.clerkship_configuration_id', async () => {
      await runMigration(db);

      const indexes = await db
        .selectFrom(sql`pragma_index_list('clerkship_requirements')`.as('pil'))
        .selectAll()
        .execute();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('idx_clerkship_requirements_clerkship_configuration_id');
    });

    it('should create unique index on clerkship_requirements (config_id, requirement_type)', async () => {
      await runMigration(db);

      const indexes = await db
        .selectFrom(sql`pragma_index_list('clerkship_requirements')`.as('pil'))
        .selectAll()
        .execute();

      const uniqueIndex = indexes.find(
        (idx) => idx.name === 'idx_clerkship_requirements_unique'
      );
      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex.unique).toBe(1);
    });
  });

  describe('Integration - Full Configuration Workflow', () => {
    it('should support complete configuration setup', async () => {
      await runMigration(db);

      // 1. Create health system and site
      await db
        .insertInto('health_systems')
        .values({
          id: 'hs-memorial',
          name: 'Memorial Health System',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('sites')
        .values({
          id: 'site-memorial-main',
          health_system_id: 'hs-memorial',
          name: 'Memorial Main Hospital',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // 2. Create clerkship
      await db
        .insertInto('clerkships')
        .values({
          id: 'clerkship-im',
          name: 'Internal Medicine',
          specialty: 'Internal Medicine',
          required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // 3. Create clerkship configuration
      await db
        .insertInto('clerkship_configurations')
        .values({
          id: 'config-im',
          clerkship_id: 'clerkship-im',
          total_required_days: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // 4. Create requirements with different override modes
      await db
        .insertInto('clerkship_requirements')
        .values({
          id: 'req-im-outpatient',
          clerkship_configuration_id: 'config-im',
          requirement_type: 'outpatient',
          required_days: 40,
          override_mode: 'inherit',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('clerkship_requirements')
        .values({
          id: 'req-im-inpatient',
          clerkship_configuration_id: 'config-im',
          requirement_type: 'inpatient',
          required_days: 20,
          override_mode: 'override_fields',
          override_assignment_strategy: 'block_based',
          override_block_size_days: 7,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      // Verify all data was created
      const requirements = await db
        .selectFrom('clerkship_requirements')
        .selectAll()
        .execute();

      expect(requirements).toHaveLength(2);
      expect(requirements[0].override_mode).toBe('inherit');
      expect(requirements[1].override_mode).toBe('override_fields');
      expect(requirements[1].override_assignment_strategy).toBe('block_based');
    });
  });
});
