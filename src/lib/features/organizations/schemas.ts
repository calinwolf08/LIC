import { z } from 'zod';

/** The organization (program) name a user gives at sign-up or onboarding. */
export const organizationNameSchema = z
	.string({ required_error: 'Organization name is required' })
	.trim()
	.min(2, 'Organization name must be at least 2 characters')
	.max(100, 'Organization name must be at most 100 characters');

export const createOrganizationSchema = z.object({
	name: organizationNameSchema
});
