# Step 02: Configuration Types and Domain Models

## Objective

Create TypeScript types, interfaces, and domain models for the **enhanced configuration system** including global defaults, per-requirement-type settings, and override tracking. These types provide type safety and serve as the contract between database, services, and UI.

## Scope

### Type Categories to Create

1. **Enum Types** - Assignment strategies, requirement types, health system rules, override modes
2. **Global Defaults Types** - School-wide default configurations
3. **Requirement Configuration Types** - Per-requirement-type settings with override tracking
4. **Database Record Types** - Direct representations of database tables
5. **Resolved Configuration Types** - Merged defaults + overrides (what scheduling engine uses)
6. **Configuration DTOs** - Data transfer objects for API requests/responses
7. **Validation Schemas** - Zod schemas for runtime validation

## Type Definitions Needed

### 1. Enumerations

**Assignment Strategy Enums**
```typescript
export const AssignmentStrategy = {
  CONTINUOUS_SINGLE: 'continuous_single',
  CONTINUOUS_TEAM: 'continuous_team',
  BLOCK_BASED: 'block_based',
  DAILY_ROTATION: 'daily_rotation',
} as const;

export type AssignmentStrategy = typeof AssignmentStrategy[keyof typeof AssignmentStrategy];
```

**Requirement Type Enums** (FIXED - cannot be changed)
```typescript
export const RequirementType = {
  OUTPATIENT: 'outpatient',
  INPATIENT: 'inpatient',
  ELECTIVE: 'elective',
} as const;

export type RequirementType = typeof RequirementType[keyof typeof RequirementType];
```

**Health System Continuity Enums**
```typescript
export const HealthSystemRule = {
  ENFORCE_SAME_SYSTEM: 'enforce_same_system',
  PREFER_SAME_SYSTEM: 'prefer_same_system',
  NO_PREFERENCE: 'no_preference',
} as const;

export type HealthSystemRule = typeof HealthSystemRule[keyof typeof HealthSystemRule];
```

**Override Mode Enums** (NEW)
```typescript
export const OverrideMode = {
  INHERIT: 'inherit',              // Use all global defaults
  OVERRIDE_FIELDS: 'override_fields', // Mix defaults + custom settings
  OVERRIDE_SECTION: 'override_section', // Fully customize
} as const;

export type OverrideMode = typeof OverrideMode[keyof typeof OverrideMode];
```

### 2. Global Defaults Types (NEW)

**Base Configuration Fields** (shared across all requirement types)
```typescript
export interface BaseConfigurationFields {
  assignmentStrategy: AssignmentStrategy;
  healthSystemRule: HealthSystemRule;
  defaultMaxStudentsPerDay: number;
  defaultMaxStudentsPerYear: number;
  allowTeams: boolean;
  allowFallbacks: boolean;
  fallbackRequiresApproval: boolean;
  fallbackAllowCrossSystem: boolean;
}
```

**Outpatient Defaults**
```typescript
export interface GlobalOutpatientDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Inpatient Defaults**
```typescript
export interface GlobalInpatientDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;
  blockSizeDays?: number; // Only used if assignmentStrategy = 'block_based'
  allowPartialBlocks?: boolean;
  preferContinuousBlocks?: boolean;
  defaultMaxStudentsPerBlock?: number;
  defaultMaxBlocksPerYear?: number;
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Elective Defaults**
```typescript
export interface GlobalElectiveDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Requirement Configuration Types (ENHANCED)

**Clerkship Requirement with Override Tracking**
```typescript
export interface ClerkshipRequirement {
  id: string;
  clerkshipId: string;
  requirementType: RequirementType;
  requiredDays: number;

  // Override Control (NEW)
  overrideMode: OverrideMode;

