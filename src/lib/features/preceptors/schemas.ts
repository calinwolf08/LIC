/**
 * Preceptor Validation Schemas
 *
 * Zod schemas for validating preceptor data
 */

import { z } from 'zod';
import { emailSchema, nameSchema, uuidSchema, cuid2Schema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Phone schema for validation
 */
const phoneSchema = z
	.string()
	.transform((val) => (val === '' ? undefined : val))
	.pipe(
		z
			.string()
			.refine(
				(val) => /^[\d\s\-\(\)\+\.]+$/.test(val) && val.length >= 10 && val.length <= 20,
				{ message: 'Invalid phone number format (10-20 digits allowed)' }
			)
			.optional()
	);

/**
 * Optional ID schema that transforms empty strings to undefined
 */
const optionalIdSchema = z
	.string()
	.transform((val) => (val === '' ? undefined : val))
	.pipe(cuid2Schema.optional())
	.optional();

/**
 * Schema for creating a new preceptor
 */
export const createPreceptorSchema = z.object({
	name: nameSchema,
	email: emailSchema,
	phone: phoneSchema.optional(),
	health_system_id: optionalIdSchema,
	site_id: optionalIdSchema,
	max_students: positiveIntSchema.default(1)
});

/**
 * Schema for updating an existing preceptor
 */
export const updatePreceptorSchema = z
	.object({
		name: nameSchema.optional(),
		email: emailSchema.optional(),
		phone: phoneSchema.optional(),
		health_system_id: optionalIdSchema,
		site_id: optionalIdSchema,
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
