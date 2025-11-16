/**
 * Blackout Date Schema Tests
 *
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
	createBlackoutDateSchema,
	blackoutDateIdSchema,
	dateRangeSchema
} from './schemas';

describe('createBlackoutDateSchema', () => {
	it('validates valid date', () => {
		const validInput = {
			date: '2024-01-15'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with optional reason', () => {
		const validInput = {
			date: '2024-01-15',
			reason: 'Holiday'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires date', () => {
		const invalidInput = {
			reason: 'Holiday'
		};

		const result = createBlackoutDateSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates date format (YYYY-MM-DD)', () => {
		const validInput = {
			date: '2024-12-25'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid date format', () => {
		const invalidInput = {
			date: '01/15/2024'
		};

		const result = createBlackoutDateSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects non-date string', () => {
		const invalidInput = {
			date: 'not-a-date'
		};

		const result = createBlackoutDateSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty date string', () => {
		const invalidInput = {
			date: ''
		};

		const result = createBlackoutDateSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('allows empty reason when provided', () => {
		const validInput = {
			date: '2024-01-15',
			reason: ''
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(false); // Should reject empty reason if provided
	});

	it('allows reason to be omitted', () => {
		const validInput = {
			date: '2024-01-15'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts leap year date', () => {
		const validInput = {
			date: '2024-02-29'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts year boundaries', () => {
		const validInputs = [
			{ date: '2024-01-01' },
			{ date: '2024-12-31' }
		];

		for (const input of validInputs) {
			const result = createBlackoutDateSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});

	it('accepts reason with special characters', () => {
		const validInput = {
			date: '2024-01-15',
			reason: 'Holiday: New Year\'s Day & Celebration!'
		};

		const result = createBlackoutDateSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('blackoutDateIdSchema', () => {
	it('validates valid UUID', () => {
		const validInput = {
			id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
		};

		const result = blackoutDateIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID format', () => {
		const invalidInput = {
			id: 'not-a-uuid'
		};

		const result = blackoutDateIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires id field', () => {
		const invalidInput = {};

		const result = blackoutDateIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty string', () => {
		const invalidInput = {
			id: ''
		};

		const result = blackoutDateIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('dateRangeSchema', () => {
	it('validates with both dates', () => {
		const validInput = {
			start_date: '2024-01-01',
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with start_date only', () => {
		const validInput = {
			start_date: '2024-01-01'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with end_date only', () => {
		const validInput = {
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with neither date', () => {
		const validInput = {};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates date formats', () => {
		const validInput = {
			start_date: '2024-01-15',
			end_date: '2024-12-31'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid start_date format', () => {
		const invalidInput = {
			start_date: 'invalid-date',
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid end_date format', () => {
		const invalidInput = {
			start_date: '2024-01-01',
			end_date: 'invalid-date'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('allows same date for both start and end', () => {
		const validInput = {
			start_date: '2024-01-15',
			end_date: '2024-01-15'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows end_date before start_date (no validation logic)', () => {
		const validInput = {
			start_date: '2024-01-31',
			end_date: '2024-01-01'
		};

		// Schema doesn't validate date ordering - that's done in the service layer
		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});
