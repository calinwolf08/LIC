/**
 * Aggregate Types
 *
 * Combined types for representing complete configurations.
 *
 * NOTE: ClerkshipRequirement has been removed. Clerkships now define their type
 * (inpatient/outpatient) directly, and electives link directly to clerkships.
 */

import type {
	ResolvedRequirementConfiguration,
	ClerkshipElective,
	PreceptorTeam,
	GlobalOutpatientDefaults,
	GlobalInpatientDefaults,
	GlobalElectiveDefaults
} from './index';

/**
 * Complete Clerkship Configuration
 *
 * Represents a full clerkship configuration with resolved config and electives.
 */
export interface CompleteClerkshipConfiguration {
	clerkshipId: string;
	clerkshipName: string;
	clerkshipType: 'inpatient' | 'outpatient';
	totalRequiredDays: number;
	resolvedConfig: ResolvedRequirementConfiguration;
	electives: ClerkshipElective[];
	electiveDays: number;
	nonElectiveDays: number;
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
		outpatient: number; // Count of outpatient clerkships
		inpatient: number; // Count of inpatient clerkships
	};
}

/**
 * Clerkship Configuration Summary
 *
 * Summary of a clerkship's configuration status.
 */
export interface ClerkshipConfigurationSummary {
	clerkshipId: string;
	clerkshipType: 'outpatient' | 'inpatient';
	requiredDays: number;
	electiveCount: number;
	electiveDays: number;
	nonElectiveDays: number;
	usingGlobalDefaults: boolean;
}

/**
 * @deprecated Use ClerkshipConfigurationSummary instead
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
	clerkshipType: 'inpatient' | 'outpatient';
	totalDays: number;
	electiveCount: number;
	electiveDays: number;
	nonElectiveDays: number;
	hasTeams: boolean;
	teamCount: number;
	configurationComplete: boolean;
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
	clerkshipsByType: {
		inpatient: number;
		outpatient: number;
	};
	totalElectives: number;
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
