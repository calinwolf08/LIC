import { describe, it, expect } from 'vitest';
import {
  globalDefaultsBaseSchema,
  globalOutpatientDefaultsInputSchema,
  globalInpatientDefaultsInputSchema,
  globalElectiveDefaultsInputSchema,
} from './global-defaults.schemas';

describe('Global Defaults Schemas', () => {
  describe('globalDefaultsBaseSchema', () => {
    it('should validate correct base configuration', () => {
      const validConfig = {
        assignmentStrategy: 'continuous_single' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false,
      };

      const result = globalDefaultsBaseSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid assignment strategy', () => {
      const invalidConfig = {
        assignmentStrategy: 'invalid_strategy',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject invalid health system rule', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'invalid_rule',
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject negative max students per day', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: -1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject zero max students per day', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: 0,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject when max per year < max per day', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: 10,
        defaultMaxStudentsPerYear: 5,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should apply default values for boolean fields', () => {
      const minimalConfig = {
        assignmentStrategy: 'continuous_single' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowTeams).toBe(false);
        expect(result.data.allowFallbacks).toBe(true);
        expect(result.data.fallbackRequiresApproval).toBe(false);
        expect(result.data.fallbackAllowCrossSystem).toBe(false);
      }
    });
  });

  describe('globalOutpatientDefaultsInputSchema', () => {
    it('should validate outpatient defaults with team settings', () => {
      const validConfig = {
        assignmentStrategy: 'continuous_team' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        allowTeams: true,
        teamSizeMin: 3,
        teamSizeMax: 4,
        teamRequireSameHealthSystem: true,
        teamRequireSameSpecialty: false,
      };

      const result = globalOutpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject when team size min > max', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_team',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        teamSizeMin: 5,
        teamSizeMax: 3,
      };

      const result = globalOutpatientDefaultsInputSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should allow optional team settings', () => {
      const validConfig = {
        assignmentStrategy: 'continuous_single' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalOutpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('globalInpatientDefaultsInputSchema', () => {
    it('should validate inpatient defaults with block settings', () => {
      const validConfig = {
        assignmentStrategy: 'block_based' as const,
        healthSystemRule: 'prefer_same_system' as const,
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        blockSizeDays: 14,
        allowPartialBlocks: false,
        preferContinuousBlocks: true,
        defaultMaxStudentsPerBlock: 4,
        defaultMaxBlocksPerYear: 10,
      };

      const result = globalInpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should require block size days when using block-based strategy', () => {
      const invalidConfig = {
        assignmentStrategy: 'block_based',
        healthSystemRule: 'prefer_same_system',
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        // Missing blockSizeDays
      };

      const result = globalInpatientDefaultsInputSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should allow block-based strategy with block size days', () => {
      const validConfig = {
        assignmentStrategy: 'block_based' as const,
        healthSystemRule: 'prefer_same_system' as const,
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        blockSizeDays: 7,
      };

      const result = globalInpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should allow continuous strategy without block settings', () => {
      const validConfig = {
        assignmentStrategy: 'continuous_single' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 1,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalInpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should validate with team settings', () => {
      const validConfig = {
        assignmentStrategy: 'continuous_team' as const,
        healthSystemRule: 'enforce_same_system' as const,
        defaultMaxStudentsPerDay: 2,
        defaultMaxStudentsPerYear: 20,
        teamSizeMin: 3,
        teamSizeMax: 4,
        teamRequireSameHealthSystem: true,
      };

      const result = globalInpatientDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('globalElectiveDefaultsInputSchema', () => {
    it('should validate elective defaults', () => {
      const validConfig = {
        assignmentStrategy: 'daily_rotation' as const,
        healthSystemRule: 'no_preference' as const,
        defaultMaxStudentsPerDay: 3,
        defaultMaxStudentsPerYear: 30,
        allowTeams: false,
        allowFallbacks: true,
        fallbackAllowCrossSystem: true,
      };

      const result = globalElectiveDefaultsInputSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle equal max per day and per year', () => {
      const validConfig = {
        assignmentStrategy: 'daily_rotation' as const,
        healthSystemRule: 'no_preference' as const,
        defaultMaxStudentsPerDay: 5,
        defaultMaxStudentsPerYear: 5,
      };

      const result = globalDefaultsBaseSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject non-integer values', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'enforce_same_system',
        defaultMaxStudentsPerDay: 1.5,
        defaultMaxStudentsPerYear: 10,
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidConfig = {
        assignmentStrategy: 'continuous_single',
        // Missing healthSystemRule and capacity fields
      };

      const result = globalDefaultsBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });
});
