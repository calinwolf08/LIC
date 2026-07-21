# Enhanced Design Summary: Global Defaults + Per-Requirement Configuration

## Overview

This document summarizes the major enhancements to the configurable scheduling framework design based on clarified requirements. The enhanced design adds **global default configurations** with **per-requirement-type overrides** at the clerkship level.

## Key Design Changes

### 1. Three-Level Configuration System

**Previous Design**: Per-clerkship configuration only

**New Design**: Three-level hierarchy
```
Level 1: Global Defaults (School-Wide)
         ↓ (inherited by default)
Level 2: Per-Clerkship, Per-Requirement-Type Settings
         ↓ (used by scheduling engine)
Level 3: Resolved Configuration (merged defaults + overrides)
```

### 2. Global Defaults by Requirement Type

Three separate global default configurations:

#### **Outpatient Defaults**
```
Assignment Strategy: Continuous Single (default)
Health System Rule: Enforce same (default)
Capacity: 1 per day, 3 per year (default)
Team Settings: Rules for team formation
Fallback Settings: Rules for fallback behavior
```

#### **Inpatient Defaults**
```
Assignment Strategy: Block-based (default)
Block Size: 14 days (default)
Health System Rule: Prefer same (default)
Capacity: 2 per day, 4 per year, 1 per block (default)
Team Settings: Rules for team formation
Fallback Settings: Rules for fallback behavior
```

#### **Elective Defaults**
```
Assignment Strategy: Daily rotation (default)
Health System Rule: No preference (default)
Capacity: 2 per day, 10 per year (default)
Fallback Settings: Allow cross-system (default)
```

### 3. Per-Requirement-Type Configuration

**Previous Design**: Configuration at clerkship level only

**New Design**: Configuration at requirement-type level

Each clerkship can have different rules for:
- Outpatient portion
- Inpatient portion
- Elective portion

**Example**: Surgery Clerkship
```
Surgery Outpatient (40 days):
  - Assignment Strategy: Team-based
  - Health System Rule: Enforce same
  - Capacity: 1 per day

Surgery Inpatient (20 days):
  - Assignment Strategy: Block-based (14 days)
  - Health System Rule: Prefer same
  - Capacity: 2 per day, 1 per block
```

### 4. Flexible Override System

Administrators can choose override granularity:

#### **Option A: Inherit Everything**
```
Surgery Outpatient:
  ○ Use all outpatient global defaults
  (No customization)
```

#### **Option B: Override Specific Fields**
```
Surgery Outpatient:
  Assignment Strategy: ● Override → Team-based
  Health System Rule: ○ Use default → Enforce same
  Capacity: ○ Use default → 1/day, 3/year
```

#### **Option C: Override Everything**
```
Surgery Outpatient:
  ● Override entire section
  (All settings customized, no defaults used)
```

### 5. Change Management for Global Defaults

When an admin changes a global default:

**Prompt to Apply Changes**:
```
⚠️ Warning: This change affects 8 clerkships

Clerkships using this default:
  - Family Medicine Outpatient
  - Pediatrics Outpatient
  - Internal Medicine Outpatient
  (and 5 more...)

How should this change be applied?
○ Apply to all clerkships using this default
○ Apply to new clerkships only (leave existing alone)
○ Cancel

[Confirm]
```

This prevents unintended changes while allowing global updates when desired.

## Impact on Development Plan

### Step 01: Database Schema (UPDATED)

**Changes**:
- Add 3 global defaults tables (outpatient, inpatient, elective)
- Add `override_mode` field to `clerkship_requirements` table
- Add all `override_*` fields to store per-requirement overrides
- Add `clerkship_requirement_overrides` table for field-level tracking
- Enhance `preceptor_capacity_rules` to support hierarchy

**New Tables**: 13 total (previously 9)
- `global_outpatient_defaults`
- `global_inpatient_defaults`
- `global_elective_defaults`
- `clerkship_requirement_overrides` (new)

**New Concepts**:
- Configuration resolution algorithm (merge defaults + overrides)
- Capacity rule hierarchy (5 levels of specificity)
- Override modes (inherit, override_fields, override_section)

### Step 02: Configuration Types (NEEDS UPDATE)

**Changes**:
- Add `GlobalOutpatientDefaults` type
- Add `GlobalInpatientDefaults` type
- Add `GlobalElectiveDefaults` type
- Add `OverrideMode` enum
- Add `ResolvedRequirementConfiguration` type (merged config)
- Add field-level override tracking types

**New Validation Rules**:
- Global defaults must have valid values for all fields
- Override fields only valid when override_mode != 'inherit'
- Resolved configuration must be complete (no null required fields)

