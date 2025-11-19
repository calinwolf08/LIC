/**
 * Global Defaults Types
 *
 * School-wide default configurations for outpatient, inpatient, and elective requirements.
 * These defaults can be inherited or overridden by individual clerkships.
 */

import type { AssignmentStrategy, HealthSystemRule } from './enums';

/**
 * Base Configuration Fields
 *
 * Common fields shared across all requirement types (outpatient, inpatient, elective).
 */
export interface BaseConfigurationFields {
  /** How to assign students to preceptors */
  assignmentStrategy: AssignmentStrategy;

  /** Health system continuity rules */
  healthSystemRule: HealthSystemRule;

  /** Maximum students per day per preceptor (default) */
  defaultMaxStudentsPerDay: number;

  /** Maximum students per year per preceptor (default) */
  defaultMaxStudentsPerYear: number;

  /** Whether teams are allowed for this requirement type */
  allowTeams: boolean;

  /** Whether fallback preceptors are allowed */
  allowFallbacks: boolean;

  /** Whether fallback assignments require admin approval */
  fallbackRequiresApproval: boolean;

  /** Whether fallback can assign to different health system */
  fallbackAllowCrossSystem: boolean;
}

/**
 * Global Outpatient Defaults
 *
 * School-wide defaults for outpatient rotations.
 */
export interface GlobalOutpatientDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;

  // Team settings (optional)
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Global Inpatient Defaults
 *
 * School-wide defaults for inpatient rotations.
 * Includes block-specific settings since inpatient often uses block scheduling.
 */
export interface GlobalInpatientDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;

  // Block settings (only used if assignmentStrategy = 'block_based')
  blockSizeDays?: number;
  allowPartialBlocks?: boolean;
  preferContinuousBlocks?: boolean;
  defaultMaxStudentsPerBlock?: number;
  defaultMaxBlocksPerYear?: number;

  // Team settings (optional)
  teamSizeMin?: number;
  teamSizeMax?: number;
  teamRequireSameHealthSystem?: boolean;
  teamRequireSameSpecialty?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Global Elective Defaults
 *
 * School-wide defaults for elective rotations.
 * Usually the most permissive settings.
 */
export interface GlobalElectiveDefaults extends BaseConfigurationFields {
  id: string;
  schoolId: string;

  createdAt: Date;
  updatedAt: Date;
}
