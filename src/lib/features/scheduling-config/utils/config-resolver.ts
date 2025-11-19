/**
 * Configuration Resolution Utility
 *
 * Merges global defaults with per-clerkship overrides to produce resolved configurations
 * that the scheduling engine can use directly.
 *
 * Resolution Algorithm:
 * 1. Load clerkship requirement record
 * 2. Check override_mode:
 *    - 'inherit': Use all global defaults
 *    - 'override_section': Use all override values
 *    - 'override_fields': For each field, use override if present, else use default
 * 3. Return resolved configuration with all fields populated
 */

import type {
  ClerkshipRequirement,
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
  ResolvedRequirementConfiguration,
  RequirementType,
  OverrideMode,
} from '../types';

type GlobalDefaults = GlobalOutpatientDefaults | GlobalInpatientDefaults | GlobalElectiveDefaults;

/**
 * Resolves a clerkship requirement configuration by merging global defaults with overrides.
 *
 * @param requirement - The clerkship requirement with override settings
 * @param globalDefaults - The appropriate global defaults (outpatient, inpatient, or elective)
 * @returns Fully resolved configuration ready for scheduling engine
 */
export function resolveRequirementConfiguration(
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults
): ResolvedRequirementConfiguration {
  const { overrideMode } = requirement;

  switch (overrideMode) {
    case 'inherit':
      return resolveWithInherit(requirement, globalDefaults);

    case 'override_section':
      return resolveWithFullOverride(requirement, globalDefaults);

    case 'override_fields':
      return resolveWithPartialOverride(requirement, globalDefaults);

    default:
      throw new Error(`Unknown override mode: ${overrideMode as string}`);
  }
}

/**
 * Inherit mode: Use all global defaults
 */
function resolveWithInherit(
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults
): ResolvedRequirementConfiguration {
  const resolved: ResolvedRequirementConfiguration = {
    clerkshipId: requirement.clerkshipId,
    requirementType: requirement.requirementType,
    requiredDays: requirement.requiredDays,

    // Use all global defaults
    assignmentStrategy: globalDefaults.assignmentStrategy,
    healthSystemRule: globalDefaults.healthSystemRule,
    maxStudentsPerDay: globalDefaults.defaultMaxStudentsPerDay,
    maxStudentsPerYear: globalDefaults.defaultMaxStudentsPerYear,

    // Team settings
    allowTeams: globalDefaults.allowTeams,

    // Fallback settings
    allowFallbacks: globalDefaults.allowFallbacks,
    fallbackRequiresApproval: globalDefaults.fallbackRequiresApproval,
    fallbackAllowCrossSystem: globalDefaults.fallbackAllowCrossSystem,

    // Metadata
    source: 'global_defaults',
    overriddenFields: [],
  };

  // Add requirement-type specific fields
  addTypeSpecificFields(resolved, requirement.requirementType, globalDefaults);

  return resolved;
}

/**
 * Override section mode: Use all override values (fully customized)
 */
function resolveWithFullOverride(
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults
): ResolvedRequirementConfiguration {
  // Validate that required override fields are present
  if (!requirement.overrideAssignmentStrategy || !requirement.overrideHealthSystemRule) {
    throw new Error(
      'Override section mode requires overrideAssignmentStrategy and overrideHealthSystemRule to be set'
    );
  }

  const resolved: ResolvedRequirementConfiguration = {
    clerkshipId: requirement.clerkshipId,
    requirementType: requirement.requirementType,
    requiredDays: requirement.requiredDays,

    // Use all override values
    assignmentStrategy: requirement.overrideAssignmentStrategy,
    healthSystemRule: requirement.overrideHealthSystemRule,
    maxStudentsPerDay: requirement.overrideMaxStudentsPerDay ?? globalDefaults.defaultMaxStudentsPerDay,
    maxStudentsPerYear: requirement.overrideMaxStudentsPerYear ?? globalDefaults.defaultMaxStudentsPerYear,

    // Team settings
    allowTeams: requirement.overrideAllowTeams ?? globalDefaults.allowTeams,

    // Fallback settings
    allowFallbacks: requirement.overrideAllowFallbacks ?? globalDefaults.allowFallbacks,
    fallbackRequiresApproval: requirement.overrideFallbackRequiresApproval ?? globalDefaults.fallbackRequiresApproval,
    fallbackAllowCrossSystem: requirement.overrideFallbackAllowCrossSystem ?? globalDefaults.fallbackAllowCrossSystem,

    // Metadata
    source: 'full_override',
    overriddenFields: getAllOverriddenFields(requirement),
  };

  // Add type-specific override fields
  addTypeSpecificOverrides(resolved, requirement, globalDefaults);

  return resolved;
}

