/**
 * Enumeration types for the scheduling configuration system
 */

/**
 * Assignment Strategy Enums
 *
 * Defines how students are assigned to preceptors during a clerkship requirement.
 */
export const AssignmentStrategy = {
  /**
   * Maximize continuity with primary preceptor, fallback to team members.
   * This is the default strategy.
   */
  TEAM_CONTINUITY: 'team_continuity',

  /**
   * One preceptor for the entire duration
   */
  CONTINUOUS_SINGLE: 'continuous_single',

  /**
   * Team of preceptors for the entire duration
   */
  CONTINUOUS_TEAM: 'continuous_team',

  /**
   * Students rotate in fixed blocks (e.g., 14-day blocks)
   */
  BLOCK_BASED: 'block_based',

  /**
   * Students can rotate to a different preceptor daily
   */
  DAILY_ROTATION: 'daily_rotation',
} as const;

export type AssignmentStrategy = typeof AssignmentStrategy[keyof typeof AssignmentStrategy];

/**
 * Requirement Type Enums (FIXED - cannot be changed)
 *
 * The three types of clinical requirements in a clerkship.
 */
export const RequirementType = {
  /**
   * Outpatient clinic rotations
   */
  OUTPATIENT: 'outpatient',

  /**
   * Inpatient hospital rotations
   */
  INPATIENT: 'inpatient',

  /**
   * Elective rotations (student choice)
   */
  ELECTIVE: 'elective',
} as const;

export type RequirementType = typeof RequirementType[keyof typeof RequirementType];

/**
 * Health System Continuity Enums
 *
 * Defines how strictly students should stay within the same health system.
 */
export const HealthSystemRule = {
  /**
   * MUST stay in same health system (hard constraint)
   */
  ENFORCE_SAME_SYSTEM: 'enforce_same_system',

  /**
   * Should prefer same system but can change if needed (soft constraint)
   */
  PREFER_SAME_SYSTEM: 'prefer_same_system',

  /**
   * No preference for health system continuity
   */
  NO_PREFERENCE: 'no_preference',
} as const;

export type HealthSystemRule = typeof HealthSystemRule[keyof typeof HealthSystemRule];

/**
 * Override Mode Enums (NEW)
 *
 * Defines how a clerkship requirement uses global defaults.
 */
export const OverrideMode = {
  /**
   * Use all global defaults (fastest setup)
   */
  INHERIT: 'inherit',

  /**
   * Mix defaults + custom settings (flexible)
   */
  OVERRIDE_FIELDS: 'override_fields',

  /**
   * Fully customize all settings (most control)
   */
  OVERRIDE_SECTION: 'override_section',
} as const;

export type OverrideMode = typeof OverrideMode[keyof typeof OverrideMode];

/**
 * Configuration Source (for resolved configurations)
 */
export type RequirementConfigurationSource = 'global_defaults' | 'partial_override' | 'full_override';
