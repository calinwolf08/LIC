import { describe, it, expect } from 'vitest';
import {
  preceptorTeamMemberInputSchema,
  preceptorTeamInputSchema,
  preceptorFallbackInputSchema,
} from './teams.schemas';

describe('Teams Schemas', () => {
  describe('preceptorTeamMemberInputSchema', () => {
    it('should validate team member', () => {
      const validMember = {
        preceptorId: 'prec-1',
        role: 'Lead',
        priority: 1,
      };

      const result = preceptorTeamMemberInputSchema.safeParse(validMember);
      expect(result.success).toBe(true);
    });

    it('should allow optional role', () => {
      const validMember = {
        preceptorId: 'prec-1',
        priority: 1,
      };

      const result = preceptorTeamMemberInputSchema.safeParse(validMember);
      expect(result.success).toBe(true);
    });

    it('should reject priority less than 1', () => {
      const invalidMember = {
        preceptorId: 'prec-1',
        priority: 0,
      };

      const result = preceptorTeamMemberInputSchema.safeParse(invalidMember);
      expect(result.success).toBe(false);
    });
  });

  describe('preceptorTeamInputSchema', () => {
    it('should validate team with minimum 1 member', () => {
      const validTeam = {
        name: 'Internal Medicine Team A',
        requireSameHealthSystem: true,
        requireSameSite: false,
        requireSameSpecialty: true,
        requiresAdminApproval: false,
        members: [
          { preceptorId: 'prec-1', priority: 1 },
        ],
      };

      const result = preceptorTeamInputSchema.safeParse(validTeam);
      expect(result.success).toBe(true);
    });

    it('should reject team with no members', () => {
      const invalidTeam = {
        members: [],
      };

      const result = preceptorTeamInputSchema.safeParse(invalidTeam);
      expect(result.success).toBe(false);
    });

    it('should reject duplicate priorities', () => {
      const invalidTeam = {
        members: [
          { preceptorId: 'prec-1', priority: 1 },
          { preceptorId: 'prec-2', priority: 1 }, // Duplicate priority
        ],
      };

      const result = preceptorTeamInputSchema.safeParse(invalidTeam);
      expect(result.success).toBe(false);
    });

    it('should reject duplicate preceptors', () => {
      const invalidTeam = {
        members: [
          { preceptorId: 'prec-1', priority: 1 },
          { preceptorId: 'prec-1', priority: 2 }, // Duplicate preceptor
        ],
      };

      const result = preceptorTeamInputSchema.safeParse(invalidTeam);
      expect(result.success).toBe(false);
    });

    it('should apply default values', () => {
      const minimalTeam = {
        members: [
          { preceptorId: 'prec-1', priority: 1 },
          { preceptorId: 'prec-2', priority: 2 },
        ],
      };

      const result = preceptorTeamInputSchema.safeParse(minimalTeam);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requireSameHealthSystem).toBe(false);
        expect(result.data.requireSameSite).toBe(false);
        expect(result.data.requireSameSpecialty).toBe(false);
        expect(result.data.requiresAdminApproval).toBe(false);
      }
    });

    it('should allow optional name', () => {
      const validTeam = {
        members: [
          { preceptorId: 'prec-1', priority: 1 },
          { preceptorId: 'prec-2', priority: 2 },
        ],
      };

      const result = preceptorTeamInputSchema.safeParse(validTeam);
      expect(result.success).toBe(true);
    });
  });

  describe('preceptorFallbackInputSchema', () => {
    it('should validate fallback configuration', () => {
      const validFallback = {
        primaryPreceptorId: 'prec-1',
        fallbackPreceptorId: 'prec-2',
        clerkshipId: 'clerkship-1',
        priority: 1,
        requiresApproval: false,
        allowDifferentHealthSystem: false,
      };

      const result = preceptorFallbackInputSchema.safeParse(validFallback);
      expect(result.success).toBe(true);
    });

    it('should reject same primary and fallback preceptor', () => {
      const invalidFallback = {
        primaryPreceptorId: 'prec-1',
        fallbackPreceptorId: 'prec-1', // Same as primary
        priority: 1,
      };

      const result = preceptorFallbackInputSchema.safeParse(invalidFallback);
      expect(result.success).toBe(false);
    });

    it('should allow optional clerkship ID (global fallback)', () => {
      const validFallback = {
        primaryPreceptorId: 'prec-1',
        fallbackPreceptorId: 'prec-2',
        priority: 1,
      };

      const result = preceptorFallbackInputSchema.safeParse(validFallback);
      expect(result.success).toBe(true);
    });

    it('should reject priority less than 1', () => {
      const invalidFallback = {
        primaryPreceptorId: 'prec-1',
        fallbackPreceptorId: 'prec-2',
        priority: 0,
      };

      const result = preceptorFallbackInputSchema.safeParse(invalidFallback);
      expect(result.success).toBe(false);
    });

    it('should apply default values', () => {
      const minimalFallback = {
        primaryPreceptorId: 'prec-1',
        fallbackPreceptorId: 'prec-2',
        priority: 1,
      };

      const result = preceptorFallbackInputSchema.safeParse(minimalFallback);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requiresApproval).toBe(false);
        expect(result.data.allowDifferentHealthSystem).toBe(false);
      }
    });
  });
});
