/**
 * Clerkship Requirements Fixtures (DEPRECATED)
 *
 * NOTE: The clerkship_requirements table has been removed. Clerkships now define
 * their type (inpatient/outpatient) directly, and electives link directly to
 * clerkships via clerkship_id.
 *
 * This file is kept for backward compatibility but should not be used.
 * Use clerkship fixtures and elective fixtures instead.
 */

/**
 * @deprecated Use clerkship fixtures instead. Requirements are no longer used.
 */
export interface LegacyClerkshipRequirement {
  id: string;
  clerkshipId: string;
  requirementType: 'inpatient' | 'outpatient' | 'elective';
  requiredDays: number;
  overrideMode: 'inherit' | 'override_fields' | 'override_section';
  createdAt: Date;
  updatedAt: Date;
  // Override fields (optional)
  overrideAssignmentStrategy?: string;
  overrideHealthSystemRule?: string;
  overrideMaxStudentsPerDay?: number;
  overrideMaxStudentsPerYear?: number;
  overrideBlockSizeDays?: number;
  overrideAllowPartialBlocks?: boolean;
  overridePreferContinuousBlocks?: boolean;
  overrideAllowTeams?: boolean;
  overrideAllowFallbacks?: boolean;
  overrideFallbackRequiresApproval?: boolean;
  overrideFallbackAllowCrossSystem?: boolean;
}

/**
 * @deprecated Requirements are no longer used. These fixtures are kept only for
 * reference and backward compatibility during migration.
 */
export const requirementsFixtures = {
  // Empty - requirements have been removed from the system
};
