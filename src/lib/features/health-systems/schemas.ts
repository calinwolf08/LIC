import { z } from 'zod';
import { cuid2Schema } from '$lib/validation/common-schemas';

/**
 * Schema for creating a new health system
 */
export const createHealthSystemSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters').max(200, 'Name is too long'),
	location: z
		.string()
		.max(200, 'Location is too long')
		.transform((val) => (val === '' ? undefined : val))
		.optional(),
	description: z
		.string()
		.max(1000, 'Description is too long')
		.transform((val) => (val === '' ? undefined : val))
		.optional()
});

/**
 * Schema for updating an existing health system
 */
export const updateHealthSystemSchema = z
	.object({
		name: z.string().min(2, 'Name must be at least 2 characters').max(200, 'Name is too long').optional(),
		location: z
			.string()
			.max(200, 'Location is too long')
			.transform((val) => (val === '' ? undefined : val))
			.optional(),
		description: z
			.string()
			.max(1000, 'Description is too long')
			.transform((val) => (val === '' ? undefined : val))
			.optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for health system ID parameter
 */
export const healthSystemIdSchema = z.object({
	id: cuid2Schema
});

/**
 * Type exports for use in other files
 */
export type CreateHealthSystemInput = z.infer<typeof createHealthSystemSchema>;
export type UpdateHealthSystemInput = z.infer<typeof updateHealthSystemSchema>;
export type HealthSystemIdInput = z.infer<typeof healthSystemIdSchema>;
