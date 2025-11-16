/**
 * Preceptor Schema Tests
 *
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import { createPreceptorSchema, updatePreceptorSchema, preceptorIdSchema } from './schemas';

describe('createPreceptorSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 2
		};

		const result = createPreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validInput);
		}
	});

	it('requires name', () => {
		const invalidInput = {
			email: 'smith@example.com',
			specialty: 'Family Medicine'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('requires email', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			specialty: 'Family Medicine'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('requires specialty', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('specialty');
		}
	});

	it('validates email format', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'not-an-email',
			specialty: 'Family Medicine'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates name length (min 2 chars)', () => {
		const invalidInput = {
			name: 'D',
			email: 'smith@example.com',
			specialty: 'Family Medicine'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('rejects empty specialty', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: ''
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('specialty');
		}
	});

	it('defaults max_students to 1 if not provided', () => {
		const input = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine'
		};

		const result = createPreceptorSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.max_students).toBe(1);
		}
	});

	it('accepts valid max_students', () => {
		const input = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 5
		};

		const result = createPreceptorSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.max_students).toBe(5);
		}
	});

	it('rejects negative max_students', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: -1
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_students', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 0
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('updatePreceptorSchema', () => {
	it('allows optional name', () => {
		const validInput = {
			name: 'Dr. Johnson'
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Dr. Johnson');
		}
	});

	it('allows optional email', () => {
		const validInput = {
			email: 'johnson@example.com'
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBe('johnson@example.com');
		}
	});

	it('allows optional specialty', () => {
		const validInput = {
			specialty: 'Internal Medicine'
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.specialty).toBe('Internal Medicine');
		}
	});

	it('allows optional max_students', () => {
		const validInput = {
			max_students: 3
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.max_students).toBe(3);
		}
	});

	it('allows multiple fields', () => {
		const validInput = {
			name: 'Dr. Johnson',
			email: 'johnson@example.com',
			specialty: 'Internal Medicine',
			max_students: 3
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validInput);
		}
	});

	it('requires at least one field', () => {
		const invalidInput = {};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('At least one field');
		}
	});

	it('rejects empty object', () => {
		const invalidInput = {};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates email format when provided', () => {
		const invalidInput = {
			email: 'invalid-email'
		};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates name length when provided', () => {
		const invalidInput = {
			name: 'D'
		};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('validates specialty when provided', () => {
		const invalidInput = {
			specialty: ''
		};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('specialty');
		}
	});

	it('validates max_students when provided', () => {
		const invalidInput = {
			max_students: -1
		};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('preceptorIdSchema', () => {
	it('validates UUID format', () => {
		const validInput = {
			id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
		};

		const result = preceptorIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID format', () => {
		const invalidInput = {
			id: 'not-a-uuid'
		};

		const result = preceptorIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('id');
		}
	});

	it('requires id field', () => {
		const invalidInput = {};

		const result = preceptorIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});
