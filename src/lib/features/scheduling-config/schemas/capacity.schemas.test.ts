import { describe, it, expect } from 'vitest';
import { preceptorCapacityRuleInputSchema } from './capacity.schemas';

describe('Capacity Schemas', () => {
  describe('preceptorCapacityRuleInputSchema', () => {
    it('should validate basic capacity rule', () => {
      const validRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it('should validate clerkship-specific capacity rule', () => {
      const validRule = {
        preceptorId: 'prec-1',
        clerkshipId: 'clerkship-1',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it('should validate requirement-type-specific capacity rule', () => {
      const validRule = {
        preceptorId: 'prec-1',
        requirementType: 'outpatient' as const,
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 10,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it('should validate full hierarchy capacity rule', () => {
      const validRule = {
        preceptorId: 'prec-1',
        clerkshipId: 'clerkship-1',
        requirementType: 'inpatient' as const,
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it('should validate with block settings', () => {
      const validRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        maxStudentsPerBlock: 4,
        maxBlocksPerYear: 10,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it('should reject when max per year < max per day', () => {
      const invalidRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 10,
        maxStudentsPerYear: 5,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(invalidRule);
      expect(result.success).toBe(false);
    });

    it('should reject when only max students per block is specified', () => {
      const invalidRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        maxStudentsPerBlock: 4,
        // Missing maxBlocksPerYear
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(invalidRule);
      expect(result.success).toBe(false);
    });

    it('should reject when only max blocks per year is specified', () => {
      const invalidRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 2,
        maxStudentsPerYear: 20,
        maxBlocksPerYear: 10,
        // Missing maxStudentsPerBlock
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(invalidRule);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative values', () => {
      const invalidRules = [
        { preceptorId: 'prec-1', maxStudentsPerDay: 0, maxStudentsPerYear: 10 },
        { preceptorId: 'prec-1', maxStudentsPerDay: -1, maxStudentsPerYear: 10 },
        { preceptorId: 'prec-1', maxStudentsPerDay: 1, maxStudentsPerYear: 0 },
      ];

      invalidRules.forEach(rule => {
        const result = preceptorCapacityRuleInputSchema.safeParse(rule);
        expect(result.success).toBe(false);
      });
    });

    it('should accept equal max per day and per year', () => {
      const validRule = {
        preceptorId: 'prec-1',
        maxStudentsPerDay: 5,
        maxStudentsPerYear: 5,
      };

      const result = preceptorCapacityRuleInputSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });
  });
});
