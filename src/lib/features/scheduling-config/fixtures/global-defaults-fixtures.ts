/**
 * Global Defaults Fixtures
 *
 * Sample global defaults representing different school configurations.
 */

import type {
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
} from '../types';

/**
 * School A: Traditional Conservative
 * - Team continuity (prefer same preceptor, fallback to team)
 * - Enforce same health system
 * - Low capacity (1 per day)
 */
export const schoolAOutpatientDefaults: GlobalOutpatientDefaults = {
  id: 'school-a-outpatient-defaults',
  schoolId: 'school-a',
  assignmentStrategy: 'team_continuity',
  healthSystemRule: 'enforce_same_system',
  defaultMaxStudentsPerDay: 1,
  defaultMaxStudentsPerYear: 10,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolAInpatientDefaults: GlobalInpatientDefaults = {
  id: 'school-a-inpatient-defaults',
  schoolId: 'school-a',
  assignmentStrategy: 'team_continuity',
  healthSystemRule: 'enforce_same_system',
  defaultMaxStudentsPerDay: 1,
  defaultMaxStudentsPerYear: 10,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  blockSizeDays: undefined, // Not using blocks
  allowPartialBlocks: undefined,
  preferContinuousBlocks: undefined,
  defaultMaxStudentsPerBlock: undefined,
  defaultMaxBlocksPerYear: undefined,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolAElectiveDefaults: GlobalElectiveDefaults = {
  id: 'school-a-elective-defaults',
  schoolId: 'school-a',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'prefer_same_system',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * School B: Collaborative Team-Based
 * - Team-based approach
 * - Enforce same health system
 * - Higher capacity (2 per day)
 * - Teams of 3-4 preceptors
 */
export const schoolBOutpatientDefaults: GlobalOutpatientDefaults = {
  id: 'school-b-outpatient-defaults',
  schoolId: 'school-b',
  assignmentStrategy: 'continuous_team',
  healthSystemRule: 'enforce_same_system',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: true,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  teamSizeMin: 3,
  teamSizeMax: 4,
  teamRequireSameHealthSystem: true,
  teamRequireSameSpecialty: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolBInpatientDefaults: GlobalInpatientDefaults = {
  id: 'school-b-inpatient-defaults',
  schoolId: 'school-b',
  assignmentStrategy: 'continuous_team',
  healthSystemRule: 'enforce_same_system',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: true,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  blockSizeDays: undefined,
  allowPartialBlocks: undefined,
  preferContinuousBlocks: undefined,
  defaultMaxStudentsPerBlock: undefined,
  defaultMaxBlocksPerYear: undefined,
  teamSizeMin: 3,
  teamSizeMax: 4,
  teamRequireSameHealthSystem: true,
  teamRequireSameSpecialty: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolBElectiveDefaults: GlobalElectiveDefaults = {
  id: 'school-b-elective-defaults',
  schoolId: 'school-b',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * School C: Hybrid Flexible
 * - Continuous for outpatient
 * - Blocks for inpatient (14 days)
 * - Prefer same system (not enforce)
 */
export const schoolCOutpatientDefaults: GlobalOutpatientDefaults = {
  id: 'school-c-outpatient-defaults',
  schoolId: 'school-c',
  assignmentStrategy: 'team_continuity',
  healthSystemRule: 'prefer_same_system',
  defaultMaxStudentsPerDay: 1,
  defaultMaxStudentsPerYear: 15,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolCInpatientDefaults: GlobalInpatientDefaults = {
  id: 'school-c-inpatient-defaults',
  schoolId: 'school-c',
  assignmentStrategy: 'block_based',
  healthSystemRule: 'prefer_same_system',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: true,
  fallbackAllowCrossSystem: false,
  blockSizeDays: 14,
  allowPartialBlocks: false,
  preferContinuousBlocks: true,
  defaultMaxStudentsPerBlock: 4,
  defaultMaxBlocksPerYear: 10,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolCElectiveDefaults: GlobalElectiveDefaults = {
  id: 'school-c-elective-defaults',
  schoolId: 'school-c',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * School D: Modern Maximally Flexible
 * - Daily rotation everywhere
 * - No preference for health systems
 * - High capacity (3 per day)
 * - Maximum flexibility
 */
export const schoolDOutpatientDefaults: GlobalOutpatientDefaults = {
  id: 'school-d-outpatient-defaults',
  schoolId: 'school-d',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 3,
  defaultMaxStudentsPerYear: 30,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolDInpatientDefaults: GlobalInpatientDefaults = {
  id: 'school-d-inpatient-defaults',
  schoolId: 'school-d',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 3,
  defaultMaxStudentsPerYear: 30,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  blockSizeDays: undefined,
  allowPartialBlocks: undefined,
  preferContinuousBlocks: undefined,
  defaultMaxStudentsPerBlock: undefined,
  defaultMaxBlocksPerYear: undefined,
  teamSizeMin: undefined,
  teamSizeMax: undefined,
  teamRequireSameHealthSystem: undefined,
  teamRequireSameSpecialty: undefined,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

export const schoolDElectiveDefaults: GlobalElectiveDefaults = {
  id: 'school-d-elective-defaults',
  schoolId: 'school-d',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 3,
  defaultMaxStudentsPerYear: 30,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

/**
 * All fixtures grouped by school
 */
export const globalDefaultsFixtures = {
  schoolA: {
    outpatient: schoolAOutpatientDefaults,
    inpatient: schoolAInpatientDefaults,
    elective: schoolAElectiveDefaults,
  },
  schoolB: {
    outpatient: schoolBOutpatientDefaults,
    inpatient: schoolBInpatientDefaults,
    elective: schoolBElectiveDefaults,
  },
  schoolC: {
    outpatient: schoolCOutpatientDefaults,
    inpatient: schoolCInpatientDefaults,
    elective: schoolCElectiveDefaults,
  },
  schoolD: {
    outpatient: schoolDOutpatientDefaults,
    inpatient: schoolDInpatientDefaults,
    elective: schoolDElectiveDefaults,
  },
};
