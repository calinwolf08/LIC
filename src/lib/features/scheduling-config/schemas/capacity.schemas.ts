/**
 * Capacity Rules Validation Schemas
 *
 * Zod schemas for validating preceptor capacity configurations.
 */

import { z } from 'zod';

/**
 * Preceptor Capacity Rule Input Schema
 */
export const preceptorCapacityRuleInputSchema = z.object({
  preceptorId: z.string().min(1, 'Preceptor ID is required'),
  clerkshipId: z.string().optional(),
  requirementType: z.enum(['outpatient', 'inpatient', 'elective']).optional(),
  maxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  maxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  maxStudentsPerBlock: z.number().int().positive().optional(),
  maxBlocksPerYear: z.number().int().positive().optional(),
}).refine(
  (data) => data.maxStudentsPerYear >= data.maxStudentsPerDay,
  {
    message: 'Max students per year must be greater than or equal to max students per day',
    path: ['maxStudentsPerYear'],
  }
).refine(
  (data) => {
    // If max students per block is specified, max blocks per year should also be specified
    if (data.maxStudentsPerBlock !== undefined && data.maxBlocksPerYear === undefined) {
      return false;
    }
    if (data.maxBlocksPerYear !== undefined && data.maxStudentsPerBlock === undefined) {
      return false;
    }
    return true;
  },
  {
    message: 'Both max students per block and max blocks per year must be specified together',
    path: ['maxBlocksPerYear'],
  }
);

/**
 * Preceptor Capacity Rule Schema (full database record)
 */
export const preceptorCapacityRuleSchema = z.object({
  preceptorId: z.string().min(1, 'Preceptor ID is required'),
  clerkshipId: z.string().optional(),
  requirementType: z.enum(['outpatient', 'inpatient', 'elective']).optional(),
  maxStudentsPerDay: z.number().int().positive({
    message: 'Max students per day must be a positive integer',
  }),
  maxStudentsPerYear: z.number().int().positive({
    message: 'Max students per year must be a positive integer',
  }),
  maxStudentsPerBlock: z.number().int().positive().optional(),
  maxBlocksPerYear: z.number().int().positive().optional(),
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Type inference helpers
 */
export type PreceptorCapacityRuleInput = z.infer<typeof preceptorCapacityRuleInputSchema>;