### Step 03: Configuration Services (NEEDS UPDATE)

**New Services**:
- `GlobalDefaultsService` - Manage school-wide defaults (CRUD + apply changes)
- Enhanced `RequirementService` - Handle override modes and field tracking
- `ConfigurationResolverService` - Resolve final config from defaults + overrides

**New Service Methods**:
```
GlobalDefaultsService:
  - getOutpatientDefaults()
  - updateOutpatientDefaults(input, applyToExisting?)
  - getInpatientDefaults()
  - updateInpatientDefaults(input, applyToExisting?)
  - getElectiveDefaults()
  - updateElectiveDefaults(input, applyToExisting?)
  - getAffectedClerkships(defaultType) - Returns list of clerkships using defaults

RequirementService:
  - setOverrideMode(requirementId, mode)
  - overrideField(requirementId, fieldName, value)
  - clearOverride(requirementId, fieldName)
  - getOverriddenFields(requirementId)

ConfigurationResolverService:
  - resolveConfiguration(clerkshipId, requirementType) - Returns merged config
  - getEffectiveCapacity(preceptorId, clerkshipId, requirementType) - Hierarchy resolution
```

**New Business Rules**:
- Can't delete global defaults (always must have defaults)
- Changing global defaults prompts for application scope
- Override fields must match schema of global defaults
- Resolved configuration cached for performance

### Step 04: Scheduling Strategies (MINOR UPDATE)

**Changes**:
- Remove "Hybrid" strategy (deprecated - each requirement type now has its own strategy)
- Strategies receive `ResolvedRequirementConfiguration` instead of clerkship config
- Each requirement type scheduled independently with its own strategy

**Impact**:
- Simpler - no special hybrid logic needed
- Each requirement type is self-contained
- Strategies don't need to know about global defaults (receive resolved config)

### Step 05: Team and Fallback Logic (NO CHANGE)

**Impact**: None - teams remain clerkship-specific as designed

### Step 06: Scheduling Engine (NEEDS UPDATE)

**Changes**:
- Engine loads global defaults once at startup
- For each clerkship requirement:
  1. Resolve configuration (defaults + overrides)
  2. Select strategy based on resolved config
  3. Execute strategy
  4. Validate assignments
- Configuration resolution happens before strategy selection

**New Workflow**:
```
1. Load global defaults (once)
2. For each student:
   3. For each clerkship:
      4. For each requirement type (outpatient/inpatient/elective):
         5. Resolve configuration (merge defaults + overrides)
         6. Select strategy based on resolved assignment_strategy
         7. Execute strategy with resolved config
         8. Validate assignments against resolved constraints
         9. Commit if valid
```

### Step 07: API Endpoints (NEEDS UPDATE)

**New Endpoint Groups**:

#### Global Defaults Endpoints
```
GET    /api/school-settings/outpatient-defaults
PUT    /api/school-settings/outpatient-defaults
POST   /api/school-settings/outpatient-defaults/apply-changes

GET    /api/school-settings/inpatient-defaults
PUT    /api/school-settings/inpatient-defaults
POST   /api/school-settings/inpatient-defaults/apply-changes

GET    /api/school-settings/elective-defaults
PUT    /api/school-settings/elective-defaults
POST   /api/school-settings/elective-defaults/apply-changes

GET    /api/school-settings/defaults/:defaultType/affected-clerkships
```

#### Enhanced Requirement Endpoints
```
GET    /api/clerkships/:id/requirements/:requirementId/resolved-config
       (returns merged defaults + overrides)

PUT    /api/clerkships/:id/requirements/:requirementId/override-mode
       (set inherit/override_fields/override_section)

POST   /api/clerkships/:id/requirements/:requirementId/override-field
       (override specific field)

DELETE /api/clerkships/:id/requirements/:requirementId/override-field/:fieldName
       (clear field override)
```

### Step 08: UI Components (NEEDS UPDATE)

**New Pages**:

#### School Settings Page
```
Navigation → School Settings → Global Defaults

Tabs:
  - Outpatient Defaults
  - Inpatient Defaults
  - Elective Defaults

Each tab shows:
  - Form to edit all default settings
  - List of clerkships using these defaults
  - "Save Changes" with application scope selector
```

#### Enhanced Clerkship Configuration

**Screen: Requirements Setup**
```
Surgery Configuration

Outpatient (40 days):
  Configuration Mode:
    ○ Use outpatient global defaults
    ● Override specific settings
    ○ Customize everything

  [If "Override specific settings" selected]

  Assignment Strategy:
    ○ Use default (Continuous Single)
    ● Override → [Team-based ▼]

  Health System Rule:
    ● Use default (Enforce same)
    ○ Override → [Prefer same ▼]

  Capacity:
    ● Use defaults (1/day, 3/year)
    ○ Override → Max [__] per day, Max [__] per year

Inpatient (20 days):
  Configuration Mode:
    ● Use inpatient global defaults
    ○ Override specific settings
    ○ Customize everything
```

