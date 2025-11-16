/**
 * Student Schema Tests
 *
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { createStudentSchema, updateStudentSchema, studentIdSchema } from './schemas';

describe('createStudentSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			name: 'John Doe',
			email: 'john@example.com'
		};

		const result = createStudentSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validInput);
		}
	});

	it('requires name', () => {
		const invalidInput = {
			email: 'john@example.com'
		};

		const result = createStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('requires email', () => {
		const invalidInput = {
			name: 'John Doe'
		};

		const result = createStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates email format', () => {
		const invalidInput = {
			name: 'John Doe',
			email: 'not-an-email'
		};

		const result = createStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates name length (min 2 chars)', () => {
		const invalidInput = {
			name: 'J',
			email: 'john@example.com'
		};

		const result = createStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('accepts valid name with 2 characters', () => {
		const validInput = {
			name: 'Jo',
			email: 'jo@example.com'
		};

		const result = createStudentSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('updateStudentSchema', () => {
	it('allows optional name', () => {
		const validInput = {
			name: 'Jane Doe'
		};

		const result = updateStudentSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Jane Doe');
		}
	});

	it('allows optional email', () => {
		const validInput = {
			email: 'jane@example.com'
		};

		const result = updateStudentSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBe('jane@example.com');
		}
	});

	it('allows both name and email', () => {
		const validInput = {
			name: 'Jane Doe',
			email: 'jane@example.com'
		};

		const result = updateStudentSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validInput);
		}
	});

	it('requires at least one field', () => {
		const invalidInput = {};

		const result = updateStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('At least one field');
		}
	});

	it('rejects empty object', () => {
		const invalidInput = {};

		const result = updateStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates email format when provided', () => {
		const invalidInput = {
			email: 'invalid-email'
		};

		const result = updateStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates name length when provided', () => {
		const invalidInput = {
			name: 'J'
		};

		const result = updateStudentSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});
});

describe('studentIdSchema', () => {
	it('validates UUID format', () => {
		const validInput = {
			id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
		};

		const result = studentIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID format', () => {
		const invalidInput = {
			id: 'not-a-uuid'
		};

		const result = studentIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('id');
		}
	});

	it('requires id field', () => {
		const invalidInput = {};

		const result = studentIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});