/**
 * Override fields mode: Mix of defaults and overrides (field by field)
 */
function resolveWithPartialOverride(
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults
): ResolvedRequirementConfiguration {
  const overriddenFields: string[] = [];

  // Helper to track which fields were overridden
  function useFieldValue<T>(overrideValue: T | undefined, defaultValue: T, fieldName: string): T {
    if (overrideValue !== undefined && overrideValue !== null) {
      overriddenFields.push(fieldName);
      return overrideValue;
    }
    return defaultValue;
  }

  const resolved: ResolvedRequirementConfiguration = {
    clerkshipId: requirement.clerkshipId,
    requirementType: requirement.requirementType,
    requiredDays: requirement.requiredDays,

    // Use override if present, otherwise default
    assignmentStrategy: useFieldValue(
      requirement.overrideAssignmentStrategy,
      globalDefaults.assignmentStrategy,
      'assignmentStrategy'
    ),
    healthSystemRule: useFieldValue(
      requirement.overrideHealthSystemRule,
      globalDefaults.healthSystemRule,
      'healthSystemRule'
    ),
    maxStudentsPerDay: useFieldValue(
      requirement.overrideMaxStudentsPerDay,
      globalDefaults.defaultMaxStudentsPerDay,
      'maxStudentsPerDay'
    ),
    maxStudentsPerYear: useFieldValue(
      requirement.overrideMaxStudentsPerYear,
      globalDefaults.defaultMaxStudentsPerYear,
      'maxStudentsPerYear'
    ),

    // Team settings
    allowTeams: useFieldValue(
      requirement.overrideAllowTeams,
      globalDefaults.allowTeams,
      'allowTeams'
    ),

    // Fallback settings
    allowFallbacks: useFieldValue(
      requirement.overrideAllowFallbacks,
      globalDefaults.allowFallbacks,
      'allowFallbacks'
    ),
    fallbackRequiresApproval: useFieldValue(
      requirement.overrideFallbackRequiresApproval,
      globalDefaults.fallbackRequiresApproval,
      'fallbackRequiresApproval'
    ),
    fallbackAllowCrossSystem: useFieldValue(
      requirement.overrideFallbackAllowCrossSystem,
      globalDefaults.fallbackAllowCrossSystem,
      'fallbackAllowCrossSystem'
    ),

    // Metadata
    source: 'partial_override',
    overriddenFields,
  };

  // Add type-specific fields with override support
  addTypeSpecificFieldsWithOverrides(resolved, requirement, globalDefaults, overriddenFields);

  return resolved;
}

/**
 * Adds requirement-type specific fields from global defaults (for inherit mode)
 */
function addTypeSpecificFields(
  resolved: ResolvedRequirementConfiguration,
  requirementType: RequirementType,
  globalDefaults: GlobalDefaults
): void {
  if (requirementType === 'outpatient' || requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalOutpatientDefaults | GlobalInpatientDefaults;

    if (defaults.teamSizeMin !== undefined) {
      resolved.teamSizeMin = defaults.teamSizeMin;
    }
    if (defaults.teamSizeMax !== undefined) {
      resolved.teamSizeMax = defaults.teamSizeMax;
    }
    if (defaults.teamRequireSameHealthSystem !== undefined) {
      resolved.teamRequireSameHealthSystem = defaults.teamRequireSameHealthSystem;
    }
    if (defaults.teamRequireSameSpecialty !== undefined) {
      resolved.teamRequireSameSpecialty = defaults.teamRequireSameSpecialty;
    }
  }

  if (requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalInpatientDefaults;

    if (defaults.blockSizeDays !== undefined) {
      resolved.blockSizeDays = defaults.blockSizeDays;
    }
    if (defaults.allowPartialBlocks !== undefined) {
      resolved.allowPartialBlocks = defaults.allowPartialBlocks;
    }
    if (defaults.preferContinuousBlocks !== undefined) {
      resolved.preferContinuousBlocks = defaults.preferContinuousBlocks;
    }
    if (defaults.defaultMaxStudentsPerBlock !== undefined) {
      resolved.maxStudentsPerBlock = defaults.defaultMaxStudentsPerBlock;
    }
    if (defaults.defaultMaxBlocksPerYear !== undefined) {
      resolved.maxBlocksPerYear = defaults.defaultMaxBlocksPerYear;
    }
  }
}

