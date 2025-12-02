// @ts-nocheck
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
			max_students: 2
		};

		const result = createPreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Dr. Smith');
			expect(result.data.email).toBe('smith@example.com');
			expect(result.data.max_students).toBe(2);
		}
	});

	it('validates with phone number', () => {
		const validInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			phone: '123-456-7890'
		};

		const result = createPreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with health_system_id', () => {
		const validInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			health_system_id: 'clq1234567890123456789'
		};

		const result = createPreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with site_ids array', () => {
		const validInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
			site_ids: ['clq1234567890123456789', 'clq9876543210987654321']
		};

		const result = createPreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires name', () => {
		const invalidInput = {
			email: 'smith@example.com'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('requires email', () => {
		const invalidInput = {
			name: 'Dr. Smith'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('email');
		}
	});

	it('validates email format', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'not-an-email'
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
			email: 'smith@example.com'
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toContain('name');
		}
	});

	it('defaults max_students to 1 if not provided', () => {
		const input = {
			name: 'Dr. Smith',
			email: 'smith@example.com'
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
			max_students: -1
		};

		const result = createPreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_students', () => {
		const invalidInput = {
			name: 'Dr. Smith',
			email: 'smith@example.com',
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

	it('allows optional phone', () => {
		const validInput = {
			phone: '123-456-7890'
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
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
			max_students: 3
		};

		const result = updatePreceptorSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('Dr. Johnson');
			expect(result.data.email).toBe('johnson@example.com');
			expect(result.data.max_students).toBe(3);
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

	it('validates max_students when provided', () => {
		const invalidInput = {
			max_students: -1
		};

		const result = updatePreceptorSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('preceptorIdSchema', () => {
	it('validates CUID2 format', () => {
		const validInput = {
			id: 'clq1234567890123456789'
		};

		const result = preceptorIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid CUID2 format', () => {
		const invalidInput = {
			id: 'not-a-cuid'
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
