/**
 * Clerkship Validation Schemas
 *
 * Zod schemas for validating clerkship data
 */

import { z } from 'zod';
import { nameSchema, uuidSchema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Specialty validation schema
 */
export const specialtySchema = z.string().min(1, {
	message: 'Specialty is required'
});

/**
 * Schema for creating a new clerkship
 */
export const createClerkshipSchema = z.object({
	name: nameSchema,
	specialty: specialtySchema,
	required_days: positiveIntSchema,
	description: z.string().optional()
});

/**
 * Schema for updating an existing clerkship
 */
export const updateClerkshipSchema = z
	.object({
		name: nameSchema.optional(),
		specialty: specialtySchema.optional(),
		required_days: positiveIntSchema.optional(),
		description: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for validating clerkship ID
 */
export const clerkshipIdSchema = z.object({
	id: uuidSchema
});

// Export inferred types
export type CreateClerkshipInput = z.infer<typeof createClerkshipSchema>;
export type UpdateClerkshipInput = z.infer<typeof updateClerkshipSchema>;
export type ClerkshipIdInput = z.infer<typeof clerkshipIdSchema>;
