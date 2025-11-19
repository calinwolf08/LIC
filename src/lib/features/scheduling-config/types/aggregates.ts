/**
 * Aggregate Types
 *
 * Combined types for representing complete configurations.
 */

import type {
  ClerkshipRequirement,
  ResolvedRequirementConfiguration,
  ClerkshipElective,
  PreceptorTeam,
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
} from './index';

/**
 * Complete Clerkship Configuration
 *
 * Represents a full clerkship configuration with all requirements and their resolved configs.
 */
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

/**
 * Global Defaults Summary
 *
 * Summary of all global defaults and which clerkships use them.
 */
export interface GlobalDefaultsSummary {
  outpatientDefaults: GlobalOutpatientDefaults;
  inpatientDefaults: GlobalInpatientDefaults;
  electiveDefaults: GlobalElectiveDefaults;
  affectedClerkships: {
    outpatient: number; // Count of clerkships using outpatient defaults
    inpatient: number;  // Count of clerkships using inpatient defaults
    elective: number;   // Count of clerkships using elective defaults
  };
}

/**
 * Requirement Configuration Summary
 *
 * Summary of a requirement showing override status.
 */
export interface RequirementConfigurationSummary {
  requirementId: string;
  requirementType: 'outpatient' | 'inpatient' | 'elective';
  requiredDays: number;
  overrideMode: 'inherit' | 'override_fields' | 'override_section';
  overriddenFields: string[];
  usingGlobalDefaults: boolean;
}

/**
 * Clerkship Configuration Overview
 *
 * High-level overview of a clerkship's configuration status.
 */
export interface ClerkshipConfigurationOverview {
  clerkshipId: string;
  clerkshipName: string;
  totalDays: number;
  requirements: RequirementConfigurationSummary[];
  hasTeams: boolean;
  teamCount: number;
  configurationComplete: boolean; // All requirements configured
  validationErrors: string[];
}

/**
 * Configuration Change Preview
 *
 * Preview of what will change when updating global defaults.
 */
export interface ConfigurationChangePreview {
  defaultType: 'outpatient' | 'inpatient' | 'elective';
  affectedClerkships: Array<{
    clerkshipId: string;
    clerkshipName: string;
    requirementId: string;
    currentConfig: ResolvedRequirementConfiguration;
    newConfig: ResolvedRequirementConfiguration;
    changedFields: string[];
  }>;
  totalAffected: number;
}

/**
 * School Configuration Statistics
 *
 * Statistics about school-wide configuration usage.
 */
export interface SchoolConfigurationStatistics {
  totalClerkships: number;
  totalRequirements: number;
  requirementsUsingDefaults: {
    inherit: number;
    overrideFields: number;
    overrideSection: number;
  };
  configurationCompleteness: number; // Percentage of fully configured clerkships
  teamUsage: {
    clerkshipsWithTeams: number;
    totalTeams: number;
    averageTeamSize: number;
  };
  fallbackUsage: {
    clerkshipsWithFallbacks: number;
    totalFallbackChains: number;
  };
}
