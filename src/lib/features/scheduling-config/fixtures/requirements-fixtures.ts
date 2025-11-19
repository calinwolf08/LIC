/**
 * Clerkship Requirements Fixtures
 *
 * Sample requirements demonstrating different override modes.
 */

import type { ClerkshipRequirement } from '../types';

/**
 * Internal Medicine - Inherits all defaults
 */
export const internalMedicineOutpatientRequirement: ClerkshipRequirement = {
  id: 'req-im-outpatient',
  clerkshipId: 'clerkship-internal-medicine',
  requirementType: 'outpatient',
  requiredDays: 40,
  overrideMode: 'inherit', // Uses all global defaults
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const internalMedicineInpatientRequirement: ClerkshipRequirement = {
  id: 'req-im-inpatient',
  clerkshipId: 'clerkship-internal-medicine',
  requirementType: 'inpatient',
  requiredDays: 20,
  overrideMode: 'inherit',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * Surgery - Override specific fields for outpatient (uses teams)
 */
export const surgeryOutpatientRequirement: ClerkshipRequirement = {
  id: 'req-surgery-outpatient',
  clerkshipId: 'clerkship-surgery',
  requirementType: 'outpatient',
  requiredDays: 30,
  overrideMode: 'override_fields',
  // Override to use teams instead of single preceptor
  overrideAssignmentStrategy: 'continuous_team',
  overrideAllowTeams: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const surgeryInpatientRequirement: ClerkshipRequirement = {
  id: 'req-surgery-inpatient',
  clerkshipId: 'clerkship-surgery',
  requirementType: 'inpatient',
  requiredDays: 30,
  overrideMode: 'override_fields',
  // Override to allow higher capacity for busy surgical service
  overrideMaxStudentsPerDay: 3,
  overrideMaxStudentsPerYear: 25,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * Pediatrics - Fully customized (override section)
 */
export const pediatricsOutpatientRequirement: ClerkshipRequirement = {
  id: 'req-peds-outpatient',
  clerkshipId: 'clerkship-pediatrics',
  requirementType: 'outpatient',
  requiredDays: 35,
  overrideMode: 'override_section',
  // Completely custom configuration
  overrideAssignmentStrategy: 'block_based',
  overrideHealthSystemRule: 'prefer_same_system',
  overrideMaxStudentsPerDay: 2,
  overrideMaxStudentsPerYear: 15,
  overrideBlockSizeDays: 7,
  overrideAllowPartialBlocks: true,
  overridePreferContinuousBlocks: false,
  overrideAllowTeams: false,
  overrideAllowFallbacks: true,
  overrideFallbackRequiresApproval: true,
  overrideFallbackAllowCrossSystem: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const pediatricsInpatientRequirement: ClerkshipRequirement = {
  id: 'req-peds-inpatient',
  clerkshipId: 'clerkship-pediatrics',
  requirementType: 'inpatient',
  requiredDays: 25,
  overrideMode: 'inherit', // Pediatrics inpatient uses defaults
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * Family Medicine - Mixed override modes
 */
export const familyMedicineOutpatientRequirement: ClerkshipRequirement = {
  id: 'req-fm-outpatient',
  clerkshipId: 'clerkship-family-medicine',
  requirementType: 'outpatient',
  requiredDays: 50,
  overrideMode: 'inherit',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const familyMedicineElectiveRequirement: ClerkshipRequirement = {
  id: 'req-fm-elective',
  clerkshipId: 'clerkship-family-medicine',
  requirementType: 'elective',
  requiredDays: 10,
  overrideMode: 'override_fields',
  // Allow cross-system for electives
  overrideFallbackAllowCrossSystem: true,
  overrideMaxStudentsPerDay: 3,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * All fixtures grouped by clerkship
 */
export const requirementsFixtures = {
  internalMedicine: {
    outpatient: internalMedicineOutpatientRequirement,
    inpatient: internalMedicineInpatientRequirement,
  },
  surgery: {
    outpatient: surgeryOutpatientRequirement,
    inpatient: surgeryInpatientRequirement,
  },
  pediatrics: {
    outpatient: pediatricsOutpatientRequirement,
    inpatient: pediatricsInpatientRequirement,
  },
  familyMedicine: {
    outpatient: familyMedicineOutpatientRequirement,
    elective: familyMedicineElectiveRequirement,
  },
};
