// @ts-nocheck
/**
 * Preceptor Availability Schema Tests
 *
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
	createAvailabilitySchema,
	updateAvailabilitySchema,
	dateRangeSchema,
	bulkAvailabilitySchema
} from './availability-schemas';

describe('createAvailabilitySchema', () => {
	it('validates valid input', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires preceptor_id', () => {
		const invalidInput = {
			date: '2024-01-15',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires date', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires is_available', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15'
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates UUID format for preceptor_id', () => {
		const invalidInput = {
			preceptor_id: 'not-a-uuid',
			date: '2024-01-15',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates date format', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: 'invalid-date',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts is_available as 0', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15',
			is_available: 0
		};

		const result = createAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts is_available as 1', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15',
			is_available: 1
		};

		const result = createAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects is_available greater than 1', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15',
			is_available: 2
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects negative is_available', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			date: '2024-01-15',
			is_available: -1
		};

		const result = createAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('updateAvailabilitySchema', () => {
	it('allows optional date', () => {
		const validInput = {
			date: '2024-01-16'
		};

		const result = updateAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows optional is_available', () => {
		const validInput = {
			is_available: 0
		};

		const result = updateAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows both fields', () => {
		const validInput = {
			date: '2024-01-16',
			is_available: 1
		};

		const result = updateAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows empty object', () => {
		const validInput = {};

		const result = updateAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates date format when provided', () => {
		const invalidInput = {
			date: 'invalid-date'
		};

		const result = updateAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates is_available range when provided', () => {
		const invalidInput = {
			is_available: 2
		};

		const result = updateAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('dateRangeSchema', () => {
	it('validates valid date range', () => {
		const validInput = {
			start_date: '2024-01-01',
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires start_date', () => {
		const invalidInput = {
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires end_date', () => {
		const invalidInput = {
			start_date: '2024-01-01'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('allows same start and end date', () => {
		const validInput = {
			start_date: '2024-01-15',
			end_date: '2024-01-15'
		};

		const result = dateRangeSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects end_date before start_date', () => {
		const invalidInput = {
			start_date: '2024-01-31',
			end_date: '2024-01-01'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('start_date must be before or equal to end_date');
		}
	});

	it('validates date formats', () => {
		const invalidInput = {
			start_date: 'invalid-date',
			end_date: '2024-01-31'
		};

		const result = dateRangeSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('bulkAvailabilitySchema', () => {
	it('validates valid bulk input', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: [
				{ date: '2024-01-01', is_available: true },
				{ date: '2024-01-02', is_available: false }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires preceptor_id', () => {
		const invalidInput = {
			availability: [
				{ date: '2024-01-01', is_available: true }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires availability array', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
		};

		const result = bulkAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts empty availability array', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: []
		};

		const result = bulkAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates each availability entry', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: [
				{ date: 'invalid-date', is_available: true }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires date in each availability entry', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: [
				{ is_available: true }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires is_available in each entry', () => {
		const invalidInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: [
				{ date: '2024-01-01' }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts boolean is_available in bulk entries', () => {
		const validInput = {
			preceptor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
			availability: [
				{ date: '2024-01-01', is_available: true },
				{ date: '2024-01-02', is_available: false }
			]
		};

		const result = bulkAvailabilitySchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.availability[0].is_available).toBe(true);
			expect(result.data.availability[1].is_available).toBe(false);
		}
	});
});
