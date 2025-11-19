/**
 * Scheduling Configuration Schemas
 *
 * Central export point for all Zod validation schemas.
 */

// Global Defaults Schemas
export {
  globalDefaultsBaseSchema,
  globalOutpatientDefaultsInputSchema,
  globalInpatientDefaultsInputSchema,
  globalElectiveDefaultsInputSchema,
  globalOutpatientDefaultsSchema,
  globalInpatientDefaultsSchema,
  globalElectiveDefaultsSchema,
} from './global-defaults.schemas';
export type {
  GlobalOutpatientDefaultsInput,
  GlobalInpatientDefaultsInput,
  GlobalElectiveDefaultsInput,
} from './global-defaults.schemas';

// Requirements Schemas
export {
  requirementInputSchema,
  clerkshipRequirementSchema,
  fieldOverrideInputSchema,
  applyDefaultsChangeInputSchema,
  clerkshipElectiveInputSchema,
  clerkshipElectiveSchema,
} from './requirements.schemas';
export type {
  RequirementInput,
  FieldOverrideInput,
  ApplyDefaultsChangeInput,
  ClerkshipElectiveInput,
} from './requirements.schemas';

// Teams and Fallbacks Schemas
export {
  preceptorTeamMemberInputSchema,
  preceptorTeamInputSchema,
  preceptorTeamSchema,
  preceptorTeamMemberSchema,
  preceptorFallbackInputSchema,
  preceptorFallbackSchema,
} from './teams.schemas';
export type {
  PreceptorTeamMemberInput,
  PreceptorTeamInput,
  PreceptorFallbackInput,
} from './teams.schemas';

// Capacity Schemas
export {
  preceptorCapacityRuleInputSchema,
  preceptorCapacityRuleSchema,
} from './capacity.schemas';
export type {
  PreceptorCapacityRuleInput,
} from './capacity.schemas';

// Health Systems Schemas
export {
  healthSystemInputSchema,
  healthSystemSchema,
  siteInputSchema,
  siteSchema,
} from './health-systems.schemas';
export type {
  HealthSystemInput,
  SiteInput,
} from './health-systems.schemas';
