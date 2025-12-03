/**
 * Common Zod Schemas
 *
 * Reusable validation schemas used across the application
 */

import { z } from 'zod';

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid({
	message: 'Invalid UUID format'
});

/**
 * ID validation schema (for database IDs)
 * Accepts multiple ID formats used in the application:
 * - UUIDs (36 chars with dashes): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - CUID2s (20-30 chars starting with letter): clxxxxxxxxxxxxxxxxxx
 * - Nanoids (21 chars using A-Za-z0-9_-): can start with any character
 */
export const cuid2Schema = z.string().refine(
	(val) => {
		// Accept UUIDs (36 chars with format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		// Accept CUID2s (20-30 chars starting with letter, alphanumeric only)
		const cuid2Regex = /^[a-z][a-z0-9]{19,29}$/i;
		// Accept Nanoids (default 21 chars using A-Za-z0-9_-)
		const nanoidRegex = /^[A-Za-z0-9_-]{21}$/;
		return uuidRegex.test(val) || cuid2Regex.test(val) || nanoidRegex.test(val);
	},
	{ message: 'Invalid ID format' }
);

/**
 * Email validation schema
 */
export const emailSchema = z.string().email({
	message: 'Invalid email address'
});

/**
 * ISO date string validation (YYYY-MM-DD)
 */
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
	message: 'Invalid date format. Use YYYY-MM-DD'
});

/**
 * Positive integer validation
 */
export const positiveIntSchema = z.number().int().positive({
	message: 'Must be a positive integer'
});

/**
 * Name validation (min 2 characters)
 */
export const nameSchema = z.string().min(2, {
	message: 'Name must be at least 2 characters'
});
