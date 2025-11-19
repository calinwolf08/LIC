# Update Guide for Steps 03-10

This document outlines the specific changes needed for Steps 03-10 to align with the enhanced design (global defaults + per-requirement-type configuration). For full context, see `ENHANCED-DESIGN-SUMMARY.md`.

**Already Updated**:
- ✅ Step 01: Database Schema (complete rewrite)
- ✅ Step 02: Configuration Types (complete rewrite)

**Needs Updates**: Steps 03-10 (detailed below)

---

## Step 03: Configuration Services

### New Services to Add

1. **GlobalDefaultsService** (NEW)
   - CRUD for outpatient defaults
   - CRUD for inpatient defaults
   - CRUD for elective defaults
   - `getAffectedClerkships(defaultType)` - Returns clerkships using defaults
   - `applyDefaultChanges(defaultType, applyScope)` - Apply changes to existing clerkships
   - Business rule: Prevent deletion of global defaults (must always exist)

2. **ConfigurationResolverService** (NEW)
   - `resolveConfiguration(clerkshipId, requirementType)` - Merge defaults + overrides
   - `resolveCapacity(preceptorId, clerkshipId, requirementType)` - 5-level hierarchy
   - Caching of resolved configurations
   - Invalidation on defaults/override changes

### Enhanced Services

3. **RequirementService** (ENHANCED)
   - Add: `setOverrideMode(requirementId, mode)`
   - Add: `overrideField(requirementId, fieldName, value)`
   - Add: `clearOverride(requirementId, fieldName)`
   - Add: `getOverriddenFields(requirementId)`
   - Enhanced validation: Check override values match defaults schema

### Testing Additions

- Unit tests for GlobalDefaultsService (CRUD + apply changes logic)
- Unit tests for ConfigurationResolverService (all 3 override modes)
- Integration tests for apply changes workflow
- Integration tests for configuration resolution with caching

### Business Rules

- Changing global defaults prompts for application scope
- `applyScope = 'all_existing'` updates all non-overridden clerkships
- `applyScope = 'new_only'` leaves existing clerkships unchanged
- Resolution must handle all 3 override modes correctly
- Capacity hierarchy: preceptor-specific > clerkship-specific > requirement-type > global

---

## Step 04: Scheduling Strategies

### Changes Required

**Remove**: Hybrid strategy (deprecated - each requirement type has its own strategy now)

**Update**: All strategies receive `ResolvedRequirementConfiguration` instead of clerkship config
- Strategies no longer need to know about global defaults
- Strategies receive fully resolved config (all fields populated)
- Each requirement type scheduled independently

### Testing Additions

- Remove hybrid strategy tests
- Update all strategy tests to use `ResolvedRequirementConfiguration`
- Verify strategies work with configs from all 3 override modes

### No Other Changes

- Strategy logic remains the same
- 4 strategies: Continuous Single, Continuous Team, Block-Based, Daily Rotation

---

## Step 05: Team and Fallback Logic

### Changes Required

**No significant changes** - teams remain clerkship-specific as designed

### Minor Updates

- Team validation may reference resolved config for team settings
- Fallback logic may reference resolved config for fallback settings

---

## Step 06: New Scheduling Engine

### Changes Required

**New Workflow**:
```
1. Load global defaults (once at startup)
2. For each student:
   3. For each clerkship:
      4. For each requirement type (outpatient/inpatient/elective):
         5. Resolve configuration (ConfigurationResolverService)
         6. Select strategy based on resolved assignmentStrategy
         7. Execute strategy with resolved config
         8. Validate assignments
         9. Commit if valid
```

**Key Changes**:
- Engine loads global defaults once (cache them)
- Configuration resolution happens before strategy selection
- Each requirement type processed independently
- No more "hybrid" handling (each requirement has its own strategy)

### New Components

- Configuration resolution step (before strategy execution)
- Global defaults loading on engine initialization

### Testing Additions

- Test engine with inherit mode (uses defaults)
- Test engine with override_fields mode
- Test engine with override_section mode
- Test engine performance with resolved config caching

---

## Step 07: API Endpoints

### New Endpoint Groups

#### Global Defaults Endpoints (NEW)
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

### Testing Additions

- Integration tests for global defaults endpoints
- Integration tests for override mode switching
- Integration tests for field-level override toggle
- Integration tests for apply changes workflow

---

## Step 08: UI Components

### New Pages

#### School Settings Page (NEW)
```
Navigation → School Settings

Tabs:
  - Outpatient Defaults
  - Inpatient Defaults
  - Elective Defaults

Features:
  - Form to edit all default settings
  - List of clerkships using these defaults
  - "Save Changes" with application scope selector
  - Warning dialog when changes affect existing clerkships
```

### Enhanced Pages

#### Clerkship Configuration - Requirements Screen (ENHANCED)
```
For each requirement (outpatient/inpatient/elective):

Configuration Mode selector:
  ○ Use global defaults (inherit)
  ● Override specific settings (override_fields)
  ○ Customize everything (override_section)

[If override_fields selected]
  For each field:
    ○ Use default (shows default value)
    ● Override (shows input)

[If override_section selected]
  All fields shown as inputs
```

**Visual Indicators**:
- Fields using defaults: Normal text, "Using default" badge
- Fields overridden: Bold text, "Custom" badge
- Quick action: "Reset to default" button per field

### Testing

- Manual testing only (no automated UI tests per requirements)
- Test all 3 override modes via UI
- Test global defaults update workflow
- Test field-level override toggles

---

## Step 09: Sample School Configurations

### Updates Required

Each school now includes **global defaults setup** before clerkship configs.