/**
 * Adds type-specific override fields (for override_section mode)
 */
function addTypeSpecificOverrides(
  resolved: ResolvedRequirementConfiguration,
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults
): void {
  const { requirementType } = requirement;

  if (requirementType === 'outpatient' || requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalOutpatientDefaults | GlobalInpatientDefaults;

    resolved.teamSizeMin = requirement.overrideMaxStudentsPerDay ?? defaults.teamSizeMin;
    resolved.teamSizeMax = requirement.overrideMaxStudentsPerDay ?? defaults.teamSizeMax;
    resolved.teamRequireSameHealthSystem = defaults.teamRequireSameHealthSystem;
    resolved.teamRequireSameSpecialty = defaults.teamRequireSameSpecialty;
  }

  if (requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalInpatientDefaults;

    resolved.blockSizeDays = requirement.overrideBlockSizeDays ?? defaults.blockSizeDays;
    resolved.allowPartialBlocks = requirement.overrideAllowPartialBlocks ?? defaults.allowPartialBlocks;
    resolved.preferContinuousBlocks = requirement.overridePreferContinuousBlocks ?? defaults.preferContinuousBlocks;
    resolved.maxStudentsPerBlock = requirement.overrideMaxStudentsPerBlock ?? defaults.defaultMaxStudentsPerBlock;
    resolved.maxBlocksPerYear = requirement.overrideMaxBlocksPerYear ?? defaults.defaultMaxBlocksPerYear;
  }
}

/**
 * Adds type-specific fields with override support (for override_fields mode)
 */
function addTypeSpecificFieldsWithOverrides(
  resolved: ResolvedRequirementConfiguration,
  requirement: ClerkshipRequirement,
  globalDefaults: GlobalDefaults,
  overriddenFields: string[]
): void {
  const { requirementType } = requirement;

  function useFieldValue<T>(overrideValue: T | undefined, defaultValue: T | undefined, fieldName: string): T | undefined {
    if (overrideValue !== undefined && overrideValue !== null) {
      overriddenFields.push(fieldName);
      return overrideValue;
    }
    return defaultValue;
  }

  if (requirementType === 'outpatient' || requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalOutpatientDefaults | GlobalInpatientDefaults;

    const teamSizeMin = useFieldValue(undefined, defaults.teamSizeMin, 'teamSizeMin');
    if (teamSizeMin !== undefined) resolved.teamSizeMin = teamSizeMin;

    const teamSizeMax = useFieldValue(undefined, defaults.teamSizeMax, 'teamSizeMax');
    if (teamSizeMax !== undefined) resolved.teamSizeMax = teamSizeMax;

    const teamRequireSameHealthSystem = useFieldValue(undefined, defaults.teamRequireSameHealthSystem, 'teamRequireSameHealthSystem');
    if (teamRequireSameHealthSystem !== undefined) resolved.teamRequireSameHealthSystem = teamRequireSameHealthSystem;

    const teamRequireSameSpecialty = useFieldValue(undefined, defaults.teamRequireSameSpecialty, 'teamRequireSameSpecialty');
    if (teamRequireSameSpecialty !== undefined) resolved.teamRequireSameSpecialty = teamRequireSameSpecialty;
  }

  if (requirementType === 'inpatient') {
    const defaults = globalDefaults as GlobalInpatientDefaults;

    const blockSizeDays = useFieldValue(requirement.overrideBlockSizeDays, defaults.blockSizeDays, 'blockSizeDays');
    if (blockSizeDays !== undefined) resolved.blockSizeDays = blockSizeDays;

    const allowPartialBlocks = useFieldValue(requirement.overrideAllowPartialBlocks, defaults.allowPartialBlocks, 'allowPartialBlocks');
    if (allowPartialBlocks !== undefined) resolved.allowPartialBlocks = allowPartialBlocks;

    const preferContinuousBlocks = useFieldValue(requirement.overridePreferContinuousBlocks, defaults.preferContinuousBlocks, 'preferContinuousBlocks');
    if (preferContinuousBlocks !== undefined) resolved.preferContinuousBlocks = preferContinuousBlocks;

    const maxStudentsPerBlock = useFieldValue(requirement.overrideMaxStudentsPerBlock, defaults.defaultMaxStudentsPerBlock, 'maxStudentsPerBlock');
    if (maxStudentsPerBlock !== undefined) resolved.maxStudentsPerBlock = maxStudentsPerBlock;

    const maxBlocksPerYear = useFieldValue(requirement.overrideMaxBlocksPerYear, defaults.defaultMaxBlocksPerYear, 'maxBlocksPerYear');
    if (maxBlocksPerYear !== undefined) resolved.maxBlocksPerYear = maxBlocksPerYear;
  }
}

