/**
 * Blackout Dates - Validation Schemas
 *
 * Zod schemas for blackout date validation
 */

import { z } from 'zod';
import { uuidSchema, dateStringSchema } from '$lib/validation/common-schemas';

/**
 * Schema for creating a new blackout date
 */
export const createBlackoutDateSchema = z.object({
	date: dateStringSchema,
	reason: z.string().min(1, { message: 'Reason is required' }).optional()
});

/**
 * Schema for validating blackout date ID
 */
export const blackoutDateIdSchema = z.object({
	id: uuidSchema
});

/**
 * Schema for date range filtering
 */
export const dateRangeSchema = z.object({
	start_date: dateStringSchema.optional(),
	end_date: dateStringSchema.optional()
});

/**
 * Type exports
 */
export type CreateBlackoutDateInput = z.infer<typeof createBlackoutDateSchema>;
export type BlackoutDateIdInput = z.infer<typeof blackoutDateIdSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
