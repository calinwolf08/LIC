/**
 * Preceptor Availability Validation Schemas
 *
 * Zod schemas for validating availability data
 */

import { z } from 'zod';
import { dateStringSchema, cuid2Schema } from '$lib/validation/common-schemas';

/**
 * Schema for creating a new availability period
 */
export const createAvailabilitySchema = z
	.object({
		preceptor_id: cuid2Schema,
		site_id: cuid2Schema,
		date: dateStringSchema,
		is_available: z.number().int().min(0).max(1)
	});

/**
 * Schema for updating availability
 */
export const updateAvailabilitySchema = z.object({
	date: dateStringSchema.optional(),
	is_available: z.number().int().min(0).max(1).optional()
});

/**
 * Schema for date range queries
 */
export const dateRangeSchema = z
	.object({
		start_date: dateStringSchema,
		end_date: dateStringSchema
	})
	.refine((data) => data.start_date <= data.end_date, {
		message: 'start_date must be before or equal to end_date'
	});

/**
 * Schema for bulk availability update
 */
export const bulkAvailabilitySchema = z.object({
	preceptor_id: cuid2Schema,
	site_id: cuid2Schema,
	availability: z.array(
		z.object({
			date: dateStringSchema,
			is_available: z.boolean()
		})
	)
});

// Export inferred types
export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type BulkAvailabilityInput = z.infer<typeof bulkAvailabilitySchema>;
