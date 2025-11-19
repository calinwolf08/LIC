/**
 * Clerkship Validation Schemas
 *
 * Zod schemas for validating clerkship data
 */

import { z } from 'zod';
import { nameSchema, uuidSchema, positiveIntSchema } from '$lib/validation/common-schemas';

/**
 * Specialty validation schema (now optional)
 */
export const specialtySchema = z.string().min(1, {
	message: 'Specialty must not be empty if provided'
}).optional();

/**
 * Inpatient days validation schema
 */
export const inpatientDaysSchema = z.number().int().nonnegative({
	message: 'Inpatient days must be a non-negative integer'
}).optional();

/**
 * Outpatient days validation schema
 */
export const outpatientDaysSchema = z.number().int().nonnegative({
	message: 'Outpatient days must be a non-negative integer'
}).optional();

/**
 * Schema for creating a new clerkship
 */
export const createClerkshipSchema = z.object({
	name: nameSchema,
	specialty: specialtySchema,
	inpatient_days: inpatientDaysSchema,
	outpatient_days: outpatientDaysSchema,
	description: z.string().optional()
}).refine(
	(data) => {
		// At least one of inpatient_days or outpatient_days must be greater than 0
		const inpatient = data.inpatient_days ?? 0;
		const outpatient = data.outpatient_days ?? 0;
		return inpatient > 0 || outpatient > 0;
	},
	{
		message: 'At least one of inpatient days or outpatient days must be greater than 0',
		path: ['inpatient_days']
	}
);

/**
 * Schema for updating an existing clerkship
 */
export const updateClerkshipSchema = z
	.object({
		name: nameSchema.optional(),
		specialty: specialtySchema.optional(),
		inpatient_days: inpatientDaysSchema,
		outpatient_days: outpatientDaysSchema,
		description: z.string().optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	})
	.refine(
		(data) => {
			// If both inpatient_days and outpatient_days are provided and both are 0, that's invalid
			if (data.inpatient_days !== undefined && data.outpatient_days !== undefined) {
				return data.inpatient_days > 0 || data.outpatient_days > 0;
			}
			// If only one is provided and it's 0, that's potentially valid (the other might be non-zero)
			return true;
		},
		{
			message: 'At least one of inpatient days or outpatient days must be greater than 0',
			path: ['inpatient_days']
		}
	);

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
