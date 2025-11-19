/**
 * Global Defaults Validation Schemas
 *
 * Zod schemas for validating global default configurations.
 */

import { z } from 'zod';

/**
 * Base configuration schema shared across all requirement types (without validation)
 */
const globalDefaultsBaseObject = z.object({
  assignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation'], {
    errorMap: () => ({ message: 'Invalid assignment strategy' }),
  }),
  healthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference'], {
    errorMap: () => ({ message: 'Invalid health system rule' }),
  }),
  defaultMaxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  defaultMaxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  allowTeams: z.boolean().default(false),
  allowFallbacks: z.boolean().default(true),
  fallbackRequiresApproval: z.boolean().default(false),
  fallbackAllowCrossSystem: z.boolean().default(false),
});

/**
 * Base configuration schema with validation
 */
export const globalDefaultsBaseSchema = globalDefaultsBaseObject.refine(
  (data) => data.defaultMaxStudentsPerYear >= data.defaultMaxStudentsPerDay,
  {
    message: 'Max students per year must be greater than or equal to max students per day',
    path: ['defaultMaxStudentsPerYear'],
  }
);

/**
 * Global Outpatient Defaults Schema
 */
export const globalOutpatientDefaultsInputSchema = globalDefaultsBaseObject.extend({
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
}).refine(
  (data) => data.defaultMaxStudentsPerYear >= data.defaultMaxStudentsPerDay,
  {
    message: 'Max students per year must be greater than or equal to max students per day',
    path: ['defaultMaxStudentsPerYear'],
  }
).refine(
  (data) => {
    if (data.teamSizeMin !== undefined && data.teamSizeMax !== undefined) {
      return data.teamSizeMin <= data.teamSizeMax;
    }
    return true;
  },
  {
    message: 'Team size min must be less than or equal to team size max',
    path: ['teamSizeMax'],
  }
);

/**
 * Global Inpatient Defaults Schema
 */
export const globalInpatientDefaultsInputSchema = globalDefaultsBaseObject.extend({
  blockSizeDays: z.number().int().positive().optional(),
  allowPartialBlocks: z.boolean().optional(),
  preferContinuousBlocks: z.boolean().optional(),
  defaultMaxStudentsPerBlock: z.number().int().positive().optional(),
  defaultMaxBlocksPerYear: z.number().int().positive().optional(),
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
}).refine(
  (data) => data.defaultMaxStudentsPerYear >= data.defaultMaxStudentsPerDay,
  {
    message: 'Max students per year must be greater than or equal to max students per day',
    path: ['defaultMaxStudentsPerYear'],
  }
).refine(
  (data) => {
    if (data.teamSizeMin !== undefined && data.teamSizeMax !== undefined) {
      return data.teamSizeMin <= data.teamSizeMax;
    }
    return true;
  },
  {
    message: 'Team size min must be less than or equal to team size max',
    path: ['teamSizeMax'],
  }
).refine(
  (data) => {
    // If block-based strategy, block size should be provided
    if (data.assignmentStrategy === 'block_based' && !data.blockSizeDays) {
      return false;
    }
    return true;
  },
  {
    message: 'Block size days required when using block-based assignment strategy',
    path: ['blockSizeDays'],
  }
);

/**
 * Global Elective Defaults Schema
 */
export const globalElectiveDefaultsInputSchema = globalDefaultsBaseSchema;

/**
 * Database record schema for outpatient defaults (includes ID and timestamps)
 */
export const globalOutpatientDefaultsSchema = z.object({
  assignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation'], {
    errorMap: () => ({ message: 'Invalid assignment strategy' }),
  }),
  healthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference'], {
    errorMap: () => ({ message: 'Invalid health system rule' }),
  }),
  defaultMaxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  defaultMaxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  allowTeams: z.boolean().default(false),
  allowFallbacks: z.boolean().default(true),
  fallbackRequiresApproval: z.boolean().default(false),
  fallbackAllowCrossSystem: z.boolean().default(false),
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
  id: z.string(),
  schoolId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Database record schema for inpatient defaults (includes ID and timestamps)
 */
export const globalInpatientDefaultsSchema = z.object({
  assignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation'], {
    errorMap: () => ({ message: 'Invalid assignment strategy' }),
  }),
  healthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference'], {
    errorMap: () => ({ message: 'Invalid health system rule' }),
  }),
  defaultMaxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  defaultMaxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  allowTeams: z.boolean().default(false),
  allowFallbacks: z.boolean().default(true),
  fallbackRequiresApproval: z.boolean().default(false),
  fallbackAllowCrossSystem: z.boolean().default(false),
  blockSizeDays: z.number().int().positive().optional(),
  allowPartialBlocks: z.boolean().optional(),
  preferContinuousBlocks: z.boolean().optional(),
  defaultMaxStudentsPerBlock: z.number().int().positive().optional(),
  defaultMaxBlocksPerYear: z.number().int().positive().optional(),
  teamSizeMin: z.number().int().positive().optional(),
  teamSizeMax: z.number().int().positive().optional(),
  teamRequireSameHealthSystem: z.boolean().optional(),
  teamRequireSameSpecialty: z.boolean().optional(),
  id: z.string(),
  schoolId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Database record schema for elective defaults (includes ID and timestamps)
 */
export const globalElectiveDefaultsSchema = z.object({
  assignmentStrategy: z.enum(['continuous_single', 'continuous_team', 'block_based', 'daily_rotation'], {
    errorMap: () => ({ message: 'Invalid assignment strategy' }),
  }),
  healthSystemRule: z.enum(['enforce_same_system', 'prefer_same_system', 'no_preference'], {
    errorMap: () => ({ message: 'Invalid health system rule' }),
  }),
  defaultMaxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  defaultMaxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  allowTeams: z.boolean().default(false),
  allowFallbacks: z.boolean().default(true),
  fallbackRequiresApproval: z.boolean().default(false),
  fallbackAllowCrossSystem: z.boolean().default(false),
  id: z.string(),
  schoolId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Type inference helpers
 */
export type GlobalOutpatientDefaultsInput = z.infer<typeof globalOutpatientDefaultsInputSchema>;
export type GlobalInpatientDefaultsInput = z.infer<typeof globalInpatientDefaultsInputSchema>;
export type GlobalElectiveDefaultsInput = z.infer<typeof globalElectiveDefaultsInputSchema>;
