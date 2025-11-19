/**
 * Health Systems and Sites Validation Schemas
 *
 * Zod schemas for validating health systems and clinical sites.
 */

import { z } from 'zod';

/**
 * Health System Input Schema
 */
export const healthSystemInputSchema = z.object({
  name: z.string().min(1, 'Health system name is required'),
  location: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Health System Schema (full database record)
 */
export const healthSystemSchema = healthSystemInputSchema.extend({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Site Input Schema (for API - healthSystemId provided separately)
 */
export const siteInputSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  address: z.string().optional(),
});

/**
 * Site Validation Schema (includes healthSystemId)
 */
export const siteValidationSchema = z.object({
  healthSystemId: z.string().min(1, 'Health system ID is required'),
  name: z.string().min(1, 'Site name is required'),
  address: z.string().optional(),
});

/**
 * Site Schema (full database record)
 */
export const siteSchema = siteValidationSchema.extend({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Type inference helpers
 */
export type HealthSystemInput = z.infer<typeof healthSystemInputSchema>;
export type SiteInput = z.infer<typeof siteInputSchema>;
