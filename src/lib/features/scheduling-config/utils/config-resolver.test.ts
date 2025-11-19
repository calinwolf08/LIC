import { describe, it, expect } from 'vitest';
import {
  resolveRequirementConfiguration,
  validateResolvedConfiguration,
} from './config-resolver';
import type {
  ClerkshipRequirement,
  GlobalOutpatientDefaults,
  GlobalInpatientDefaults,
  GlobalElectiveDefaults,
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

const mockInpatientDefaults: GlobalInpatientDefaults = {
  id: 'default-inpatient',
  schoolId: 'school-1',
  assignmentStrategy: 'block_based',
  healthSystemRule: 'prefer_same_system',
  defaultMaxStudentsPerDay: 2,
  defaultMaxStudentsPerYear: 20,
  allowTeams: true,
  allowFallbacks: true,
  fallbackRequiresApproval: true,
  fallbackAllowCrossSystem: false,
  blockSizeDays: 14,
  allowPartialBlocks: false,
  preferContinuousBlocks: true,
  defaultMaxStudentsPerBlock: 4,
  defaultMaxBlocksPerYear: 10,
  teamSizeMin: 2,
  teamSizeMax: 5,
  teamRequireSameHealthSystem: true,
  teamRequireSameSpecialty: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockElectiveDefaults: GlobalElectiveDefaults = {
  id: 'default-elective',
  schoolId: 'school-1',
  assignmentStrategy: 'daily_rotation',
  healthSystemRule: 'no_preference',
  defaultMaxStudentsPerDay: 3,
  defaultMaxStudentsPerYear: 30,
  allowTeams: false,
  allowFallbacks: true,
  fallbackRequiresApproval: false,
  fallbackAllowCrossSystem: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('resolveRequirementConfiguration', () => {
  describe('inherit mode - outpatient', () => {
    it('should use all global defaults for outpatient requirement', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-1',
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved).toEqual({
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        teamSizeMin: 3,
        teamSizeMax: 4,
        teamRequireSameHealthSystem: true,
        teamRequireSameSpecialty: false,
        source: 'global_defaults',
        overriddenFields: [],
      });
    });
  });

  describe('inherit mode - inpatient', () => {
    it('should use all global defaults for inpatient requirement including block settings', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-2',
        clerkshipId: 'clerkship-1',
        requirementType: 'inpatient',
        requiredDays: 20,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockInpatientDefaults);

      expect(resolved).toEqual({
        clerkshipId: 'clerkship-1',
        requirementType: 'inpatient',
        requiredDays: 20,
        assignmentStrategy: 'block_based',
        healthSystemRule: 'prefer_same_system',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        allowTeams: true,
        allowFallbacks: true,
        fallbackRequiresApproval: true,
        fallbackAllowCrossSystem: false,
        blockSizeDays: 14,
        allowPartialBlocks: false,
        preferContinuousBlocks: true,
        maxStudentsPerBlock: 4,
        maxBlocksPerYear: 10,
        teamSizeMin: 2,
        teamSizeMax: 5,
        teamRequireSameHealthSystem: true,
        teamRequireSameSpecialty: true,
        source: 'global_defaults',
        overriddenFields: [],
      });
    });
  });

  describe('inherit mode - elective', () => {
    it('should use all global defaults for elective requirement', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-3',
        clerkshipId: 'clerkship-1',
        requirementType: 'elective',
        requiredDays: 10,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockElectiveDefaults);

      expect(resolved).toEqual({
        clerkshipId: 'clerkship-1',
        requirementType: 'elective',
        requiredDays: 10,
        assignmentStrategy: 'daily_rotation',
        healthSystemRule: 'no_preference',
        maxStudentsPerDay: 3,
        maxStudentsPerYear: 30,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: true,
        source: 'global_defaults',
        overriddenFields: [],
      });
    });
  });

  describe('override_section mode', () => {
    it('should use all override values when available', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-4',
        clerkshipId: 'clerkship-2',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_section',
        overrideAssignmentStrategy: 'continuous_team',
        overrideHealthSystemRule: 'prefer_same_system',
        overrideMaxStudentsPerDay: 2,
        overrideMaxStudentsPerYear: 15,
        overrideAllowTeams: true,
        overrideAllowFallbacks: false,
        overrideFallbackRequiresApproval: true,
        overrideFallbackAllowCrossSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.source).toBe('full_override');
      expect(resolved.assignmentStrategy).toBe('continuous_team');
      expect(resolved.healthSystemRule).toBe('prefer_same_system');
      expect(resolved.maxStudentsPerDay).toBe(2);
      expect(resolved.maxStudentsPerYear).toBe(15);
      expect(resolved.allowTeams).toBe(true);
      expect(resolved.allowFallbacks).toBe(false);
      expect(resolved.fallbackRequiresApproval).toBe(true);
      expect(resolved.fallbackAllowCrossSystem).toBe(true);
      expect(resolved.overriddenFields?.length).toBeGreaterThan(0);
    });

    it('should throw error if required override fields are missing', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-5',
        clerkshipId: 'clerkship-2',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_section',
        // Missing overrideAssignmentStrategy and overrideHealthSystemRule
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => {
        resolveRequirementConfiguration(requirement, mockOutpatientDefaults);
      }).toThrow();
    });

    it('should use defaults for unspecified override fields', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-6',
        clerkshipId: 'clerkship-2',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_section',
        overrideAssignmentStrategy: 'continuous_team',
        overrideHealthSystemRule: 'prefer_same_system',
        // Other fields not specified, should fall back to defaults
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.maxStudentsPerDay).toBe(mockOutpatientDefaults.defaultMaxStudentsPerDay);
      expect(resolved.maxStudentsPerYear).toBe(mockOutpatientDefaults.defaultMaxStudentsPerYear);
      expect(resolved.allowTeams).toBe(mockOutpatientDefaults.allowTeams);
    });
  });

  describe('override_fields mode - partial overrides', () => {
    it('should merge defaults with specific field overrides', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-7',
        clerkshipId: 'clerkship-3',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_fields',
        overrideAssignmentStrategy: 'continuous_team', // Override this
        overrideMaxStudentsPerDay: 2, // Override this
        // Other fields should use defaults
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.source).toBe('partial_override');
      expect(resolved.assignmentStrategy).toBe('continuous_team'); // Overridden
      expect(resolved.maxStudentsPerDay).toBe(2); // Overridden
      expect(resolved.healthSystemRule).toBe('enforce_same_system'); // From defaults
      expect(resolved.maxStudentsPerYear).toBe(10); // From defaults
      expect(resolved.allowTeams).toBe(false); // From defaults
      expect(resolved.overriddenFields).toContain('assignmentStrategy');
      expect(resolved.overriddenFields).toContain('maxStudentsPerDay');
      expect(resolved.overriddenFields).not.toContain('healthSystemRule');
    });

    it('should track all overridden fields', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-8',
        clerkshipId: 'clerkship-3',
        requirementType: 'inpatient',
        requiredDays: 20,
        overrideMode: 'override_fields',
        overrideAssignmentStrategy: 'continuous_single',
        overrideBlockSizeDays: 7,
        overrideAllowPartialBlocks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockInpatientDefaults);

      expect(resolved.overriddenFields).toContain('assignmentStrategy');
      expect(resolved.overriddenFields).toContain('blockSizeDays');
      expect(resolved.overriddenFields).toContain('allowPartialBlocks');
      expect(resolved.overriddenFields?.length).toBe(3);
    });

    it('should use all defaults if no overrides specified', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-9',
        clerkshipId: 'clerkship-3',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_fields',
        // No overrides specified
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.source).toBe('partial_override');
      expect(resolved.overriddenFields?.length).toBe(0);
      expect(resolved.assignmentStrategy).toBe(mockOutpatientDefaults.assignmentStrategy);
      expect(resolved.healthSystemRule).toBe(mockOutpatientDefaults.healthSystemRule);
    });
  });

  describe('requirement type specific fields', () => {
    it('should include team settings for outpatient requirements', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-10',
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.teamSizeMin).toBe(3);
      expect(resolved.teamSizeMax).toBe(4);
      expect(resolved.teamRequireSameHealthSystem).toBe(true);
      expect(resolved.teamRequireSameSpecialty).toBe(false);
    });

    it('should include block settings for inpatient requirements', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-11',
        clerkshipId: 'clerkship-1',
        requirementType: 'inpatient',
        requiredDays: 20,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockInpatientDefaults);

      expect(resolved.blockSizeDays).toBe(14);
      expect(resolved.allowPartialBlocks).toBe(false);
      expect(resolved.preferContinuousBlocks).toBe(true);
      expect(resolved.maxStudentsPerBlock).toBe(4);
      expect(resolved.maxBlocksPerYear).toBe(10);
    });

    it('should not include block settings for outpatient requirements', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-12',
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.blockSizeDays).toBeUndefined();
      expect(resolved.allowPartialBlocks).toBeUndefined();
      expect(resolved.preferContinuousBlocks).toBeUndefined();
      expect(resolved.maxStudentsPerBlock).toBeUndefined();
      expect(resolved.maxBlocksPerYear).toBeUndefined();
    });

    it('should not include team settings for elective requirements', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-13',
        clerkshipId: 'clerkship-1',
        requirementType: 'elective',
        requiredDays: 10,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockElectiveDefaults);

      expect(resolved.teamSizeMin).toBeUndefined();
      expect(resolved.teamSizeMax).toBeUndefined();
      expect(resolved.teamRequireSameHealthSystem).toBeUndefined();
      expect(resolved.teamRequireSameSpecialty).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined optional fields in global defaults', () => {
      const sparseDefaults: GlobalOutpatientDefaults = {
        id: 'default-sparse',
        schoolId: 'school-1',
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'no_preference',
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
        // Team settings omitted
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const requirement: ClerkshipRequirement = {
        id: 'req-14',
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'inherit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, sparseDefaults);

      expect(resolved.assignmentStrategy).toBe('continuous_single');
      expect(resolved.teamSizeMin).toBeUndefined();
      expect(resolved.teamSizeMax).toBeUndefined();
    });

    it('should handle null override values as non-overridden', () => {
      const requirement: ClerkshipRequirement = {
        id: 'req-15',
        clerkshipId: 'clerkship-3',
        requirementType: 'outpatient',
        requiredDays: 40,
        overrideMode: 'override_fields',
        overrideAssignmentStrategy: undefined, // Should use default
        overrideMaxStudentsPerDay: 2, // Should override
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resolved = resolveRequirementConfiguration(requirement, mockOutpatientDefaults);

      expect(resolved.assignmentStrategy).toBe(mockOutpatientDefaults.assignmentStrategy);
      expect(resolved.maxStudentsPerDay).toBe(2);
    });

    it('should throw error for unknown override mode', () => {
      const requirement = {
        id: 'req-16',
        clerkshipId: 'clerkship-1',
        requirementType: 'outpatient' as const,
        requiredDays: 40,
        overrideMode: 'unknown_mode' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => {
        resolveRequirementConfiguration(requirement, mockOutpatientDefaults);
      }).toThrow('Unknown override mode');
    });
  });
});

