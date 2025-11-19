/**
 * Requirement Configuration Types
 *
 * Per-clerkship requirement types with override tracking.
 */

import type { RequirementType, OverrideMode, AssignmentStrategy, HealthSystemRule } from './enums';

/**
 * Clerkship Requirement with Override Tracking
 *
 * Defines a specific requirement within a clerkship (e.g., "40 days outpatient").
 * Can inherit global defaults or override specific fields.
 */
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

/**
 * Field-Level Override Tracking
 *
 * Tracks which specific fields are overridden (used for override_fields mode).
 */
export interface ClerkshipRequirementOverride {
  id: string;
  requirementId: string;
  fieldName: string; // e.g., 'assignmentStrategy', 'healthSystemRule'
  isOverridden: boolean;
  createdAt: Date;
}

/**
 * Clerkship Elective
 *
 * Defines an elective option within an elective requirement.
 */
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
