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
 * CUID2 validation schema (for database IDs)
 * CUID2s are 24 character strings that start with a letter
 */
export const cuid2Schema = z.string().min(20).max(30, {
	message: 'Invalid ID format'
});

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
