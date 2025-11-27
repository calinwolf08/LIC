import { z } from 'zod';
import { cuid2Schema } from '$lib/validation/common-schemas';

/**
 * Phone schema for validation
 * Only validates if value is provided and not empty
 */
const phoneSchema = z
	.string()
	.transform((val) => (val === '' ? undefined : val))
	.optional()
	.refine(
		(val) => {
			if (!val) return true; // Allow empty/undefined
			return /^[\d\s\-\(\)\+\.]+$/.test(val) && val.length >= 10 && val.length <= 20;
		},
		{ message: 'Invalid phone number format (10-20 digits allowed)' }
	);

/**
 * Email schema for validation
 * Only validates if value is provided and not empty
 */
const emailSchema = z
	.string()
	.transform((val) => (val === '' ? undefined : val))
	.optional()
	.refine(
		(val) => {
			if (!val) return true; // Allow empty/undefined
			// Basic email validation
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
		},
		{ message: 'Invalid email address' }
	);

/**
 * Schema for creating a new site
 */
export const createSiteSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
	health_system_id: z
		.string()
		.transform((val) => (val === '' ? undefined : val))
		.pipe(cuid2Schema.optional()),
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
		health_system_id: z
			.string()
			.transform((val) => (val === '' ? undefined : val))
			.pipe(cuid2Schema.optional()),
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
	clerkship_id: cuid2Schema,
	site_id: cuid2Schema
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
	site_id: cuid2Schema,
	clerkship_id: cuid2Schema.optional().nullable(),
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
