/**
 * Preceptor Validation Schemas
 *
 * Zod schemas for validating preceptor data
 */

import { z } from 'zod';
import { emailSchema, nameSchema, uuidSchema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Specialty validation schema
 */
export const specialtySchema = z.string().min(1, {
	message: 'Specialty is required'
});

/**
 * Schema for creating a new preceptor
 */
export const createPreceptorSchema = z.object({
	name: nameSchema,
	email: emailSchema,
	specialty: specialtySchema,
	health_system_id: uuidSchema,
	max_students: positiveIntSchema.default(1)
});

/**
 * Schema for updating an existing preceptor
 */
export const updatePreceptorSchema = z
	.object({
		name: nameSchema.optional(),
		email: emailSchema.optional(),
		specialty: specialtySchema.optional(),
		health_system_id: uuidSchema.optional(),
		max_students: positiveIntSchema.optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for validating preceptor ID
 */
export const preceptorIdSchema = z.object({
	id: uuidSchema
});

// Export inferred types
export type CreatePreceptorInput = z.infer<typeof createPreceptorSchema>;
export type UpdatePreceptorInput = z.infer<typeof updatePreceptorSchema>;
export type PreceptorIdInput = z.infer<typeof preceptorIdSchema>;
