/**
 * Clerkship Validation Schemas
 *
 * Zod schemas for validating clerkship data
 */

import { z } from 'zod';
import { nameSchema, cuid2Schema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Clerkship type validation schema
 */
export const clerkshipTypeSchema = z.enum(['inpatient', 'outpatient'], {
	errorMap: () => ({ message: 'Clerkship type must be either inpatient or outpatient' })
});

/**
 * Required days validation schema
 */
export const requiredDaysSchema = positiveIntSchema;

/**
 * Schema for creating a new clerkship
 */
export const createClerkshipSchema = z
	.object({
		name: nameSchema,
		clerkship_type: clerkshipTypeSchema,
		required_days: requiredDaysSchema,
		// Allowable-miss floor (E2). Null/absent = full required_days is the target.
		min_required_days: z.number().int().min(1).nullish(),
		description: z.string().optional()
	})
	.refine((d) => d.min_required_days == null || d.min_required_days <= d.required_days, {
		message: 'Minimum required days cannot exceed required days',
		path: ['min_required_days']
	});

/**
 * Schema for updating an existing clerkship
 */
export const updateClerkshipSchema = z
	.object({
		name: nameSchema.optional(),
		clerkship_type: clerkshipTypeSchema.optional(),
		required_days: requiredDaysSchema.optional(),
		// Allowable-miss floor (E2). Null clears it. When both are in the same
		// payload they are cross-checked here; a min-only update is checked against
		// the stored required_days in the service.
		min_required_days: z.number().int().min(1).nullish(),
		description: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	})
	.refine(
		(d) =>
			d.min_required_days == null ||
			d.required_days === undefined ||
			d.min_required_days <= d.required_days,
		{ message: 'Minimum required days cannot exceed required days', path: ['min_required_days'] }
	);

/**
 * Schema for validating clerkship ID
 */
export const clerkshipIdSchema = z.object({
	id: cuid2Schema
});

// Export inferred types
export type CreateClerkshipInput = z.infer<typeof createClerkshipSchema>;
export type UpdateClerkshipInput = z.infer<typeof updateClerkshipSchema>;
export type ClerkshipIdInput = z.infer<typeof clerkshipIdSchema>;
