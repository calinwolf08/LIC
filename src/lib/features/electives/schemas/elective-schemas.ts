/**
 * Validation schemas for elective forms
 */

import { z } from 'zod';

export const electiveFormSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
	specialty: z.string().nullable().optional(),
	minimumDays: z.number().int().min(1, 'Minimum days must be at least 1').max(365, 'Minimum days cannot exceed 365'),
	isRequired: z.boolean().default(false)
});

export type ElectiveFormInput = z.infer<typeof electiveFormSchema>;
