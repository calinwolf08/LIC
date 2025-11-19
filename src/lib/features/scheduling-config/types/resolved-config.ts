/**
 * Resolved Configuration Types
 *
 * These types represent fully merged configurations (global defaults + overrides)
 * that the scheduling engine can use directly without needing to resolve anything.
 */

import type {
  RequirementType,
  AssignmentStrategy,
  HealthSystemRule,
  RequirementConfigurationSource,
} from './enums';

/**
 * Resolved Requirement Configuration
 *
 * What the scheduling engine actually uses. All fields are populated (no nulls for required fields).
 * This is the result of merging global defaults with per-clerkship overrides.
 */
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
  source: RequirementConfigurationSource;
  overriddenFields?: string[]; // List of fields that were overridden
}

/**
 * Configuration Resolution Metadata
 *
 * Additional information about how a configuration was resolved.
 */
export interface ConfigurationResolutionMetadata {
  source: RequirementConfigurationSource;
  overriddenFields: string[];
  globalDefaultsUsed: boolean;
  timestamp: Date;
}
