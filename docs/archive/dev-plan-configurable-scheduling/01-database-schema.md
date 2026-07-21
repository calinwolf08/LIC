# Step 01: Database Schema Design

## Objective

Design and implement the complete relational database schema to support all 8 configuration areas plus **global defaults with per-clerkship overrides**. This schema enables both school-wide default settings and per-clerkship customization.

## Scope

### New Tables to Create

#### Global Defaults Tables

1. **global_outpatient_defaults**
   - School-wide default settings for all outpatient rotations
   - Single row per school (school_id = system default)
   - Stores assignment strategy, health system rules, capacity defaults, team settings

2. **global_inpatient_defaults**
   - School-wide default settings for all inpatient rotations
   - Single row per school
   - Stores assignment strategy, health system rules, capacity defaults, block settings

3. **global_elective_defaults**
   - School-wide default settings for all elective rotations
   - Single row per school
   - Stores assignment strategy, health system rules, capacity defaults

#### Per-Clerkship Configuration Tables

4. **clerkship_configurations**
   - Links to clerkships table (one-to-one relationship)
   - Stores clerkship-level settings that apply to all requirement types
   - Lightweight - most settings are per-requirement-type

5. **clerkship_requirements**
   - Stores split requirements for each clerkship (inpatient/outpatient/elective)
   - Links to clerkships table (one-to-many relationship)
   - Includes requirement type (outpatient, inpatient, elective)
   - Stores required days and assignment mode for each requirement type
   - **NEW**: Tracks which fields are overridden vs inherited from global defaults
   - **NEW**: Stores override values for assignment strategy, health system rules, capacity, etc.

6. **clerkship_requirement_overrides**
   - Tracks which specific fields are overridden for each requirement
   - Allows field-level OR section-level overrides
   - Links to clerkship_requirements table
   - Stores override_type ('field' or 'section'), field_name, override_value

7. **clerkship_electives**
   - Defines available electives for each clerkship
   - Links to clerkship_requirements (where requirement_type = 'elective')
   - Stores elective name, minimum days, specialty requirements

#### Preceptor Configuration Tables

8. **preceptor_teams**
   - Defines valid team groupings of preceptors
   - Links to clerkships table (teams are clerkship-specific, NOT global)
   - Stores team metadata (health system consistency required, etc.)

9. **preceptor_team_members**
   - Junction table for many-to-many relationship between teams and preceptors
   - Links preceptor_teams and preceptors
   - Stores member role/priority within team

10. **preceptor_fallbacks**
    - Defines fallback preceptor chains for each primary preceptor
    - Links to clerkships table (fallbacks can be clerkship-specific)
    - Stores primary_preceptor_id, fallback_preceptor_id, priority order
    - Includes approval requirements and health system override flags

11. **preceptor_capacity_rules**
    - Extends preceptor capacity rules beyond simple max_students
    - **NEW**: Supports hierarchy (global defaults → clerkship defaults → requirement-type overrides → preceptor-specific)
    - Stores max_students_per_day, max_students_per_year, max_students_per_block
    - Links to preceptors, clerkships, and requirement types (all optional for hierarchy)

#### Master Data Tables

12. **health_systems**
    - Master table for health system definitions
    - Stores system name, location, metadata

13. **sites**
    - Physical sites within health systems
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
GLOBAL DEFAULTS (School-Wide)
global_outpatient_defaults (1 per school)
global_inpatient_defaults (1 per school)
global_elective_defaults (1 per school)
           ↓ (inherited by default)

CLERKSHIP CONFIGURATIONS
clerkships (1) ←→ (1) clerkship_configurations
clerkships (1) ←→ (many) clerkship_requirements [one per requirement type]
clerkship_requirements (1) ←→ (many) clerkship_requirement_overrides
clerkship_requirements (1) ←→ (many) clerkship_electives [if type = 'elective']

PRECEPTOR CONFIGURATIONS
preceptors (many) ←→ (1) health_systems
preceptors (many) ←→ (1) sites
preceptors (many) ←→ (many) preceptor_teams [via preceptor_team_members]
preceptors (1) ←→ (many) preceptor_capacity_rules

