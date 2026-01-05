/**
 * Requirements Validation Schemas
 *
 * Zod schemas for validating clerkship requirement configurations.
 */

import { z } from 'zod';

/**
 * Requirement Input Schema
 *
 * Validates requirement configuration with override mode and override values.
 */
export const requirementInputSchema = z.object({
  clerkshipId: z.string().min(1, 'Clerkship ID is required'),
  requirementType: z.enum(['outpatient', 'inpatient', 'elective'], {
    errorMap: () => ({ message: 'Invalid requirement type' }),
  }),
  requiredDays: z.number().int().positive({
    message: 'Required days must be a positive integer',
  }),
  overrideMode: z.enum(['inherit', 'override_fields', 'override_section'], {
    errorMap: () => ({ message: 'Invalid override mode' }),
  }),

  // Override fields - only validated if overrideMode != 'inherit'
  overrideAssignmentStrategy: z.enum(['team_continuity', 'continuous_single', 'continuous_team', 'block_based', 'daily_rotation']).optional(),
  overrideHealthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference']).optional(),
  overrideMaxStudentsPerDay: z.number().int().positive().optional(),
  overrideMaxStudentsPerYear: z.number().int().positive().optional(),
  overrideMaxStudentsPerBlock: z.number().int().positive().optional(),
  overrideMaxBlocksPerYear: z.number().int().positive().optional(),
  overrideBlockSizeDays: z.number().int().positive().optional(),
  overrideAllowPartialBlocks: z.boolean().optional(),
  overridePreferContinuousBlocks: z.boolean().optional(),
  overrideAllowTeams: z.boolean().optional(),
  overrideAllowFallbacks: z.boolean().optional(),
  overrideFallbackRequiresApproval: z.boolean().optional(),
  overrideFallbackAllowCrossSystem: z.boolean().optional(),
}).refine(
  (data) => {
    // If override_section mode, required override fields must be provided
    if (data.overrideMode === 'override_section') {
      return data.overrideAssignmentStrategy !== undefined &&
             data.overrideHealthSystemRule !== undefined;
    }
    return true;
  },
  {
    message: 'Assignment strategy and health system rule are required when override mode is override_section',
    path: ['overrideAssignmentStrategy'],
  }
).refine(
  (data) => {
    // If override_fields mode, at least one field should be overridden
    if (data.overrideMode === 'override_fields') {
      const hasOverride =
        data.overrideAssignmentStrategy !== undefined ||
        data.overrideHealthSystemRule !== undefined ||
        data.overrideMaxStudentsPerDay !== undefined ||
        data.overrideMaxStudentsPerYear !== undefined ||
        data.overrideMaxStudentsPerBlock !== undefined ||
        data.overrideMaxBlocksPerYear !== undefined ||
        data.overrideBlockSizeDays !== undefined ||
        data.overrideAllowPartialBlocks !== undefined ||
        data.overridePreferContinuousBlocks !== undefined ||
        data.overrideAllowTeams !== undefined ||
        data.overrideAllowFallbacks !== undefined ||
        data.overrideFallbackRequiresApproval !== undefined ||
        data.overrideFallbackAllowCrossSystem !== undefined;
      return hasOverride;
    }
    return true;
  },
  {
    message: 'At least one field must be overridden when override mode is override_fields',
    path: ['overrideMode'],
  }
).refine(
  (data) => {
    // Capacity validation
    if (data.overrideMaxStudentsPerDay !== undefined &&
        data.overrideMaxStudentsPerYear !== undefined) {
      return data.overrideMaxStudentsPerYear >= data.overrideMaxStudentsPerDay;
    }
    return true;
  },
  {
    message: 'Max students per year must be greater than or equal to max students per day',
    path: ['overrideMaxStudentsPerYear'],
  }
).refine(
  (data) => {
    // Block size validation for block-based strategy
    if (data.overrideAssignmentStrategy === 'block_based' && !data.overrideBlockSizeDays) {
      return false;
    }
    return true;
  },
  {
    message: 'Block size days required when using block-based assignment strategy',
    path: ['overrideBlockSizeDays'],
  }
);

/**
 * Clerkship Requirement Schema (full database record)
 */
export const clerkshipRequirementSchema = z.object({
  requirementType: z.enum(['outpatient', 'inpatient', 'elective']),
  requiredDays: z.number().int().positive(),
  overrideMode: z.enum(['inherit', 'override_fields', 'override_section']),
  overrideAssignmentStrategy: z.enum(['team_continuity', 'continuous_single', 'continuous_team', 'block_based', 'daily_rotation']).optional(),
  overrideHealthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference']).optional(),
  overrideMaxStudentsPerDay: z.number().int().positive().optional(),
  overrideMaxStudentsPerYear: z.number().int().positive().optional(),
  overrideMaxStudentsPerBlock: z.number().int().positive().optional(),
  overrideMaxBlocksPerYear: z.number().int().positive().optional(),
  overrideBlockSizeDays: z.number().int().positive().optional(),
  overrideAllowPartialBlocks: z.boolean().optional(),
  overridePreferContinuousBlocks: z.boolean().optional(),
  overrideAllowTeams: z.boolean().optional(),
  overrideAllowFallbacks: z.boolean().optional(),
  overrideFallbackRequiresApproval: z.boolean().optional(),
  overrideFallbackAllowCrossSystem: z.boolean().optional(),
  id: z.string(),
  clerkshipId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Field Override Input Schema
 */
export const fieldOverrideInputSchema = z.object({
  fieldName: z.string().min(1, 'Field name is required'),
  value: z.unknown(),
});

/**
 * Apply Defaults Change Input Schema
 */
export const applyDefaultsChangeInputSchema = z.object({
  defaultType: z.enum(['outpatient', 'inpatient', 'elective'], {
    errorMap: () => ({ message: 'Invalid default type' }),
  }),
  applyScope: z.enum(['all_existing', 'new_only'], {
    errorMap: () => ({ message: 'Invalid apply scope' }),
  }),
});

/**
 * Clerkship Elective Schema
 */
export const clerkshipElectiveInputSchema = z.object({
  name: z.string().min(1, 'Elective name is required').max(200),
  minimumDays: z.number().int().positive({
    message: 'Minimum days must be a positive integer',
  }),
  isRequired: z.boolean().default(true),
  specialty: z.string().max(200).nullable().optional(),
  siteIds: z.array(z.string()).optional(),
  preceptorIds: z.array(z.string()).optional(),
});

export const clerkshipElectiveUpdateSchema = clerkshipElectiveInputSchema.partial();

export const clerkshipElectiveSchema = clerkshipElectiveInputSchema.extend({
  id: z.string(),
  requirementId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Type inference helpers
 */
export type RequirementInput = z.infer<typeof requirementInputSchema>;
export type FieldOverrideInput = z.infer<typeof fieldOverrideInputSchema>;
export type ApplyDefaultsChangeInput = z.infer<typeof applyDefaultsChangeInputSchema>;
export type ClerkshipElectiveInput = z.input<typeof clerkshipElectiveInputSchema>;
export type ClerkshipElectiveUpdateInput = z.input<typeof clerkshipElectiveUpdateSchema>;