describe('validateResolvedConfiguration', () => {
  it('should validate a complete and correct configuration', () => {
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
      // Missing blockSizeDays
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('blockSizeDays must be positive when using block_based strategy');
  });

  it('should reject invalid team size ranges', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient' as const,
      requiredDays: 40,
      assignmentStrategy: 'continuous_team' as const,
      healthSystemRule: 'enforce_same_system' as const,
      maxStudentsPerDay: 2,
      maxStudentsPerYear: 20,
      allowTeams: true,
      teamSizeMin: 5,
      teamSizeMax: 3, // Invalid: min > max
      allowFallbacks: true,
      fallbackRequiresApproval: false,
      fallbackAllowCrossSystem: false,
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('teamSizeMin cannot be greater than teamSizeMax');
  });

  it('should reject maxStudentsPerDay exceeding maxStudentsPerYear', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'outpatient' as const,
      requiredDays: 40,
      assignmentStrategy: 'continuous_single' as const,
      healthSystemRule: 'enforce_same_system' as const,
      maxStudentsPerDay: 20,
      maxStudentsPerYear: 10, // Invalid: per day > per year
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

  it('should return all validation errors when multiple issues exist', () => {
    const config = {
      clerkshipId: 'clerkship-1',
      requirementType: 'inpatient' as const,
      requiredDays: 20,
      assignmentStrategy: 'block_based' as const,
      healthSystemRule: undefined as any, // Missing
      maxStudentsPerDay: 30,
      maxStudentsPerYear: 10, // Invalid: per day > per year
      allowTeams: true,
      teamSizeMin: 5,
      teamSizeMax: 3, // Invalid: min > max
      allowFallbacks: true,
      fallbackRequiresApproval: true,
      fallbackAllowCrossSystem: false,
      // Missing blockSizeDays
      source: 'global_defaults' as const,
      overriddenFields: [],
    };

    const result = validateResolvedConfiguration(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors).toContain('healthSystemRule is required');
    expect(result.errors).toContain('blockSizeDays must be positive when using block_based strategy');
    expect(result.errors).toContain('teamSizeMin cannot be greater than teamSizeMax');
    expect(result.errors).toContain('maxStudentsPerDay cannot exceed maxStudentsPerYear');
  });
});
