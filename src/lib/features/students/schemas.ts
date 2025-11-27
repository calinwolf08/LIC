/**
 * Student Validation Schemas
 *
 * Zod schemas for validating student data
 */

import { z } from 'zod';
import { emailSchema, nameSchema, cuid2Schema } from '$lib/validation/common-schemas';

/**
 * Schema for creating a new student
 */
export const createStudentSchema = z.object({
	name: nameSchema,
	email: emailSchema
});

/**
 * Schema for updating an existing student
 */
export const updateStudentSchema = z
	.object({
		name: nameSchema.optional(),
		email: emailSchema.optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for validating student ID
 */
export const studentIdSchema = z.object({
	id: cuid2Schema
});

// Export inferred types
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentIdInput = z.infer<typeof studentIdSchema>;
