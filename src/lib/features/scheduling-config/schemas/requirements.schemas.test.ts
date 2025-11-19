import { describe, it, expect } from 'vitest';
import {
  requirementInputSchema,
  fieldOverrideInputSchema,
  applyDefaultsChangeInputSchema,
  clerkshipElectiveInputSchema,
} from './requirements.schemas';

describe('Requirements Schemas', () => {
  describe('requirementInputSchema', () => {
    describe('inherit mode', () => {
      it('should validate requirement with inherit mode', () => {
        const validRequirement = {
          requirementType: 'outpatient' as const,
          requiredDays: 40,
          overrideMode: 'inherit' as const,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });

      it('should allow override fields in inherit mode (ignored)', () => {
        const validRequirement = {
          requirementType: 'outpatient' as const,
          requiredDays: 40,
          overrideMode: 'inherit' as const,
          overrideAssignmentStrategy: 'continuous_team' as const, // Should be ignored
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });
    });

    describe('override_section mode', () => {
      it('should require assignment strategy and health system rule', () => {
        const invalidRequirement = {
          requirementType: 'outpatient',
          requiredDays: 40,
          overrideMode: 'override_section',
          // Missing required overrides
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should validate with required override fields', () => {
        const validRequirement = {
          requirementType: 'outpatient' as const,
          requiredDays: 40,
          overrideMode: 'override_section' as const,
          overrideAssignmentStrategy: 'continuous_team' as const,
          overrideHealthSystemRule: 'prefer_same_system' as const,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });

      it('should validate with all override fields', () => {
        const validRequirement = {
          requirementType: 'inpatient' as const,
          requiredDays: 20,
          overrideMode: 'override_section' as const,
          overrideAssignmentStrategy: 'block_based' as const,
          overrideHealthSystemRule: 'prefer_same_system' as const,
          overrideMaxStudentsPerDay: 2,
          overrideMaxStudentsPerYear: 20,
          overrideBlockSizeDays: 14,
          overrideAllowPartialBlocks: false,
          overridePreferContinuousBlocks: true,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });
    });

    describe('override_fields mode', () => {
      it('should require at least one override field', () => {
        const invalidRequirement = {
          requirementType: 'outpatient',
          requiredDays: 40,
          overrideMode: 'override_fields',
          // No override fields provided
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should validate with single override field', () => {
        const validRequirement = {
          requirementType: 'outpatient' as const,
          requiredDays: 40,
          overrideMode: 'override_fields' as const,
          overrideAssignmentStrategy: 'continuous_team' as const,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });

      it('should validate with multiple override fields', () => {
        const validRequirement = {
          requirementType: 'outpatient' as const,
          requiredDays: 40,
          overrideMode: 'override_fields' as const,
          overrideAssignmentStrategy: 'continuous_team' as const,
          overrideMaxStudentsPerDay: 2,
          overrideAllowTeams: true,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });
    });

    describe('validation rules', () => {
      it('should reject zero or negative required days', () => {
        const invalidRequirement = {
          requirementType: 'outpatient',
          requiredDays: 0,
          overrideMode: 'inherit',
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should reject when max per year < max per day', () => {
        const invalidRequirement = {
          requirementType: 'outpatient',
          requiredDays: 40,
          overrideMode: 'override_fields',
          overrideMaxStudentsPerDay: 10,
          overrideMaxStudentsPerYear: 5,
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should require block size when using block-based strategy', () => {
        const invalidRequirement = {
          requirementType: 'inpatient',
          requiredDays: 20,
          overrideMode: 'override_fields',
          overrideAssignmentStrategy: 'block_based',
          // Missing overrideBlockSizeDays
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should validate block-based with block size', () => {
        const validRequirement = {
          requirementType: 'inpatient' as const,
          requiredDays: 20,
          overrideMode: 'override_fields' as const,
          overrideAssignmentStrategy: 'block_based' as const,
          overrideBlockSizeDays: 14,
        };

        const result = requirementInputSchema.safeParse(validRequirement);
        expect(result.success).toBe(true);
      });

      it('should reject invalid requirement types', () => {
        const invalidRequirement = {
          requirementType: 'invalid_type',
          requiredDays: 40,
          overrideMode: 'inherit',
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });

      it('should reject invalid override modes', () => {
        const invalidRequirement = {
          requirementType: 'outpatient',
          requiredDays: 40,
          overrideMode: 'invalid_mode',
        };

        const result = requirementInputSchema.safeParse(invalidRequirement);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('fieldOverrideInputSchema', () => {
    it('should validate field override', () => {
      const validOverride = {
        fieldName: 'assignmentStrategy',
        value: 'continuous_team',
      };

      const result = fieldOverrideInputSchema.safeParse(validOverride);
      expect(result.success).toBe(true);
    });

    it('should reject empty field name', () => {
      const invalidOverride = {
        fieldName: '',
        value: 'continuous_team',
      };

      const result = fieldOverrideInputSchema.safeParse(invalidOverride);
      expect(result.success).toBe(false);
    });

    it('should allow any value type', () => {
      const validOverrides = [
        { fieldName: 'strategy', value: 'continuous_team' },
        { fieldName: 'count', value: 5 },
        { fieldName: 'enabled', value: true },
        { fieldName: 'config', value: { nested: 'object' } },
      ];

      validOverrides.forEach(override => {
        const result = fieldOverrideInputSchema.safeParse(override);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('applyDefaultsChangeInputSchema', () => {
    it('should validate apply defaults change', () => {
      const validInput = {
        defaultType: 'outpatient' as const,
        applyScope: 'all_existing' as const,
      };

      const result = applyDefaultsChangeInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate with new_only scope', () => {
      const validInput = {
        defaultType: 'inpatient' as const,
        applyScope: 'new_only' as const,
      };

      const result = applyDefaultsChangeInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid default type', () => {
      const invalidInput = {
        defaultType: 'invalid_type',
        applyScope: 'all_existing',
      };

      const result = applyDefaultsChangeInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid apply scope', () => {
      const invalidInput = {
        defaultType: 'outpatient',
        applyScope: 'invalid_scope',
      };

      const result = applyDefaultsChangeInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('clerkshipElectiveInputSchema', () => {
    it('should validate elective configuration', () => {
      const validElective = {
        name: 'Rural Medicine',
        minimumDays: 5,
        specialty: 'Family Medicine',
        availablePreceptorIds: ['prec-1', 'prec-2'],
      };

      const result = clerkshipElectiveInputSchema.safeParse(validElective);
      expect(result.success).toBe(true);
    });

    it('should require at least one preceptor', () => {
      const invalidElective = {
        name: 'Rural Medicine',
        minimumDays: 5,
        availablePreceptorIds: [],
      };

      const result = clerkshipElectiveInputSchema.safeParse(invalidElective);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const invalidElective = {
        name: '',
        minimumDays: 5,
        availablePreceptorIds: ['prec-1'],
      };

      const result = clerkshipElectiveInputSchema.safeParse(invalidElective);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative minimum days', () => {
      const invalidElective = {
        name: 'Rural Medicine',
        minimumDays: 0,
        availablePreceptorIds: ['prec-1'],
      };

      const result = clerkshipElectiveInputSchema.safeParse(invalidElective);
      expect(result.success).toBe(false);
    });

    it('should allow optional specialty', () => {
      const validElective = {
        name: 'Rural Medicine',
        minimumDays: 5,
        availablePreceptorIds: ['prec-1'],
      };

      const result = clerkshipElectiveInputSchema.safeParse(validElective);
      expect(result.success).toBe(true);
    });
  });
});
