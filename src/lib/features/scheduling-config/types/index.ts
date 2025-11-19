/**
 * Scheduling Configuration Types
 *
 * Central export point for all scheduling configuration types.
 */

// Enums
export {
  AssignmentStrategy,
  RequirementType,
  HealthSystemRule,
  OverrideMode,
} from './enums';
export type {
  AssignmentStrategy as AssignmentStrategyType,
  RequirementType as RequirementTypeType,
  HealthSystemRule as HealthSystemRuleType,
  OverrideMode as OverrideModeType,
  RequirementConfigurationSource,
} from './enums';

// Global Defaults
export type {
  BaseConfigurationFields,
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
} from './global-defaults';

// Requirements
export type {
  ClerkshipRequirement,
  ClerkshipRequirementOverride,
} from './requirements';

// Resolved Configuration
export type {
  ResolvedRequirementConfiguration,
  ConfigurationResolutionMetadata,
} from './resolved-config';

// Teams
export type {
  PreceptorTeam,
  PreceptorTeamMember,
  PreceptorFallback,
} from './teams';

// Capacity
export type {
  PreceptorCapacityRule,
} from './capacity';
export { CapacityRulePriority } from './capacity';

// Health Systems
export type {
  HealthSystem,
  Site,
} from './health-systems';

// Utilities
export {
  isOverrideModeInherit,
  isOverrideModeFields,
  isOverrideModeSection,
  hasBlockSettings,
  allowsTeams,
  allowsFallbacks,
  AssignmentStrategyLabels,
  HealthSystemRuleLabels,
  OverrideModeLabels,
} from './utilities';
