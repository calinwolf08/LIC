# Step 01: Database Schema Design

## Objective

Design and implement the complete relational database schema to support all 8 configuration areas. This schema will store per-clerkship configuration settings and enable the scheduling engine to adapt its behavior based on these settings.

## Scope

### New Tables to Create

1. **clerkship_configurations**
   - Links to clerkships table (one-to-one relationship)
   - Stores assignment strategy, requirement structure, health system rules
   - Contains block size configuration and general settings

2. **clerkship_requirements**
   - Stores split requirements for each clerkship (inpatient/outpatient)
   - Links to clerkships table (one-to-many relationship)
   - Includes requirement type (outpatient, inpatient, elective)
   - Stores required days and assignment mode for each requirement type

3. **clerkship_electives**
   - Defines available electives for each clerkship
   - Links to clerkship_configurations (one-to-many relationship)
   - Stores elective name, minimum days, specialty requirements

4. **preceptor_teams**
   - Defines valid team groupings of preceptors
   - Links to clerkships table (teams can be clerkship-specific)
   - Stores team metadata (health system consistency required, etc.)

5. **preceptor_team_members**
   - Junction table for many-to-many relationship between teams and preceptors
   - Links preceptor_teams and preceptors
   - Stores member role/priority within team

6. **preceptor_fallbacks**
   - Defines fallback preceptor chains for each primary preceptor
   - Links to clerkships table (fallbacks can be clerkship-specific)
   - Stores primary_preceptor_id, fallback_preceptor_id, priority order
   - Includes approval requirements and health system override flags

7. **preceptor_capacity_rules**
   - Extends preceptor capacity rules beyond simple max_students
   - Per-preceptor, per-clerkship capacity settings
   - Stores max_students_per_day, max_students_per_year, max_students_per_block
   - Links to preceptors and clerkships tables

8. **health_systems**
   - New master table for health system definitions
   - Stores system name, location, metadata

9. **sites**
   - Extends or replaces existing site tracking
   - Links to health_systems table
   - Stores site-specific metadata

### Tables to Modify

1. **preceptors**
   - Add health_system_id foreign key
   - Add site_id foreign key (optional, can be null)

2. **clerkships**
   - Keep existing structure
   - Configuration will be in separate clerkship_configurations table

## Schema Relationships

```
clerkships (1) ←→ (1) clerkship_configurations
clerkships (1) ←→ (many) clerkship_requirements
clerkship_configurations (1) ←→ (many) clerkship_electives

preceptors (many) ←→ (1) health_systems
preceptors (many) ←→ (1) sites
preceptors (many) ←→ (many) preceptor_teams [via preceptor_team_members]
preceptors (1) ←→ (many) preceptor_capacity_rules

clerkships (1) ←→ (many) preceptor_teams
clerkships (1) ←→ (many) preceptor_fallbacks
```

## Configuration Data Model

### Assignment Strategy Enumeration
- `continuous_single` - One preceptor for all days
- `continuous_team` - Team of 2-3 preceptors for all days
- `block_based` - Schedule in fixed-size blocks
- `daily_rotation` - Different preceptor each day possible
- `hybrid` - Different strategies for different requirement types

### Requirement Type Enumeration
- `outpatient`
- `inpatient`
- `elective`

### Health System Continuity Enumeration
- `enforce_same_system` - Required, cannot violate
- `prefer_same_system` - Soft preference, can violate if needed
- `no_preference` - Any system combination allowed

### Team Formation Rules
- Stored as boolean flags in preceptor_teams table:
  - `require_same_health_system`
  - `require_same_site`
  - `require_same_specialty`
  - `requires_admin_approval`

## Implementation Tasks

### 1. Create Migration File
- Create new migration SQL file in `src/lib/db/migrations/`
- Include all CREATE TABLE statements
- Include ALTER TABLE statements for modified tables
- Include appropriate indexes for foreign keys and frequently queried columns
- Include constraints (foreign keys, check constraints, unique constraints)

### 2. Update Kysely Types
- Run kysely-codegen to regenerate TypeScript types
- Verify all new tables appear in `src/lib/db/types.ts`
- Verify relationships are properly typed

### 3. Create Database Seed Data
- Create helper functions to seed sample configuration data
- Populate health_systems table with example systems
- Create sample clerkship configurations for testing
- Add to `src/lib/testing/fixtures.ts` or create new fixture file

## Testing Requirements

### Unit Tests

1. **Migration Integrity Tests**
   - Test migration runs without errors
   - Verify all tables created successfully
   - Verify all foreign key constraints work correctly
   - Test rollback/undo migration (if applicable)

2. **Schema Validation Tests**
   - Verify required columns exist
   - Verify data types are correct
   - Verify default values work as expected
   - Verify unique constraints prevent duplicates
   - Verify check constraints enforce valid enums

3. **Relationship Tests**
   - Test foreign key relationships (inserts, deletes, cascades)
   - Verify junction tables work correctly
   - Test referential integrity (can't reference non-existent records)

### Integration Tests

1. **Configuration Creation Flow**
   - Create clerkship with full configuration
   - Verify all related tables populated correctly
   - Verify configuration can be queried back successfully

2. **Data Integrity Tests**
   - Attempt to create invalid configurations (should fail)
   - Test deletion cascades work correctly
   - Verify orphaned records cannot exist

## Acceptance Criteria

- [ ] All 9 new tables created with correct schema
- [ ] All table modifications completed (preceptors table)
- [ ] All foreign key relationships properly defined
- [ ] Migration runs successfully on clean database
- [ ] TypeScript types auto-generated and accurate
- [ ] Sample seed data created for all tables
- [ ] All unit tests pass (migration, schema validation, relationships)
- [ ] All integration tests pass (configuration creation, data integrity)
- [ ] Schema supports all 8 configuration areas without JSON columns

## Files to Create/Modify

### New Files
- `src/lib/db/migrations/XXXX-add-scheduling-configuration-schema.sql`
- `src/lib/db/seeds/configuration-fixtures.ts` (optional)
- `src/lib/db/migrations/schema-design.test.ts`

### Modified Files
- `src/lib/db/types.ts` (auto-generated by kysely-codegen)
- `src/lib/testing/fixtures.ts` (add new fixture data)

## Notes

- Use consistent naming conventions (snake_case for SQL, camelCase for TypeScript)
- All IDs should be TEXT (UUID) to match existing pattern
- All tables should have `created_at` and `updated_at` timestamp columns
- Use appropriate indexes on foreign keys for query performance
- Consider using CHECK constraints for enum validation at database level
- Document any complex constraints or business rules in SQL comments
