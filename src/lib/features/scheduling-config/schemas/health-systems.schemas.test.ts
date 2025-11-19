import { describe, it, expect } from 'vitest';
import {
  healthSystemInputSchema,
  siteInputSchema,
} from './health-systems.schemas';

describe('Health Systems Schemas', () => {
  describe('healthSystemInputSchema', () => {
    it('should validate health system with all fields', () => {
      const validHealthSystem = {
        name: 'Memorial Health System',
        location: 'Downtown',
        description: 'Large urban teaching hospital system',
      };

      const result = healthSystemInputSchema.safeParse(validHealthSystem);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalHealthSystem = {
        name: 'Memorial Health System',
      };

      const result = healthSystemInputSchema.safeParse(minimalHealthSystem);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const invalidHealthSystem = {
        name: '',
        location: 'Downtown',
      };

      const result = healthSystemInputSchema.safeParse(invalidHealthSystem);
      expect(result.success).toBe(false);
    });

    it('should reject missing name', () => {
      const invalidHealthSystem = {
        location: 'Downtown',
        description: 'Test',
      };

      const result = healthSystemInputSchema.safeParse(invalidHealthSystem);
      expect(result.success).toBe(false);
    });

    it('should allow optional location and description', () => {
      const healthSystemWithLocation = {
        name: 'Memorial Health System',
        location: 'Downtown',
      };

      const result1 = healthSystemInputSchema.safeParse(healthSystemWithLocation);
      expect(result1.success).toBe(true);

      const healthSystemWithDescription = {
        name: 'Memorial Health System',
        description: 'Test description',
      };

      const result2 = healthSystemInputSchema.safeParse(healthSystemWithDescription);
      expect(result2.success).toBe(true);
    });
  });

  describe('siteInputSchema', () => {
    it('should validate site with all fields', () => {
      const validSite = {
        healthSystemId: 'hs-1',
        name: 'Memorial Main Hospital',
        address: '123 Health St, Downtown',
      };

      const result = siteInputSchema.safeParse(validSite);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalSite = {
        healthSystemId: 'hs-1',
        name: 'Memorial Main Hospital',
      };

      const result = siteInputSchema.safeParse(minimalSite);
      expect(result.success).toBe(true);
    });

    it('should reject empty health system ID', () => {
      const invalidSite = {
        healthSystemId: '',
        name: 'Memorial Main Hospital',
      };

      const result = siteInputSchema.safeParse(invalidSite);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const invalidSite = {
        healthSystemId: 'hs-1',
        name: '',
      };

      const result = siteInputSchema.safeParse(invalidSite);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidSites = [
        { name: 'Memorial Main Hospital' }, // Missing healthSystemId
        { healthSystemId: 'hs-1' }, // Missing name
        {}, // Missing both
      ];

      invalidSites.forEach(site => {
        const result = siteInputSchema.safeParse(site);
        expect(result.success).toBe(false);
      });
    });

    it('should allow optional address', () => {
      const siteWithAddress = {
        healthSystemId: 'hs-1',
        name: 'Memorial Main Hospital',
        address: '123 Health St',
      };

      const result = siteInputSchema.safeParse(siteWithAddress);
      expect(result.success).toBe(true);
    });
  });
});
