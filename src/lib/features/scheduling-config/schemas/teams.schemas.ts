/**
 * Teams and Fallbacks Validation Schemas
 *
 * Zod schemas for validating team and fallback configurations.
 */

import { z } from 'zod';

/**
 * Preceptor Team Member Input Schema
 */
export const preceptorTeamMemberInputSchema = z.object({
  preceptorId: z.string().min(1, 'Preceptor ID is required'),
  role: z.string().optional(),
  priority: z.number().int().min(1, 'Priority must be at least 1'),
  isFallbackOnly: z.boolean().optional().default(false),
});

/**
 * Preceptor Team Input Schema
 */
export const preceptorTeamInputSchema = z.object({
  name: z.string().optional(),
  requireSameHealthSystem: z.boolean().default(false),
  requireSameSite: z.boolean().default(false),
  requireSameSpecialty: z.boolean().default(false),
  requiresAdminApproval: z.boolean().default(false),
  members: z.array(preceptorTeamMemberInputSchema).min(1, 'Team must have at least 1 member'),
}).refine(
  (data) => {
    // Check for unique priorities
    const priorities = data.members.map((m) => m.priority);
    const uniquePriorities = new Set(priorities);
    return priorities.length === uniquePriorities.size;
  },
  {
    message: 'Team member priorities must be unique',
    path: ['members'],
  }
).refine(
  (data) => {
    // Check for unique preceptor IDs
    const preceptorIds = data.members.map((m) => m.preceptorId);
    const uniqueIds = new Set(preceptorIds);
    return preceptorIds.length === uniqueIds.size;
  },
  {
    message: 'Team members must be unique (no duplicate preceptors)',
    path: ['members'],
  }
).refine(
  (data) => {
    // Check that at least one member is not fallback-only
    const hasPrimaryMember = data.members.some((m) => !m.isFallbackOnly);
    return hasPrimaryMember;
  },
  {
    message: 'Team must have at least one non-fallback (primary) member',
    path: ['members'],
  }
);

/**
 * Preceptor Team Schema (full database record)
 */
export const preceptorTeamSchema = z.object({
  name: z.string().optional(),
  requireSameHealthSystem: z.boolean().default(false),
  requireSameSite: z.boolean().default(false),
  requireSameSpecialty: z.boolean().default(false),
  requiresAdminApproval: z.boolean().default(false),
  members: z.array(preceptorTeamMemberInputSchema).min(1, 'Team must have at least 1 member'),
  id: z.string(),
  clerkshipId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Preceptor Team Member Schema (full database record)
 */
export const preceptorTeamMemberSchema = preceptorTeamMemberInputSchema.extend({
  id: z.string(),
  teamId: z.string(),
  isFallbackOnly: z.boolean().default(false), // Override to ensure it's always present
  createdAt: z.date(),
});

/**
 * Preceptor Fallback Input Schema
 */
export const preceptorFallbackInputSchema = z.object({
  primaryPreceptorId: z.string().min(1, 'Primary preceptor ID is required'),
  fallbackPreceptorId: z.string().min(1, 'Fallback preceptor ID is required'),
  clerkshipId: z.string().optional(),
  priority: z.number().int().min(1, 'Priority must be at least 1'),
  requiresApproval: z.boolean().default(false),
  allowDifferentHealthSystem: z.boolean().default(false),
}).refine(
  (data) => data.primaryPreceptorId !== data.fallbackPreceptorId,
  {
    message: 'Primary and fallback preceptors must be different',
    path: ['fallbackPreceptorId'],
  }
);

/**
 * Preceptor Fallback Schema (full database record)
 */
export const preceptorFallbackSchema = z.object({
  primaryPreceptorId: z.string().min(1, 'Primary preceptor ID is required'),
  fallbackPreceptorId: z.string().min(1, 'Fallback preceptor ID is required'),
  clerkshipId: z.string().optional(),
  priority: z.number().int().min(1, 'Priority must be at least 1'),
  requiresApproval: z.boolean().default(false),
  allowDifferentHealthSystem: z.boolean().default(false),
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Type inference helpers
 *
 * Using z.input for input types allows optional fields with defaults
 * to remain optional in the TypeScript type (before parsing/validation).
 */
export type PreceptorTeamMemberInput = z.input<typeof preceptorTeamMemberInputSchema>;
export type PreceptorTeamInput = z.input<typeof preceptorTeamInputSchema>;
export type PreceptorFallbackInput = z.input<typeof preceptorFallbackInputSchema>;