**Visual Indicators**:
- Fields using defaults: Normal text, "Using default" badge
- Fields overridden: Bold text, "Custom" badge
- Quick toggle: "Reset to default" button per field

### Step 09: Sample School Configurations (NEEDS UPDATE)

**Changes**: Each school now includes global defaults setup

#### School A Configuration
```
Global Defaults:
  Outpatient: Continuous Single, Enforce same system, 1/day
  Inpatient: Continuous Single, Enforce same system, 1/day
  Elective: Daily rotation, Prefer same system, 2/day

All Clerkships:
  - Use global defaults (inherit mode)
  - No overrides needed

Result: Extremely simple configuration, all rules consistent
```

#### School B Configuration
```
Global Defaults:
  Outpatient: Team-based, Enforce same system, 2/day
  Inpatient: Team-based, Enforce same system, 2/day
  Elective: Daily rotation, No preference, 2/day

All Clerkships:
  - Use global defaults (inherit mode)
  - Pre-configured teams per clerkship

Result: Consistent team approach across all rotations
```

#### School C Configuration
```
Global Defaults:
  Outpatient: Continuous Single, Prefer same system, 1/day
  Inpatient: Block-based (14 days), Prefer same system, 2/day
  Elective: Daily rotation, No preference, 2/day

All Clerkships:
  - Use global defaults (inherit mode)
  - Some clerkships override specific fields (Surgery uses teams for outpatient)

Result: Hybrid approach via global defaults + selective overrides
```

#### School D Configuration
```
Global Defaults:
  Outpatient: Daily rotation, No preference, 3/day
  Inpatient: Daily rotation, No preference, 3/day
  Elective: Daily rotation, No preference, 3/day

All Clerkships:
  - Use global defaults (inherit mode)
  - Extensive fallback chains configured

Result: Maximum flexibility via permissive defaults
```

### Step 10: Integration Testing (NEEDS UPDATE)

**New Test Suites**:

#### Global Defaults Tests
```
1. Test setting outpatient/inpatient/elective defaults
2. Test defaults apply to new clerkships automatically
3. Test changing defaults prompts for application scope
4. Test "apply to existing" updates all non-overridden clerkships
5. Test "apply to new only" leaves existing clerkships unchanged
```

#### Override Mode Tests
```
1. Test inherit mode uses global defaults
2. Test override_fields mode merges correctly
3. Test override_section mode uses all overrides
4. Test switching between modes
5. Test field-level override toggle
```

#### Configuration Resolution Tests
```
1. Test resolution with inherit mode
2. Test resolution with partial overrides
3. Test resolution with full overrides
4. Test capacity hierarchy (5 levels)
5. Test caching of resolved configs
```

#### School Scenarios with Global Defaults
```
1. School A: Set defaults once, all clerkships inherit
2. School B: Set team defaults, pre-configure teams
3. School C: Set hybrid defaults, selective overrides
4. School D: Set flexible defaults, extensive fallbacks
5. Verify each school's scheduling behavior matches expectations
```

## User Experience Changes

### For Initial Setup (New School)

**Step 1: Set Global Defaults**
```
Go to School Settings → Global Defaults

Set Outpatient Defaults:
  - Assignment Strategy: [Your preferred approach]
  - Health System Rule: [Your policy]
  - Capacity: [Your limits]

Set Inpatient Defaults:
  - Block size: [14 days if using blocks]
  - Assignment Strategy: [Your preferred approach]
  - Capacity: [Your limits]

Set Elective Defaults:
  - Usually more flexible than required rotations

[Save All Defaults]
```

**Step 2: Configure Clerkships**
```
For each clerkship:
  - Split requirements (40 outpatient / 20 inpatient)
  - For each requirement: "Use defaults" (done!)

Only override if this specific clerkship needs different rules
```

**Result**: 5 minutes to set defaults, 30 seconds per clerkship configuration

### For Ongoing Management

**Scenario: Policy Change**
```
Dean announces: "All clerkships must now enforce same health system"

Old way: Edit each clerkship individually (20+ clerkships)
New way:
  1. Go to School Settings
  2. Update Outpatient Defaults: Health System = "Enforce same"
  3. Update Inpatient Defaults: Health System = "Enforce same"
  4. Click "Apply to all existing clerkships"
  5. Confirm
  6. Done - all 20 clerkships updated instantly
```

