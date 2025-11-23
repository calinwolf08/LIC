/**
 * Clerkship Validation Schemas
 *
 * Zod schemas for validating clerkship data
 */

import { z } from 'zod';
import { nameSchema, uuidSchema, cuid2Schema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Specialty validation schema (now optional)
 */
export const specialtySchema = z.string().min(1, {
	message: 'Specialty must not be empty if provided'
}).optional();

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
export const createClerkshipSchema = z.object({
	name: nameSchema,
	specialty: specialtySchema,
	clerkship_type: clerkshipTypeSchema,
	required_days: requiredDaysSchema,
	description: z.string().optional()
});

/**
 * Schema for updating an existing clerkship
 */
export const updateClerkshipSchema = z
	.object({
		name: nameSchema.optional(),
		specialty: specialtySchema.optional(),
		clerkship_type: clerkshipTypeSchema.optional(),
		required_days: requiredDaysSchema.optional(),
		description: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

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
