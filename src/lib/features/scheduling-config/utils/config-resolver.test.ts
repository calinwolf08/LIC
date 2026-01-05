/**
 * Configuration Resolution Utility Tests (DEPRECATED)
 *
 * NOTE: The config-resolver utility has been deprecated along with the
 * clerkship_requirements table. These tests are kept for reference only.
 *
 * See constraint-factory.ts for the new configuration resolution approach.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveRequirementConfiguration,
  validateResolvedConfiguration,
  type LegacyClerkshipRequirement,
} from './config-resolver';
import type {
  GlobalOutpatientDefaults,
} from '../types';

// Mock global defaults for testing
const mockOutpatientDefaults: GlobalOutpatientDefaults = {
  id: 'default-outpatient',
  schoolId: 'school-1',
  assignmentStrategy: 'continuous_single',
  healthSystemRule: 'enforce_same_system',
  defaultMaxStudentsPerDay: 1,
  defaultMaxStudentsPerYear: 10,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: false,
  teamSizeMin: 3,
  teamSizeMax: 4,
  teamRequireSameHealthSystem: true,
  teamRequireSameSpecialty: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('resolveRequirementConfiguration (DEPRECATED)', () => {
  it('should return configuration with global defaults', () => {
    const requirement: LegacyClerkshipRequirement = {
      id: 'req-1',
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient',
      requiredDays: 40,
      overrideMode: 'inherit',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

    expect(resolved.clerkshipId).toBe('clerkship-1');
    expect(resolved.requirementType).toBe('outpatient');
    expect(resolved.requiredDays).toBe(40);
    expect(resolved.assignmentStrategy).toBe('continuous_single');
    expect(resolved.healthSystemRule).toBe('enforce_same_system');
    expect(resolved.source).toBe('global_defaults');
  });
});

describe('validateResolvedConfiguration (DEPRECATED)', () => {
  it('should validate a complete configuration', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient' as const,
      requiredDays: 40,
      assignmentStrategy: 'continuous_single' as const,
      healthSystemRule: 'enforce_same_system' as const,
      maxStudentsPerDay: 1,
      maxStudentsPerYear: 10,
      allowTeams: false,
      allowFallbacks: true,
      fallbackRequiresApproval: false,
      fallbackAllowCrossSystem: false,
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject configuration missing required fields', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient' as const,
      requiredDays: 40,
      assignmentStrategy: undefined as any,
      healthSystemRule: 'enforce_same_system' as const,
      maxStudentsPerDay: 1,
      maxStudentsPerYear: 10,
      allowTeams: false,
      allowFallbacks: true,
      fallbackRequiresApproval: false,
      fallbackAllowCrossSystem: false,
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assignmentStrategy is required');
  });

  it('should reject block-based strategy without blockSizeDays', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'inpatient' as const,
      requiredDays: 20,
      assignmentStrategy: 'block_based' as const,
      healthSystemRule: 'prefer_same_system' as const,
      maxStudentsPerDay: 2,
      maxStudentsPerYear: 20,
      allowTeams: true,
      allowFallbacks: true,
      fallbackRequiresApproval: true,
      fallbackAllowCrossSystem: false,
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('blockSizeDays must be positive when using block_based strategy');
  });

  it('should reject maxStudentsPerDay exceeding maxStudentsPerYear', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient' as const,
      requiredDays: 40,
      assignmentStrategy: 'continuous_single' as const,
      healthSystemRule: 'enforce_same_system' as const,
      maxStudentsPerDay: 20,
      maxStudentsPerYear: 10,
      allowTeams: false,
      allowFallbacks: true,
      fallbackRequiresApproval: false,
      fallbackAllowCrossSystem: false,
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxStudentsPerDay cannot exceed maxStudentsPerYear');
  });
});