**Scenario: One Exception**
```
Surgery needs different capacity limits than other clerkships

1. Go to Surgery → Requirements → Outpatient
2. Change mode to "Override specific settings"
3. Toggle capacity override
4. Set: Max 2/day (instead of default 1/day)
5. Save
6. Done - Surgery gets higher capacity, others unchanged
```

### Visual Design Concepts

#### School Settings Page
```
┌─────────────────────────────────────────────┐
│ School Settings > Global Defaults            │
├─────────────────────────────────────────────┤
│ [Outpatient] [Inpatient] [Elective]         │
├─────────────────────────────────────────────┤
│                                              │
│ Outpatient Defaults                          │
│                                              │
│ Assignment Strategy                          │
│ [Continuous Single ▼]                        │
│                                              │
│ Health System Rule                           │
│ [Enforce same ▼]                             │
│                                              │
│ Capacity Limits                              │
│ Max per day: [1]  Max per year: [3]         │
│                                              │
│ [Save Changes]                               │
│                                              │
│ Clerkships Using These Defaults: 12          │
│ [View List]                                  │
└─────────────────────────────────────────────┘
```

#### Clerkship Configuration with Overrides
```
┌─────────────────────────────────────────────┐
│ Surgery > Requirements > Outpatient          │
├─────────────────────────────────────────────┤
│                                              │
│ 40 days required                             │
│                                              │
│ Configuration Mode:                          │
│ ○ Use global defaults                        │
│ ● Override specific settings                 │
│ ○ Customize everything                       │
│                                              │
│ ┌───────────────────────────────────────┐  │
│ │ Assignment Strategy                    │  │
│ │ ○ Use default (Continuous Single)      │  │
│ │ ● Override → [Team-based ▼]            │  │
│ └───────────────────────────────────────┘  │
│                                              │
│ ┌───────────────────────────────────────┐  │
│ │ Health System Rule                     │  │
│ │ ● Use default (Enforce same) ✓         │  │
│ │ ○ Override                             │  │
│ └───────────────────────────────────────┘  │
│                                              │
│ ┌───────────────────────────────────────┐  │
│ │ Capacity                               │  │
│ │ ● Use defaults (1/day, 3/year) ✓       │  │
│ │ ○ Override                             │  │
│ └───────────────────────────────────────┘  │
│                                              │
│ [Save Configuration]                         │
└─────────────────────────────────────────────┘
```

## Migration Strategy

### For Existing Data

If deploying to existing system:

1. **Insert Default Global Defaults**
   - Create sensible defaults based on most common current configurations
   - Run migration to insert global_*_defaults rows

2. **Convert Existing Clerkships**
   - For each clerkship configuration:
     - Create requirement records with override_section mode
     - Copy existing config to override_* fields
   - This preserves all existing behavior

3. **Gradual Adoption**
   - New clerkships can use global defaults
   - Existing clerkships remain with overrides
   - Admins can gradually migrate to defaults over time

## Performance Considerations

### Configuration Resolution Caching

Resolved configurations don't change often, so cache aggressively:

```
Cache Key: clerkship_id + requirement_type
Cache Duration: Until global defaults or overrides change
Cache Invalidation: On update to defaults or requirement overrides
```

### Database Query Optimization

Resolve configurations in batch:
```sql
-- Load all requirements for scheduling run
-- Load all global defaults (3 rows)
-- Join and resolve in application layer
-- Cache resolved configs for entire scheduling run
```

## Summary of Enhancements

| Aspect | Previous Design | Enhanced Design |
|--------|----------------|-----------------|
| **Configuration Scope** | Per-clerkship only | School-wide defaults + per-clerkship overrides |
| **Requirement Types** | Clerkship-level | Per-requirement-type (outpatient/inpatient/elective) |
| **Override Granularity** | All-or-nothing | Inherit / Override fields / Override section |
| **Global Changes** | Not possible | Update defaults, apply to many clerkships at once |
| **Setup Time** | Configure each clerkship individually | Set defaults once, inherit for most clerkships |
| **Flexibility** | High (each clerkship custom) | Higher (defaults + selective overrides) |
| **Complexity** | Medium | Higher (3-level hierarchy, resolution logic) |
| **Tables** | 9 new tables | 13 new tables |
| **User Experience** | Configure each clerkship | Set & forget defaults, override exceptions only |

## Next Steps

1. **Review this summary** - Ensure all changes are clear and acceptable
2. **Update remaining step files** - Apply these changes to Steps 02-10
3. **Update README** - Reflect new design in overview
4. **Proceed with implementation** - Start with Step 01 (Database Schema)

## Questions?

If any aspect of this enhanced design needs clarification or adjustment, please ask before implementation begins!
