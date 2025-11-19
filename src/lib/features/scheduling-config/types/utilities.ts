/**
 * Type Utilities and Guards
 *
 * Helper functions and type guards for the scheduling configuration system.
 */

import type { OverrideMode, AssignmentStrategy } from './enums';
import type { ResolvedRequirementConfiguration } from './resolved-config';
import { OverrideMode as OverrideModeEnum, AssignmentStrategy as AssignmentStrategyEnum } from './enums';

/**
 * Type guard: Check if override mode is 'inherit'
 */
export function isOverrideModeInherit(mode: OverrideMode): mode is typeof OverrideModeEnum.INHERIT {
  return mode === OverrideModeEnum.INHERIT;
}

/**
 * Type guard: Check if override mode is 'override_fields'
 */
export function isOverrideModeFields(mode: OverrideMode): mode is typeof OverrideModeEnum.OVERRIDE_FIELDS {
  return mode === OverrideModeEnum.OVERRIDE_FIELDS;
}

/**
 * Type guard: Check if override mode is 'override_section'
 */
export function isOverrideModeSection(mode: OverrideMode): mode is typeof OverrideModeEnum.OVERRIDE_SECTION {
  return mode === OverrideModeEnum.OVERRIDE_SECTION;
}

/**
 * Type guard: Check if configuration has block settings
 */
export function hasBlockSettings(config: ResolvedRequirementConfiguration): boolean {
  return config.assignmentStrategy === AssignmentStrategyEnum.BLOCK_BASED;
}

/**
 * Type guard: Check if configuration allows teams
 */
export function allowsTeams(config: ResolvedRequirementConfiguration): boolean {
  return config.allowTeams;
}

/**
 * Type guard: Check if configuration allows fallbacks
 */
export function allowsFallbacks(config: ResolvedRequirementConfiguration): boolean {
  return config.allowFallbacks;
}

/**
 * Display label mappings for enums
 */
export const AssignmentStrategyLabels: Record<AssignmentStrategy, string> = {
  continuous_single: 'Continuous Single Preceptor',
  continuous_team: 'Continuous Team',
  block_based: 'Block-Based Scheduling',
  daily_rotation: 'Daily Rotation',
};

export const HealthSystemRuleLabels = {
  enforce_same_system: 'Enforce Same System',
  prefer_same_system: 'Prefer Same System',
  no_preference: 'No Preference',
};

export const OverrideModeLabels = {
  inherit: 'Use Global Defaults',
  override_fields: 'Override Specific Fields',
  override_section: 'Fully Customize',
};
