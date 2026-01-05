/**
 * Requirement Configuration Types
 *
 * NOTE: ClerkshipRequirements have been removed in favor of direct
 * clerkship → elective relationships. Clerkships now define their type
 * (inpatient/outpatient) directly, and electives link directly to clerkships.
 */

// ClerkshipRequirement and ClerkshipRequirementOverride removed in migration 025
// The clerkship itself now defines whether it's inpatient or outpatient
// Electives link directly to clerkships via clerkship_id

/**
 * Clerkship Elective
 *
 * Defines an elective within a clerkship.
 * Electives link directly to clerkships (not through requirements).
 * Each elective can inherit settings from its parent clerkship or override them.
 */
export interface ClerkshipElective {
  id: string;
  clerkshipId: string;
  name: string;
  minimumDays: number;
  isRequired: boolean;
  specialty?: string;
  overrideMode: 'inherit' | 'override';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Clerkship Elective with associated sites and preceptors
 */
export interface ClerkshipElectiveWithDetails extends ClerkshipElective {
  sites: Array<{ id: string; name: string }>;
  preceptors: Array<{ id: string; name: string }>;
}