#### School A Configuration (UPDATED)
```
1. Set Global Defaults:
   Outpatient: Continuous Single, Enforce same, 1/day
   Inpatient: Continuous Single, Enforce same, 1/day
   Elective: Daily Rotation, Prefer same, 2/day

2. Configure All Clerkships:
   For each clerkship:
     - Split requirements (if applicable)
     - Set override_mode = 'inherit' for all requirement types
     - Done! (uses global defaults)

Result: Minimal configuration, all rules consistent
```

#### School B Configuration (UPDATED)
```
1. Set Global Defaults:
   Outpatient: Team-based, Enforce same, 2/day, team size 3-4
   Inpatient: Team-based, Enforce same, 2/day, team size 3-4
   Elective: Daily Rotation, No preference, 2/day

2. Configure Clerkships:
   - Set override_mode = 'inherit'
   - Create pre-configured teams per clerkship

Result: Team approach via global defaults
```

#### School C Configuration (UPDATED)
```
1. Set Global Defaults:
   Outpatient: Continuous Single, Prefer same, 1/day
   Inpatient: Block-based (14 days), Prefer same, 2/day
   Elective: Daily Rotation, No preference, 2/day

2. Configure Clerkships:
   Most use 'inherit' mode
   Surgery overrides outpatient to use teams (override_fields mode)

Result: Hybrid via defaults + selective overrides
```

#### School D Configuration (UPDATED)
```
1. Set Global Defaults:
   Outpatient: Daily Rotation, No preference, 3/day
   Inpatient: Daily Rotation, No preference, 3/day
   Elective: Daily Rotation, No preference, 3/day

2. Configure Clerkships:
   - Set override_mode = 'inherit'
   - Configure extensive fallback chains

Result: Maximum flexibility via permissive defaults
```

### Testing Additions

- Test global defaults seed scripts
- Test clerkship configs with inherit mode
- Test override scenarios (School C)
- Verify scheduling works with all configurations

---

## Step 10: Integration Testing

### New Test Suites

#### Suite: Global Defaults Tests (NEW)
```
1. Set outpatient/inpatient/elective defaults
2. Create clerkship with inherit mode
3. Verify configuration resolves to defaults
4. Update defaults with 'apply to existing' scope
5. Verify clerkship configuration updated
6. Update defaults with 'new only' scope
7. Verify existing clerkships unchanged
```

#### Suite: Override Mode Tests (NEW)
```
1. Test inherit mode uses global defaults
2. Test override_fields mode merges correctly
3. Test override_section mode uses all overrides
4. Test switching between modes
5. Test field-level override toggle (override_fields mode)
```

#### Suite: Configuration Resolution Tests (NEW)
```
1. Test resolution with inherit mode
2. Test resolution with partial overrides (override_fields)
3. Test resolution with full overrides (override_section)
4. Test capacity hierarchy (5 levels)
5. Test caching of resolved configs
6. Test cache invalidation on changes
```

#### Suite: School Scenarios with Defaults (UPDATED)
```
1. School A: Set defaults, all clerkships inherit
2. School B: Team defaults, pre-configured teams
3. School C: Hybrid defaults, selective overrides
4. School D: Flexible defaults, extensive fallbacks
5. Verify each school's scheduling matches expectations
```

### Enhanced Existing Suites

**Update all existing integration tests** to work with new configuration system:
- Tests that create clerkship configs should set override_mode
- Tests should use ConfigurationResolverService where appropriate
- Tests should validate resolved configurations

---

## Summary of Key Additions Across All Steps

### New Concepts
1. Global defaults (3 tables, 3 types)
2. Override modes (inherit, override_fields, override_section)
3. Configuration resolution (merging defaults + overrides)
4. Resolved configuration (what engine uses)
5. Apply changes workflow (scope control)

### New Services
1. GlobalDefaultsService
2. ConfigurationResolverService
3. Enhanced RequirementService (override methods)

### New API Endpoints
- 12 global defaults endpoints
- 4 enhanced requirement endpoints

### New UI
- School Settings page (3 tabs)
- Enhanced requirement configuration (override controls)

### New Tests
- Global defaults CRUD tests
- Configuration resolution tests (all modes)
- Override mode switching tests
- Apply changes workflow tests
- Updated school scenario tests

---

## Implementation Approach

### Option 1: Update Files Now
Go through each step file (03-10) and update based on this guide.

### Option 2: Use This Guide During Implementation
Refer to this guide when implementing each step, making changes on-the-fly.

### Recommended: Option 2
- This guide contains all necessary information
- Avoids duplicating content across multiple large files
- More flexible for implementers
- Easier to maintain

---

## Quick Reference: What Changed Per Step

| Step | Major Changes | New Components |
|------|---------------|----------------|
| 03 | +2 new services, enhanced RequirementService | GlobalDefaultsService, ConfigurationResolverService |
| 04 | Remove hybrid strategy, use ResolvedRequirementConfiguration | None |
| 05 | Minor updates (no major changes) | None |
| 06 | Add config resolution before strategy selection | Config resolution step |
| 07 | +16 new endpoints | Global defaults API, override control API |
| 08 | +1 new page, enhanced requirements page | School Settings page |
| 09 | Add global defaults to all school configs | Global defaults seed data |
| 10 | +4 new test suites, update existing suites | Global defaults tests, override tests, resolution tests |

---

## Questions or Clarifications?

If any step needs more detail during implementation, refer to:
1. `ENHANCED-DESIGN-SUMMARY.md` for overall design
2. `01-database-schema.md` for data model
3. `02-configuration-types.md` for type definitions
4. This guide for step-specific changes

Implementation can proceed with these documents!
