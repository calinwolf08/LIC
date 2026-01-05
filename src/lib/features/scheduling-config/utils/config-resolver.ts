/**
 * Configuration Resolution Utility (DEPRECATED)
 *
 * NOTE: This utility has been deprecated. The clerkship_requirements table has been removed.
 * Clerkships now define their type (inpatient/outpatient) directly, and electives link
 * directly to clerkships via clerkship_id.
 *
 * The configuration resolution now happens in the ConstraintFactory which builds
 * constraints based on clerkship type and global defaults.
 *
 * See: src/lib/features/scheduling/services/constraint-factory.ts
 */

import type {
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
  ResolvedRequirementConfiguration,
  RequirementType,
} from '../types';

type GlobalDefaults = GlobalOutpatientDefaults | GlobalInpatientDefaults | GlobalElectiveDefaults;

/**
 * @deprecated Use ConstraintFactory instead. ClerkshipRequirement has been removed.
 *
 * This interface represents the legacy requirement structure for backward compatibility only.
 */
export interface LegacyClerkshipRequirement {
  id: string;
  clerkshipId: string;
  requirementType: RequirementType;
  requiredDays: number;
  overrideMode: 'inherit' | 'override_fields' | 'override_section';
  // Optional override fields
  overrideAssignmentStrategy?: string;
  overrideHealthSystemRule?: string;
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

/**
 * @deprecated Use ConstraintFactory.buildConstraints() instead.
 *
 * Resolves a clerkship requirement configuration by merging global defaults with overrides.
 * This function is kept for backward compatibility but should not be used in new code.
 */
export function resolveRequirementConfiguration(
  requirement: LegacyClerkshipRequirement,
  globalDefaults: GlobalDefaults
): ResolvedRequirementConfiguration {
  // For backward compatibility, just return a basic resolved configuration
  // using all global defaults (inherit mode)
  const resolved: ResolvedRequirementConfiguration = {
    clerkshipId: requirement.clerkshipId,
    requirementType: requirement.requirementType,
    requiredDays: requirement.requiredDays,
    assignmentStrategy: globalDefaults.assignmentStrategy,
    healthSystemRule: globalDefaults.healthSystemRule,
    maxStudentsPerDay: globalDefaults.defaultMaxStudentsPerDay,
    maxStudentsPerYear: globalDefaults.defaultMaxStudentsPerYear,
    allowTeams: globalDefaults.allowTeams,
    allowFallbacks: globalDefaults.allowFallbacks,
    fallbackRequiresApproval: globalDefaults.fallbackRequiresApproval,
    fallbackAllowCrossSystem: globalDefaults.fallbackAllowCrossSystem,
    source: 'global_defaults',
    overriddenFields: [],
  };

  return resolved;
}

/**
 * @deprecated Requirements are no longer used.
 *
 * Validates that a resolved configuration has all required fields populated.
 */
export function validateResolvedConfiguration(
  config: ResolvedRequirementConfiguration
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.assignmentStrategy) errors.push('assignmentStrategy is required');
  if (!config.healthSystemRule) errors.push('healthSystemRule is required');
  if (config.maxStudentsPerDay === undefined || config.maxStudentsPerDay === null) {
    errors.push('maxStudentsPerDay is required');
  }
  if (config.maxStudentsPerYear === undefined || config.maxStudentsPerYear === null) {
    errors.push('maxStudentsPerYear is required');
  }

  if (config.assignmentStrategy === 'block_based') {
    if (!config.blockSizeDays || config.blockSizeDays <= 0) {
      errors.push('blockSizeDays must be positive when using block_based strategy');
    }
  }

  if (config.allowTeams) {
    if (config.teamSizeMin !== undefined && config.teamSizeMax !== undefined) {
      if (config.teamSizeMin > config.teamSizeMax) {
        errors.push('teamSizeMin cannot be greater than teamSizeMax');
      }
    }
  }

  if (config.maxStudentsPerDay > config.maxStudentsPerYear) {
    errors.push('maxStudentsPerDay cannot exceed maxStudentsPerYear');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
