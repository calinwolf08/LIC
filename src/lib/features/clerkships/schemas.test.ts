// @ts-nocheck
/**
 * Clerkship Schema Tests
 *
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
	createClerkshipSchema,
	updateClerkshipSchema,
	clerkshipIdSchema,
	specialtySchema
} from './schemas';

describe('specialtySchema', () => {
	it('validates non-empty string', () => {
		const result = specialtySchema.safeParse('Family Medicine');
		expect(result.success).toBe(true);
	});

	it('rejects empty string', () => {
		const result = specialtySchema.safeParse('');
		expect(result.success).toBe(false);
	});

	it('accepts specialty with spaces and punctuation', () => {
		const result = specialtySchema.safeParse('Obstetrics & Gynecology');
		expect(result.success).toBe(true);
	});
});

describe('createClerkshipSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with optional description', () => {
		const validInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			description: 'Primary care rotation'
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires name', () => {
		const invalidInput = {
			specialty: 'Family Medicine',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires specialty', () => {
		const invalidInput = {
			name: 'Family Medicine Clerkship',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires required_days', () => {
		const invalidInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine'
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty name', () => {
		const invalidInput = {
			name: '',
			specialty: 'Family Medicine',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects name shorter than 2 characters', () => {
		const invalidInput = {
			name: 'A',
			specialty: 'Family Medicine',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts name with exactly 2 characters', () => {
		const validInput = {
			name: 'FM',
			specialty: 'Family Medicine',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects empty specialty', () => {
		const invalidInput = {
			name: 'Family Medicine Clerkship',
			specialty: '',
			required_days: 5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero required_days', () => {
		const invalidInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: 0
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects negative required_days', () => {
		const invalidInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: -5
		};

		const result = createClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts large required_days values', () => {
		const validInput = {
			name: 'Extended Clerkship',
			specialty: 'Surgery',
			required_days: 60
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts empty description', () => {
		const validInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			description: ''
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts long description', () => {
		const validInput = {
			name: 'Family Medicine Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			description: 'A'.repeat(500)
		};

		const result = createClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('updateClerkshipSchema', () => {
	it('allows optional name', () => {
		const validInput = {
			name: 'Updated Clerkship'
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows optional specialty', () => {
		const validInput = {
			specialty: 'Internal Medicine'
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows optional required_days', () => {
		const validInput = {
			required_days: 10
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows optional description', () => {
		const validInput = {
			description: 'Updated description'
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows all fields', () => {
		const validInput = {
			name: 'Updated Clerkship',
			specialty: 'Internal Medicine',
			required_days: 10,
			description: 'Updated description'
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects empty object', () => {
		const invalidInput = {};

		const result = updateClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('At least one field');
		}
	});

	it('validates name format when provided', () => {
		const invalidInput = {
			name: 'A'
		};

		const result = updateClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates specialty format when provided', () => {
		const invalidInput = {
			specialty: ''
		};

		const result = updateClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates required_days when provided', () => {
		const invalidInput = {
			required_days: 0
		};

		const result = updateClerkshipSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('allows partial updates with name only', () => {
		const validInput = {
			name: 'New Name'
		};

		const result = updateClerkshipSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('clerkshipIdSchema', () => {
	it('validates valid UUID', () => {
		const validInput = {
			id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
		};

		const result = clerkshipIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID format', () => {
		const invalidInput = {
			id: 'not-a-uuid'
		};

		const result = clerkshipIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty string', () => {
		const invalidInput = {
			id: ''
		};

		const result = clerkshipIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires id field', () => {
		const invalidInput = {};

		const result = clerkshipIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects UUID with invalid characters', () => {
		const invalidInput = {
			id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380aZZ'
		};

		const result = clerkshipIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});
