import { z } from 'zod';
import { cuid2Schema, uuidSchema } from '$lib/validation/common-schemas';

/**
 * Phone schema for validation
 */
const phoneSchema = z
	.string()
	.regex(/^[\d\s\-\(\)\+\.]+$/, 'Invalid phone number format')
	.min(10, 'Phone number must be at least 10 digits')
	.max(20, 'Phone number too long')
	.transform((val) => (val === '' ? undefined : val))
	.optional();

/**
 * Email schema for validation
 */
const emailSchema = z
	.string()
	.email('Invalid email address')
	.transform((val) => (val === '' ? undefined : val))
	.optional();

/**
 * Schema for creating a new site
 */
export const createSiteSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
	health_system_id: cuid2Schema.optional(),
	address: z
		.string()
		.max(500, 'Address is too long')
		.transform((val) => (val === '' ? undefined : val))
		.optional(),
	office_phone: phoneSchema,
	contact_person: z
		.string()
		.max(200, 'Name is too long')
		.transform((val) => (val === '' ? undefined : val))
		.optional(),
	contact_email: emailSchema
});

/**
 * Schema for updating an existing site
 */
export const updateSiteSchema = z
	.object({
		name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long').optional(),
		health_system_id: cuid2Schema.optional(),
		address: z
			.string()
			.max(500, 'Address is too long')
			.transform((val) => (val === '' ? undefined : val))
			.optional(),
		office_phone: phoneSchema,
		contact_person: z
			.string()
			.max(200, 'Name is too long')
			.transform((val) => (val === '' ? undefined : val))
			.optional(),
		contact_email: emailSchema
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for update'
	});

/**
 * Schema for site ID parameter
 */
export const siteIdSchema = z.object({
	id: cuid2Schema
});

/**
 * Schema for clerkship-site association
 */
export const clerkshipSiteSchema = z.object({
	clerkship_id: uuidSchema, // Clerkships use crypto.randomUUID()
	site_id: cuid2Schema // Sites use nanoid()
});

/**
 * Schema for site-elective association
 */
export const siteElectiveSchema = z.object({
	site_id: cuid2Schema,
	elective_requirement_id: cuid2Schema
});

/**
 * Schema for site capacity rule
 */
export const siteCapacityRuleSchema = z.object({
	site_id: z.string().uuid('Invalid site ID'),
	clerkship_id: z.string().uuid('Invalid clerkship ID').optional().nullable(),
	requirement_type: z.enum(['inpatient', 'outpatient', 'elective']).optional().nullable(),
	max_students_per_day: z.number().int().positive('Must be a positive number'),
	max_students_per_year: z.number().int().positive('Must be a positive number').optional().nullable(),
	max_students_per_block: z.number().int().positive('Must be a positive number').optional().nullable(),
	max_blocks_per_year: z.number().int().positive('Must be a positive number').optional().nullable()
});

/**
 * Type exports for use in other files
 */
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type SiteIdInput = z.infer<typeof siteIdSchema>;
export type ClerkshipSiteInput = z.infer<typeof clerkshipSiteSchema>;
export type SiteElectiveInput = z.infer<typeof siteElectiveSchema>;
export type SiteCapacityRuleInput = z.infer<typeof siteCapacityRuleSchema>;