  // Override Values (only populated if overrideMode != 'inherit')
  overrideAssignmentStrategy?: AssignmentStrategy;
  overrideHealthSystemRule?: HealthSystemRule;
  overrideMaxStudentsPerDay?: number;
  overrideMaxStudentsPerYear?: number;
  overrideMaxStudentsPerBlock?: number;
  overrideMaxBlocksPerYear?: number;
  overrideBlockSizeDays?: number;
  overrideAllowPartialBlocks?: boolean;
  overridePreferContinuousBlocks?: boolean;
  overrideAllowTeams?: boolean;
  overrideAllowFallbacks?: boolean;
  overrideFallbackRequiresApproval?: boolean;
  overrideFallbackAllowCrossSystem?: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

**Field-Level Override Tracking**
```typescript
export interface ClerkshipRequirementOverride {
  id: string;
  requirementId: string;
  fieldName: string; // e.g., 'assignmentStrategy', 'healthSystemRule'
  isOverridden: boolean;
  createdAt: Date;
}
```

### 4. Resolved Configuration Types (NEW)

**Resolved Requirement Configuration** (what scheduling engine uses)
```typescript
export interface ResolvedRequirementConfiguration {
  // Identifies which requirement this is for
  clerkshipId: string;
  requirementType: RequirementType;
  requiredDays: number;

  // Resolved settings (merged from defaults + overrides)
  assignmentStrategy: AssignmentStrategy;
  healthSystemRule: HealthSystemRule;
  maxStudentsPerDay: number;
  maxStudentsPerYear: number;

  // Block settings (only relevant if assignmentStrategy = 'block_based')
  blockSizeDays?: number;
  allowPartialBlocks?: boolean;
  preferContinuousBlocks?: boolean;
  maxStudentsPerBlock?: number;
  maxBlocksPerYear?: number;

  // Team settings
  allowTeams: boolean;
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;

  // Fallback settings
  allowFallbacks: boolean;
  fallbackRequiresApproval: boolean;
  fallbackAllowCrossSystem: boolean;

  // Metadata about resolution
  source: 'global_defaults' | 'partial_override' | 'full_override';
  overriddenFields?: string[]; // List of fields that were overridden
}
```

### 5. Other Configuration Types (from original design)

**Clerkship Elective**
```typescript
export interface ClerkshipElective {
  id: string;
  requirementId: string; // Links to requirement where type = 'elective'
  name: string;
  minimumDays: number;
  specialty?: string;
  availablePreceptorIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

**Preceptor Team**
```typescript
export interface PreceptorTeam {
  id: string;
  clerkshipId: string;
  name?: string;
  requireSameHealthSystem: boolean;
  requireSameSite: boolean;
  requireSameSpecialty: boolean;
  requiresAdminApproval: boolean;
  members: PreceptorTeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PreceptorTeamMember {
  id: string;
  teamId: string;
  preceptorId: string;
  role?: string;
  priority: number;
  createdAt: Date;
}
```

**Preceptor Fallback**
```typescript
export interface PreceptorFallback {
  id: string;
  primaryPreceptorId: string;
  fallbackPreceptorId: string;
  clerkshipId?: string; // Optional - can be clerkship-specific
  priority: number;
  requiresApproval: boolean;
  allowDifferentHealthSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Preceptor Capacity Rule** (ENHANCED for hierarchy)
```typescript
export interface PreceptorCapacityRule {
  id: string;
  preceptorId: string;
  clerkshipId?: string; // Optional for hierarchy
  requirementType?: RequirementType; // Optional for hierarchy
  maxStudentsPerDay: number;
  maxStudentsPerYear: number;
  maxStudentsPerBlock?: number;
  maxBlocksPerYear?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

**Health System and Site**
```typescript
export interface HealthSystem {
  id: string;
  name: string;
  location?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Site {
  id: string;
  healthSystemId: string;
  name: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 6. Configuration DTOs (for API)

**Global Defaults Input**
```typescript
export interface GlobalDefaultsInput {
  assignmentStrategy: AssignmentStrategy;
  healthSystemRule: HealthSystemRule;
  defaultMaxStudentsPerDay: number;
  defaultMaxStudentsPerYear: number;
  allowTeams?: boolean;
  allowFallbacks?: boolean;
  fallbackRequiresApproval?: boolean;
  fallbackAllowCrossSystem?: boolean;

  // Inpatient-specific (only for inpatient defaults)
  blockSizeDays?: number;
  allowPartialBlocks?: boolean;
  preferContinuousBlocks?: boolean;
  defaultMaxStudentsPerBlock?: number;
  defaultMaxBlocksPerYear?: number;

  // Team settings (outpatient/inpatient)
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;
}
```

**Requirement Input with Override Control**
```typescript
export interface RequirementInput {
  requirementType: RequirementType;
  requiredDays: number;
  overrideMode: OverrideMode;

  // Only required if overrideMode != 'inherit'
  overrideAssignmentStrategy?: AssignmentStrategy;
  overrideHealthSystemRule?: HealthSystemRule;
  overrideMaxStudentsPerDay?: number;
  overrideMaxStudentsPerYear?: number;
  overrideMaxStudentsPerBlock?: number;
  overrideMaxBlocksPerYear?: number;
  overrideBlockSizeDays?: number;
  overrideAllowPartialBlocks?: boolean;
  overridePreferContinuousBlocks?: boolean;
  overrideAllowTeams?: boolean;
  overrideAllowFallbacks?: boolean;
  overrideFallbackRequiresApproval?: boolean;
  overrideFallbackAllowCrossSystem?: boolean;
}
```

**Field Override Input**
```typescript
export interface FieldOverrideInput {
  fieldName: string;
  value: unknown; // Type depends on field
}
```

**Apply Defaults Change Input**
```typescript
export interface ApplyDefaultsChangeInput {
  defaultType: RequirementType; // Which default was changed
  applyScope: 'all_existing' | 'new_only';
}
```

### 7. Aggregate Types

**Complete Clerkship Configuration with Defaults**
```typescript
export interface CompleteClerkshipConfiguration {
  clerkshipId: string;
  clerkshipName: string;
  totalRequiredDays: number;
  requirements: Array<{
    requirement: ClerkshipRequirement;
    resolvedConfig: ResolvedRequirementConfiguration;
    electives?: ClerkshipElective[];
  }>;
  teams?: PreceptorTeam[];
}
```

**Global Defaults Summary**
```typescript
export interface GlobalDefaultsSummary {
  outpatientDefaults: GlobalOutpatientDefaults;
  inpatientDefaults: GlobalInpatientDefaults;
  electiveDefaults: GlobalElectiveDefaults;
  affectedClerkships: {
    outpatient: number; // Count of clerkships using outpatient defaults
    inpatient: number;
    elective: number;
  };
}
```

## Validation Schemas (Zod)

### Global Defaults Schemas

```typescript
export const globalDefaultsBaseSchema = z.object({
  assignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation']),
  healthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference']),
  defaultMaxStudentsPerDay: z.number().int().positive(),
  defaultMaxStudentsPerYear: z.number().int().positive(),
  allowTeams: z.boolean().default(false),
  allowFallbacks: z.boolean().default(true),
  fallbackRequiresApproval: z.boolean().default(false),
  fallbackAllowCrossSystem: z.boolean().default(false),
});

export const globalOutpatientDefaultsSchema = globalDefaultsBaseSchema.extend({
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
});

export const globalInpatientDefaultsSchema = globalDefaultsBaseSchema.extend({
  blockSizeDays: z.number().int().positive().optional(),
  allowPartialBlocks: z.boolean().optional(),
  preferContinuousBlocks: z.boolean().optional(),
  defaultMaxStudentsPerBlock: z.number().int().positive().optional(),
  defaultMaxBlocksPerYear: z.number().int().positive().optional(),
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
});

export const globalElectiveDefaultsSchema = globalDefaultsBaseSchema;
```

### Requirement Schemas

```typescript
export const requirementInputSchema = z.object({
  requirementType: z.enum(['outpatient', 'inpatient', 'elective']),
  requiredDays: z.number().int().positive(),
  overrideMode: z.enum(['inherit', 'override_fields', 'override_section']),

  // Override fields - only validated if overrideMode != 'inherit'
  overrideAssignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation']).optional(),
  overrideHealthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference']).optional(),
  overrideMaxStudentsPerDay: z.number().int().positive().optional(),
  overrideMaxStudentsPerYear: z.number().int().positive().optional(),
  overrideMaxStudentsPerBlock: z.number().int().positive().optional(),
  overrideMaxBlocksPerYear: z.number().int().positive().optional(),
  overrideBlockSizeDays: z.number().int().positive().optional(),
  overrideAllowPartialBlocks: z.boolean().optional(),
  overridePreferContinuousBlocks: z.boolean().optional(),
  overrideAllowTeams: z.boolean().optional(),
  overrideAllowFallbacks: z.boolean().optional(),
  overrideFallbackRequiresApproval: z.boolean().optional(),
  overrideFallbackAllowCrossSystem: z.boolean().optional(),
}).refine(
  (data) => {
    // If not inheriting, at least some override values should be provided
    if (data.overrideMode === 'override_section') {
      return data.overrideAssignmentStrategy !== undefined &&
             data.overrideHealthSystemRule !== undefined;
    }
    return true;
  },
  { message: 'Override values required when override mode is override_section' }
);
```

### Validation Rules

**Global Defaults Validation**
- All required fields must have valid values
- Team size min <= team size max (if both provided)
- Block size > 0 (if block-based strategy)
- Capacity per year >= capacity per day

**Requirement Validation**
- Required days must be positive
- Total required days across all requirements must equal clerkship.required_days
- If override_mode = 'override_section', required override fields must be provided
- If override_mode = 'override_fields', at least one field must be overridden
- Override values must match type of global defaults

**Configuration Resolution Validation**
- Resolved configuration must have all required fields populated
- No null values in resolved config for required fields
- Block settings present if strategy = 'block_based'

## Type Utilities

**Configuration Resolver Helper Types**
```typescript
export type RequirementConfigurationSource = 'global_defaults' | 'partial_override' | 'full_override';

export interface ConfigurationResolutionMetadata {
  source: RequirementConfigurationSource;
  overriddenFields: string[];
  globalDefaultsUsed: boolean;
  timestamp: Date;
}
```

**Type Guards**
```typescript
export function isOverrideModeInherit(mode: OverrideMode): mode is typeof OverrideMode.INHERIT {
  return mode === OverrideMode.INHERIT;
}

export function isOverrideModeFields(mode: OverrideMode): mode is typeof OverrideMode.OVERRIDE_FIELDS {
  return mode === OverrideMode.OVERRIDE_FIELDS;
}

export function isOverrideModeSection(mode: OverrideMode): mode is typeof OverrideMode.OVERRIDE_SECTION {
  return mode === OverrideMode.OVERRIDE_SECTION;
}

export function hasBlockSettings(config: ResolvedRequirementConfiguration): boolean {
  return config.assignmentStrategy === AssignmentStrategy.BLOCK_BASED;
}
```

## Testing Requirements

### Unit Tests

1. **Enum Tests**
   - Test enum value conversions
   - Test type guards work correctly
   - Test display label mappings

2. **Validation Schema Tests** (EXTENSIVE)
   - Test valid global defaults pass validation
   - Test invalid global defaults fail with correct errors
   - Test requirement input validation with all override modes
   - Test override_section requires override values
   - Test override_fields allows partial overrides
   - Test inherit mode ignores override values
   - Test cross-field validations (team size, capacity, etc.)
   - Test edge cases (null, undefined, negative numbers, zero)

3. **Type Transformation Tests**
   - Test database type to domain model conversions
   - Test domain model to DTO conversions
   - Test global defaults to resolved config merging
   - Test override merging logic

4. **Type Guard Tests**
   - Test override mode type guards
   - Test block settings detection
   - Test requirement type checks

### Integration Tests

1. **Schema Integration Tests**
   - Test schemas work with actual database queries
   - Test validation catches real-world invalid data
   - Test type safety across service boundaries
   - Test resolved config validation

2. **Configuration Resolution Tests**
   - Test inherit mode produces correct resolved config
   - Test override_fields merges correctly
   - Test override_section uses all overrides
   - Test field-level override tracking
   - Test metadata population

## Acceptance Criteria

- [ ] All enumeration types defined with proper values
- [ ] All global defaults types defined (3 types)
- [ ] All requirement configuration types defined with override tracking
- [ ] Resolved configuration type complete with all fields
- [ ] All aggregate types defined for UI/API consumption
- [ ] All validation schemas defined with Zod
- [ ] All cross-field validations implemented
- [ ] All type utilities and guards implemented
- [ ] 100% unit test coverage for validation schemas
- [ ] 100% unit test coverage for type transformations
- [ ] Type safety verified (no 'any' types except where necessary)
- [ ] JSDoc comments added to all public types and functions
- [ ] Type exports properly organized in index files

## Files to Create

### Type Files
```
src/lib/features/scheduling-config/types/index.ts
src/lib/features/scheduling-config/types/enums.ts
src/lib/features/scheduling-config/types/global-defaults.ts (NEW)
src/lib/features/scheduling-config/types/requirements.ts (ENHANCED)
src/lib/features/scheduling-config/types/resolved-config.ts (NEW)
src/lib/features/scheduling-config/types/teams.ts
src/lib/features/scheduling-config/types/capacity.ts
src/lib/features/scheduling-config/types/health-systems.ts
src/lib/features/scheduling-config/types/aggregates.ts
src/lib/features/scheduling-config/types/utilities.ts (NEW)
```

### Schema Files
```
src/lib/features/scheduling-config/schemas/index.ts
src/lib/features/scheduling-config/schemas/global-defaults.schemas.ts (NEW)
src/lib/features/scheduling-config/schemas/requirements.schemas.ts (ENHANCED)
src/lib/features/scheduling-config/schemas/teams.schemas.ts
src/lib/features/scheduling-config/schemas/capacity.schemas.ts
src/lib/features/scheduling-config/schemas/health-systems.schemas.ts
```

### Test Files
```
src/lib/features/scheduling-config/types/enums.test.ts
src/lib/features/scheduling-config/types/utilities.test.ts
src/lib/features/scheduling-config/schemas/global-defaults.schemas.test.ts (NEW)
src/lib/features/scheduling-config/schemas/requirements.schemas.test.ts (ENHANCED)
src/lib/features/scheduling-config/schemas/teams.schemas.test.ts
src/lib/features/scheduling-config/schemas/capacity.schemas.test.ts
src/lib/features/scheduling-config/schemas/health-systems.schemas.test.ts
src/lib/features/scheduling-config/types/integration.test.ts
```

## Notes

- Use TypeScript 5.x features for better type inference
- Leverage Zod's transform feature for automatic type conversions
- Keep validation logic in Zod schemas, not in types themselves
- Use branded types for IDs to prevent mixing different entity IDs
- Consider using discriminated unions for polymorphic configurations
- Document the resolution algorithm clearly (critical for understanding system)
- Global defaults types should have sensible defaults
- Override tracking allows UI to show which fields are customized
- Resolved configuration is what scheduling engine consumes (fully merged, no nulls)
- Cache resolved configurations for performance
