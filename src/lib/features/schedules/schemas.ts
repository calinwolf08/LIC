/**
 * Schedule Assignments - Validation Schemas
 *
 * Zod schemas for schedule assignment validation
 */

import { z } from 'zod';
import { cuid2Schema, dateStringSchema } from '$lib/validation/common-schemas';

/**
 * Schema for creating a new assignment
 */
export const createAssignmentSchema = z.object({
	student_id: cuid2Schema,
	preceptor_id: cuid2Schema,
	clerkship_id: cuid2Schema,
	date: dateStringSchema,
	status: z.string().optional().default('scheduled')
});

/**
 * Schema for updating an existing assignment
 */
export const updateAssignmentSchema = z
	.object({
		student_id: cuid2Schema.optional(),
		preceptor_id: cuid2Schema.optional(),
		clerkship_id: cuid2Schema.optional(),
		date: dateStringSchema.optional(),
		status: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for bulk creating assignments
 */
export const bulkAssignmentSchema = z.object({
	assignments: z.array(createAssignmentSchema)
});

/**
 * Schema for validating assignment ID
 */
export const assignmentIdSchema = z.object({
	id: cuid2Schema
});

/**
 * Schema for filtering assignments
 */
export const assignmentFiltersSchema = z.object({
	student_id: cuid2Schema.optional(),
	preceptor_id: cuid2Schema.optional(),
	clerkship_id: cuid2Schema.optional(),
	start_date: dateStringSchema.optional(),
	end_date: dateStringSchema.optional()
});

/**
 * Type exports
 */
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>;
export type AssignmentIdInput = z.infer<typeof assignmentIdSchema>;
export type AssignmentFilters = z.infer<typeof assignmentFiltersSchema>;