/**
 * Gets list of all overridden fields from a requirement
 */
function getAllOverriddenFields(requirement: ClerkshipRequirement): string[] {
  const fields: string[] = [];

  if (requirement.overrideAssignmentStrategy !== undefined && requirement.overrideAssignmentStrategy !== null) {
    fields.push('assignmentStrategy');
  }
  if (requirement.overrideHealthSystemRule !== undefined && requirement.overrideHealthSystemRule !== null) {
    fields.push('healthSystemRule');
  }
  if (requirement.overrideMaxStudentsPerDay !== undefined && requirement.overrideMaxStudentsPerDay !== null) {
    fields.push('maxStudentsPerDay');
  }
  if (requirement.overrideMaxStudentsPerYear !== undefined && requirement.overrideMaxStudentsPerYear !== null) {
    fields.push('maxStudentsPerYear');
  }
  if (requirement.overrideMaxStudentsPerBlock !== undefined && requirement.overrideMaxStudentsPerBlock !== null) {
    fields.push('maxStudentsPerBlock');
  }
  if (requirement.overrideMaxBlocksPerYear !== undefined && requirement.overrideMaxBlocksPerYear !== null) {
    fields.push('maxBlocksPerYear');
  }
  if (requirement.overrideBlockSizeDays !== undefined && requirement.overrideBlockSizeDays !== null) {
    fields.push('blockSizeDays');
  }
  if (requirement.overrideAllowPartialBlocks !== undefined && requirement.overrideAllowPartialBlocks !== null) {
    fields.push('allowPartialBlocks');
  }
  if (requirement.overridePreferContinuousBlocks !== undefined && requirement.overridePreferContinuousBlocks !== null) {
    fields.push('preferContinuousBlocks');
  }
  if (requirement.overrideAllowTeams !== undefined && requirement.overrideAllowTeams !== null) {
    fields.push('allowTeams');
  }
  if (requirement.overrideAllowFallbacks !== undefined && requirement.overrideAllowFallbacks !== null) {
    fields.push('allowFallbacks');
  }
  if (requirement.overrideFallbackRequiresApproval !== undefined && requirement.overrideFallbackRequiresApproval !== null) {
    fields.push('fallbackRequiresApproval');
  }
  if (requirement.overrideFallbackAllowCrossSystem !== undefined && requirement.overrideFallbackAllowCrossSystem !== null) {
    fields.push('fallbackAllowCrossSystem');
  }

  return fields;
}

/**
 * Validates that a resolved configuration has all required fields populated
 */
export function validateResolvedConfiguration(
  config: ResolvedRequirementConfiguration
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!config.assignmentStrategy) errors.push('assignmentStrategy is required');
  if (!config.healthSystemRule) errors.push('healthSystemRule is required');
  if (config.maxStudentsPerDay === undefined || config.maxStudentsPerDay === null) {
    errors.push('maxStudentsPerDay is required');
  }
  if (config.maxStudentsPerYear === undefined || config.maxStudentsPerYear === null) {
    errors.push('maxStudentsPerYear is required');
  }

  // Block-specific validation
  if (config.assignmentStrategy === 'block_based') {
    if (!config.blockSizeDays || config.blockSizeDays <= 0) {
      errors.push('blockSizeDays must be positive when using block_based strategy');
    }
  }

  // Team validation
  if (config.allowTeams) {
    if (config.teamSizeMin !== undefined && config.teamSizeMax !== undefined) {
      if (config.teamSizeMin > config.teamSizeMax) {
        errors.push('teamSizeMin cannot be greater than teamSizeMax');
      }
    }
  }

  // Capacity validation
  if (config.maxStudentsPerDay > config.maxStudentsPerYear) {
    errors.push('maxStudentsPerDay cannot exceed maxStudentsPerYear');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