CROSS-REFERENCES
clerkships (1) ←→ (many) preceptor_teams [teams are clerkship-specific]
clerkships (1) ←→ (many) preceptor_fallbacks
```

## Configuration Data Model

### Assignment Strategy Enumeration
- `continuous_single` - One preceptor for all days
- `continuous_team` - Team of 2-3 preceptors for all days
- `block_based` - Schedule in fixed-size blocks
- `daily_rotation` - Different preceptor each day possible
- `hybrid` - Different strategies for different requirement types (deprecated with new design - each requirement type sets its own strategy)

### Requirement Type Enumeration (FIXED)
- `outpatient`
- `inpatient`
- `elective`

### Health System Continuity Enumeration
- `enforce_same_system` - Required, cannot violate
- `prefer_same_system` - Soft preference, can violate if needed
- `no_preference` - Any system combination allowed

### Override Type Enumeration
- `field` - Override specific fields only (e.g., just assignment strategy)
- `section` - Override entire section (all fields for this requirement type)

### Team Formation Rules
- Stored as boolean flags in preceptor_teams table:
  - `require_same_health_system`
  - `require_same_site`
  - `require_same_specialty`
  - `requires_admin_approval`

## Global Defaults Table Schema

### global_outpatient_defaults
```sql
CREATE TABLE global_outpatient_defaults (
  id TEXT PRIMARY KEY,
  school_id TEXT DEFAULT 'default', -- for future multi-tenancy

  -- Assignment Strategy
  assignment_strategy TEXT NOT NULL CHECK (assignment_strategy IN
    ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')),

  -- Health System Rules
  health_system_rule TEXT NOT NULL CHECK (health_system_rule IN
    ('enforce_same_system', 'prefer_same_system', 'no_preference')),

  -- Capacity Defaults
  default_max_students_per_day INTEGER NOT NULL DEFAULT 1,
  default_max_students_per_year INTEGER NOT NULL DEFAULT 3,

  -- Team Settings (rules only, actual teams are clerkship-specific)
  allow_teams BOOLEAN DEFAULT FALSE,
  team_size_min INTEGER DEFAULT 2,
  team_size_max INTEGER DEFAULT 4,
  team_require_same_health_system BOOLEAN DEFAULT TRUE,
  team_require_same_specialty BOOLEAN DEFAULT TRUE,

  -- Fallback Settings (rules only, actual chains are preceptor-specific)
  allow_fallbacks BOOLEAN DEFAULT TRUE,
  fallback_requires_approval BOOLEAN DEFAULT FALSE,
  fallback_allow_cross_system BOOLEAN DEFAULT FALSE,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### global_inpatient_defaults
```sql
CREATE TABLE global_inpatient_defaults (
  id TEXT PRIMARY KEY,
  school_id TEXT DEFAULT 'default',

  -- Assignment Strategy
  assignment_strategy TEXT NOT NULL CHECK (assignment_strategy IN
    ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')),

  -- Block Settings (only used if assignment_strategy = 'block_based')
  block_size_days INTEGER DEFAULT 14,
  allow_partial_blocks BOOLEAN DEFAULT TRUE,
  prefer_continuous_blocks BOOLEAN DEFAULT TRUE,

  -- Health System Rules
  health_system_rule TEXT NOT NULL CHECK (health_system_rule IN
    ('enforce_same_system', 'prefer_same_system', 'no_preference')),

  -- Capacity Defaults
  default_max_students_per_day INTEGER NOT NULL DEFAULT 2,
  default_max_students_per_year INTEGER NOT NULL DEFAULT 4,
  default_max_students_per_block INTEGER DEFAULT 1,
  default_max_blocks_per_year INTEGER DEFAULT 4,

  -- Team Settings
  allow_teams BOOLEAN DEFAULT FALSE,
  team_size_min INTEGER DEFAULT 2,
  team_size_max INTEGER DEFAULT 4,
  team_require_same_health_system BOOLEAN DEFAULT TRUE,
  team_require_same_specialty BOOLEAN DEFAULT TRUE,

  -- Fallback Settings
  allow_fallbacks BOOLEAN DEFAULT TRUE,
  fallback_requires_approval BOOLEAN DEFAULT FALSE,
  fallback_allow_cross_system BOOLEAN DEFAULT FALSE,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### global_elective_defaults
```sql
CREATE TABLE global_elective_defaults (
  id TEXT PRIMARY KEY,
  school_id TEXT DEFAULT 'default',

  -- Assignment Strategy
  assignment_strategy TEXT NOT NULL CHECK (assignment_strategy IN
    ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')),

  -- Health System Rules (typically more relaxed for electives)
  health_system_rule TEXT NOT NULL CHECK (health_system_rule IN
    ('enforce_same_system', 'prefer_same_system', 'no_preference')),

  -- Capacity Defaults (typically higher for electives)
  default_max_students_per_day INTEGER NOT NULL DEFAULT 2,
  default_max_students_per_year INTEGER NOT NULL DEFAULT 10,

  -- Team Settings
  allow_teams BOOLEAN DEFAULT FALSE,

  -- Fallback Settings
  allow_fallbacks BOOLEAN DEFAULT TRUE,
  fallback_requires_approval BOOLEAN DEFAULT FALSE,
  fallback_allow_cross_system BOOLEAN DEFAULT TRUE,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Clerkship Requirements Table Schema (Enhanced)

### clerkship_requirements
```sql
CREATE TABLE clerkship_requirements (
  id TEXT PRIMARY KEY,
  clerkship_id TEXT NOT NULL,
  requirement_type TEXT NOT NULL CHECK (requirement_type IN
    ('outpatient', 'inpatient', 'elective')),
  required_days INTEGER NOT NULL CHECK (required_days > 0),

  -- Override Control
  override_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (override_mode IN
    ('inherit', 'override_fields', 'override_section')),
    -- 'inherit': Use all global defaults
    -- 'override_fields': Override specific fields only (see overrides table)
    -- 'override_section': Override all settings for this requirement type

  -- Override Values (only used if override_mode != 'inherit')
  override_assignment_strategy TEXT CHECK (override_assignment_strategy IN
    ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')),
  override_health_system_rule TEXT CHECK (override_health_system_rule IN
    ('enforce_same_system', 'prefer_same_system', 'no_preference')),
  override_max_students_per_day INTEGER,
  override_max_students_per_year INTEGER,
  override_max_students_per_block INTEGER,
  override_max_blocks_per_year INTEGER,
  override_block_size_days INTEGER,
  override_allow_partial_blocks BOOLEAN,
  override_prefer_continuous_blocks BOOLEAN,
  override_allow_teams BOOLEAN,
  override_allow_fallbacks BOOLEAN,
  override_fallback_requires_approval BOOLEAN,
  override_fallback_allow_cross_system BOOLEAN,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (clerkship_id) REFERENCES clerkships(id) ON DELETE CASCADE,
  UNIQUE (clerkship_id, requirement_type)
);
```

### clerkship_requirement_overrides
```sql
CREATE TABLE clerkship_requirement_overrides (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  field_name TEXT NOT NULL, -- e.g., 'assignment_strategy', 'health_system_rule'
  is_overridden BOOLEAN NOT NULL DEFAULT TRUE,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (requirement_id) REFERENCES clerkship_requirements(id) ON DELETE CASCADE,
  UNIQUE (requirement_id, field_name)
);
```

## Configuration Resolution Algorithm

When the scheduling engine needs configuration for a clerkship requirement:

```
1. Load clerkship_requirements record
2. Check override_mode:

   IF override_mode = 'inherit':
     - Load appropriate global default (based on requirement_type)
     - Use all values from global default

   IF override_mode = 'override_section':
     - Use all override_* values from clerkship_requirements
     - Ignore global defaults completely

   IF override_mode = 'override_fields':
     - Load appropriate global default
     - For each field:
       - Check clerkship_requirement_overrides table
       - If is_overridden = true: use override_* value
       - If is_overridden = false: use global default value
     - Merge overridden and default values

3. Return resolved configuration to scheduling engine
```

## Capacity Rule Hierarchy

Capacity limits are resolved in order of specificity (most specific wins):

```
Priority 1 (Highest): Preceptor-specific for specific clerkship requirement type
  → preceptor_capacity_rules WHERE preceptor_id = X AND clerkship_id = Y AND requirement_type = Z

Priority 2: Preceptor-specific for specific clerkship (all requirement types)
  → preceptor_capacity_rules WHERE preceptor_id = X AND clerkship_id = Y AND requirement_type IS NULL

Priority 3: Preceptor-specific general rule
  → preceptor_capacity_rules WHERE preceptor_id = X AND clerkship_id IS NULL AND requirement_type IS NULL

Priority 4: Clerkship requirement type override
  → clerkship_requirements.override_max_students_per_day (if override_mode != 'inherit')

Priority 5 (Lowest): Global requirement type default
  → global_outpatient_defaults.default_max_students_per_day (based on requirement_type)
```

## Implementation Tasks

### 1. Create Migration File
- Create new migration SQL file in `src/lib/db/migrations/`
- Include all CREATE TABLE statements for 13 new tables
- Include ALTER TABLE statements for modified tables (preceptors)
- Include appropriate indexes for foreign keys and frequently queried columns
- Include constraints (foreign keys, check constraints, unique constraints)
- Include default row insertion for global defaults (school_id = 'default')

### 2. Update Kysely Types
- Run kysely-codegen to regenerate TypeScript types
- Verify all new tables appear in `src/lib/db/types.ts`
- Verify relationships are properly typed

### 3. Create Database Seed Data
- Create helper functions to seed global defaults
- Populate health_systems table with example systems
- Create sample clerkship configurations with overrides
- Add to `src/lib/testing/fixtures.ts` or create new fixture file

### 4. Create Configuration Resolution Utility
- Build utility function to resolve final configuration from defaults + overrides
- Handle all three override modes (inherit, override_fields, override_section)
- Cache resolved configurations for performance

## Testing Requirements

### Unit Tests

1. **Migration Integrity Tests**
   - Test migration runs without errors
   - Verify all 13 new tables created successfully
   - Verify all foreign key constraints work correctly
   - Verify default global defaults row inserted
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

4. **Configuration Resolution Tests**
   - Test inherit mode returns global defaults
   - Test override_section mode returns all overrides
   - Test override_fields mode merges correctly
   - Test each override field individually
   - Test capacity rule hierarchy resolution

### Integration Tests

1. **Global Defaults Flow**
   - Create global defaults for all 3 requirement types
   - Create clerkship with inherit mode
   - Verify configuration resolves to global defaults
   - Update global defaults
   - Verify clerkship configuration reflects changes (after admin approval)

2. **Override Flow**
   - Create clerkship with override_fields mode
   - Override specific fields
   - Verify overridden fields use custom values
   - Verify non-overridden fields use global defaults
   - Change to override_section mode
   - Verify all fields now use overrides

3. **Capacity Hierarchy Tests**
   - Create capacity rules at all 5 levels
   - Verify most specific rule wins
   - Remove specific rule
   - Verify falls back to next level

4. **Data Integrity Tests**
   - Attempt to create invalid configurations (should fail)
   - Test deletion cascades work correctly
   - Verify orphaned records cannot exist

## Acceptance Criteria

- [ ] All 13 new tables created with correct schema
- [ ] All table modifications completed (preceptors table)
- [ ] All foreign key relationships properly defined
- [ ] Global defaults tables support all configuration fields
- [ ] Override tracking mechanism supports field-level and section-level
- [ ] Capacity rule hierarchy implemented correctly
- [ ] Migration runs successfully on clean database
- [ ] Default global defaults inserted automatically
- [ ] TypeScript types auto-generated and accurate
- [ ] Sample seed data created for all tables
- [ ] Configuration resolution utility implemented and tested
- [ ] All unit tests pass (migration, schema validation, relationships, resolution)
- [ ] All integration tests pass (defaults flow, override flow, hierarchy)
- [ ] Schema supports all 8 configuration areas plus global defaults

## Files to Create/Modify

### New Files
- `src/lib/db/migrations/XXXX-add-scheduling-configuration-schema.sql`
- `src/lib/db/migrations/XXXX-insert-default-global-defaults.sql`
- `src/lib/db/seeds/configuration-fixtures.ts`
- `src/lib/db/seeds/global-defaults-fixtures.ts`
- `src/lib/db/migrations/schema-design.test.ts`
- `src/lib/features/scheduling-config/utils/config-resolver.ts`
- `src/lib/features/scheduling-config/utils/config-resolver.test.ts`

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
- Global defaults should have sensible defaults for new schools
- Override tracking allows flexibility (field-level or section-level as user chooses)
- Configuration resolution should be cached for performance (resolved configs don't change often)
- Consider adding `version` field to global defaults for change tracking
- Teams remain clerkship-specific (not global) per requirements
