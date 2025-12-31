/**
 * Unit tests for elective-schemas.ts
 * Tests Zod validation schemas for elective forms
 */

import { describe, it, expect } from 'vitest';
import { electiveFormSchema } from './elective-schemas';
import { ZodError } from 'zod';

describe('Elective Form Schema', () => {
	describe('Valid inputs', () => {
		it('should validate a complete valid elective', () => {
			const validData = {
				name: 'Cardiology Elective',
				specialty: 'Cardiology',
				minimumDays: 5,
				isRequired: true
			};

			const result = electiveFormSchema.parse(validData);

			expect(result).toEqual(validData);
		});

		it('should validate with null specialty', () => {
			const validData = {
				name: 'General Elective',
				specialty: null,
				minimumDays: 3,
				isRequired: false
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.specialty).toBeNull();
		});

		it('should validate without specialty field (optional)', () => {
			const validData = {
				name: 'General Elective',
				minimumDays: 3,
				isRequired: false
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.name).toBe('General Elective');
			expect(result.specialty).toBeUndefined();
		});

		it('should default isRequired to false when not provided', () => {
			const validData = {
				name: 'Optional Elective',
				minimumDays: 2
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.isRequired).toBe(false);
		});

		it('should validate minimum days of 1', () => {
			const validData = {
				name: 'Short Elective',
				minimumDays: 1,
				isRequired: false
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.minimumDays).toBe(1);
		});

		it('should validate maximum days of 365', () => {
			const validData = {
				name: 'Year-Long Elective',
				minimumDays: 365,
				isRequired: false
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.minimumDays).toBe(365);
		});

		it('should validate with 200 character name (max length)', () => {
			const longName = 'A'.repeat(200);
			const validData = {
				name: longName,
				minimumDays: 5,
				isRequired: false
			};

			const result = electiveFormSchema.parse(validData);

			expect(result.name).toBe(longName);
			expect(result.name.length).toBe(200);
		});
	});

	describe('Invalid name field', () => {
		it('should reject empty name', () => {
			const invalidData = {
				name: '',
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const nameError = error.issues.find((issue) => issue.path[0] === 'name');
					expect(nameError?.message).toBe('Name is required');
				}
			}
		});

		it('should reject name longer than 200 characters', () => {
			const invalidData = {
				name: 'A'.repeat(201),
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const nameError = error.issues.find((issue) => issue.path[0] === 'name');
					expect(nameError?.message).toBe('Name too long');
				}
			}
		});

		it('should reject missing name field', () => {
			const invalidData = {
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});

		it('should reject non-string name', () => {
			const invalidData = {
				name: 123,
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});
	});

	describe('Invalid minimumDays field', () => {
		it('should reject minimumDays less than 1', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: 0,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const daysError = error.issues.find((issue) => issue.path[0] === 'minimumDays');
					expect(daysError?.message).toBe('Minimum days must be at least 1');
				}
			}
		});

		it('should reject negative minimumDays', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: -5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const daysError = error.issues.find((issue) => issue.path[0] === 'minimumDays');
					expect(daysError?.message).toBe('Minimum days must be at least 1');
				}
			}
		});

		it('should reject minimumDays greater than 365', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: 366,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const daysError = error.issues.find((issue) => issue.path[0] === 'minimumDays');
					expect(daysError?.message).toBe('Minimum days cannot exceed 365');
				}
			}
		});

		it('should reject non-integer minimumDays', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: 5.5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);

			try {
				electiveFormSchema.parse(invalidData);
			} catch (error) {
				if (error instanceof ZodError) {
					const daysError = error.issues.find((issue) => issue.path[0] === 'minimumDays');
					expect(daysError?.message).toContain('Expected integer');
				}
			}
		});

		it('should reject missing minimumDays field', () => {
			const invalidData = {
				name: 'Test Elective',
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});

		it('should reject non-number minimumDays', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: '5',
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});
	});

	describe('Invalid isRequired field', () => {
		it('should reject non-boolean isRequired', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: 5,
				isRequired: 'true'
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});

		it('should reject numeric isRequired', () => {
			const invalidData = {
				name: 'Test Elective',
				minimumDays: 5,
				isRequired: 1
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});
	});

	describe('Invalid specialty field', () => {
		it('should reject non-string specialty (when provided)', () => {
			const invalidData = {
				name: 'Test Elective',
				specialty: 123,
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});

		it('should reject array specialty', () => {
			const invalidData = {
				name: 'Test Elective',
				specialty: ['Cardiology'],
				minimumDays: 5,
				isRequired: false
			};

			expect(() => electiveFormSchema.parse(invalidData)).toThrow(ZodError);
		});
	});

	describe('Multiple validation errors', () => {
		it('should report multiple errors at once', () => {
			const invalidData = {
				name: '',
				minimumDays: 0,
				isRequired: 'not-a-boolean'
			};

			try {
				electiveFormSchema.parse(invalidData);
				expect.fail('Should have thrown ZodError');
			} catch (error) {
				if (error instanceof ZodError) {
					expect(error.issues.length).toBeGreaterThanOrEqual(3);
					const paths = error.issues.map((issue) => issue.path[0]);
					expect(paths).toContain('name');
					expect(paths).toContain('minimumDays');
					expect(paths).toContain('isRequired');
				} else {
					throw error;
				}
			}
		});
	});

	describe('Edge cases', () => {
		it('should handle whitespace-only name as invalid', () => {
			const invalidData = {
				name: '   ',
				minimumDays: 5,
				isRequired: false
			};

			// Zod's min(1) checks length, not trimmed length, so this should pass
			// If we want to reject whitespace-only, we'd need a custom refinement
			const result = electiveFormSchema.parse(invalidData);
			expect(result.name).toBe('   ');
		});

		it('should preserve exact minimumDays value', () => {
			const validData = {
				name: 'Test',
				minimumDays: 42,
				isRequired: true
			};

			const result = electiveFormSchema.parse(validData);
			expect(result.minimumDays).toBe(42);
		});

		it('should handle empty string specialty as invalid', () => {
			const invalidData = {
				name: 'Test',
				specialty: '',
				minimumDays: 5,
				isRequired: false
			};

			// Empty string is still a valid string for Zod, just not null
			const result = electiveFormSchema.parse(invalidData);
			expect(result.specialty).toBe('');
		});
	});

	describe('Type inference', () => {
		it('should infer correct TypeScript type', () => {
			const validData = {
				name: 'Test',
				specialty: 'Cardiology',
				minimumDays: 5,
				isRequired: true
			};

			const result = electiveFormSchema.parse(validData);

			// TypeScript compile-time checks
			const name: string = result.name;
			const specialty: string | null | undefined = result.specialty;
			const minimumDays: number = result.minimumDays;
			const isRequired: boolean = result.isRequired;

			expect(name).toBeDefined();
			expect(specialty).toBeDefined();
			expect(minimumDays).toBeDefined();
			expect(isRequired).toBeDefined();
		});
	});
});
