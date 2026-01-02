/**
 * Unit tests for form-helpers.ts
 * Tests form error handling utilities
 */

import { describe, it, expect } from 'vitest';
import { extractZodErrors, extractApiErrors, validateElectiveForm } from './form-helpers';
import { electiveFormSchema } from '../schemas/elective-schemas';
import { ZodError } from 'zod';

describe('Form Helpers', () => {
	describe('extractZodErrors()', () => {
		it('should extract single field error from ZodError', () => {
			const invalidData = {
				name: '',
				minimumDays: 5,
				isRequired: false
			};

			try {
				electiveFormSchema.parse(invalidData);
				expect.fail('Should have thrown ZodError');
			} catch (error) {
				if (error instanceof ZodError) {
					const fieldErrors = extractZodErrors(error);
					expect(fieldErrors.name).toBe('Name is required');
				} else {
					throw error;
				}
			}
		});

		it('should extract multiple field errors from ZodError', () => {
			const invalidData = {
				name: '',
				minimumDays: 0,
				isRequired: 'not-boolean'
			};

			try {
				electiveFormSchema.parse(invalidData);
				expect.fail('Should have thrown ZodError');
			} catch (error) {
				if (error instanceof ZodError) {
					const fieldErrors = extractZodErrors(error);

					expect(fieldErrors.name).toBe('Name is required');
					expect(fieldErrors.minimumDays).toBe('Minimum days must be at least 1');
					expect(fieldErrors.isRequired).toBeDefined();
					expect(Object.keys(fieldErrors).length).toBeGreaterThanOrEqual(3);
				} else {
					throw error;
				}
			}
		});

		it('should handle ZodError with no field path (root-level error)', () => {
			// Create a ZodError with an issue that has an empty path
			const zodError = new ZodError([
				{
					code: 'custom',
					message: 'Root level error',
					path: []
				}
			]);

			const fieldErrors = extractZodErrors(zodError);

			// Should not add errors without a field name
			expect(Object.keys(fieldErrors).length).toBe(0);
		});

		it('should use first element of path as field name', () => {
			// Create a ZodError with nested path
			const zodError = new ZodError([
				{
					code: 'invalid_type',
					expected: 'string',
					received: 'number',
					message: 'Expected string',
					path: ['user', 'name']
				}
			]);

			const fieldErrors = extractZodErrors(zodError);

			expect(fieldErrors.user).toBe('Expected string');
		});

		it('should handle ZodError with numeric path elements', () => {
			const zodError = new ZodError([
				{
					code: 'invalid_type',
					expected: 'string',
					received: 'number',
					message: 'Invalid type',
					path: [0, 'name']
				}
			]);

			const fieldErrors = extractZodErrors(zodError);

			expect(fieldErrors['0']).toBe('Invalid type');
		});

		it('should keep only last error message for duplicate field paths', () => {
			const zodError = new ZodError([
				{
					code: 'custom',
					message: 'First error',
					path: ['name']
				},
				{
					code: 'custom',
					message: 'Second error',
					path: ['name']
				}
			]);

			const fieldErrors = extractZodErrors(zodError);

			// Last error should win
			expect(fieldErrors.name).toBe('Second error');
			expect(Object.keys(fieldErrors).length).toBe(1);
		});

		it('should return empty object for ZodError with no issues', () => {
			const zodError = new ZodError([]);

			const fieldErrors = extractZodErrors(zodError);

			expect(fieldErrors).toEqual({});
		});

		it('should preserve exact error messages from Zod', () => {
			const invalidData = {
				name: 'A'.repeat(201),
				minimumDays: 366,
				isRequired: false
			};

			try {
				electiveFormSchema.parse(invalidData);
				expect.fail('Should have thrown ZodError');
			} catch (error) {
				if (error instanceof ZodError) {
					const fieldErrors = extractZodErrors(error);

					expect(fieldErrors.name).toBe('Name too long');
					expect(fieldErrors.minimumDays).toBe('Minimum days cannot exceed 365');
				} else {
					throw error;
				}
			}
		});
	});

	describe('extractApiErrors()', () => {
		it('should extract single API error', () => {
			const apiErrors = [
				{ field: 'name', message: 'Name is already taken' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors.name).toBe('Name is already taken');
			expect(Object.keys(fieldErrors).length).toBe(1);
		});

		it('should extract multiple API errors', () => {
			const apiErrors = [
				{ field: 'name', message: 'Name is already taken' },
				{ field: 'minimumDays', message: 'Invalid minimum days' },
				{ field: 'specialty', message: 'Specialty not found' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors.name).toBe('Name is already taken');
			expect(fieldErrors.minimumDays).toBe('Invalid minimum days');
			expect(fieldErrors.specialty).toBe('Specialty not found');
			expect(Object.keys(fieldErrors).length).toBe(3);
		});

		it('should return empty object for empty API errors array', () => {
			const apiErrors: Array<{ field: string; message: string }> = [];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors).toEqual({});
		});

		it('should handle duplicate field names (last wins)', () => {
			const apiErrors = [
				{ field: 'name', message: 'First error' },
				{ field: 'name', message: 'Second error' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors.name).toBe('Second error');
			expect(Object.keys(fieldErrors).length).toBe(1);
		});

		it('should preserve field names exactly as provided', () => {
			const apiErrors = [
				{ field: 'camelCaseField', message: 'Error 1' },
				{ field: 'snake_case_field', message: 'Error 2' },
				{ field: 'kebab-case-field', message: 'Error 3' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors.camelCaseField).toBe('Error 1');
			expect(fieldErrors.snake_case_field).toBe('Error 2');
			expect(fieldErrors['kebab-case-field']).toBe('Error 3');
		});

		it('should handle nested field names', () => {
			const apiErrors = [
				{ field: 'user.name', message: 'Invalid user name' },
				{ field: 'address.zipCode', message: 'Invalid zip code' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors['user.name']).toBe('Invalid user name');
			expect(fieldErrors['address.zipCode']).toBe('Invalid zip code');
		});

		it('should handle empty field names', () => {
			const apiErrors = [
				{ field: '', message: 'General error' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors['']).toBe('General error');
		});

		it('should handle special characters in field names', () => {
			const apiErrors = [
				{ field: 'field[0]', message: 'Array error' },
				{ field: 'field.nested', message: 'Nested error' }
			];

			const fieldErrors = extractApiErrors(apiErrors);

			expect(fieldErrors['field[0]']).toBe('Array error');
			expect(fieldErrors['field.nested']).toBe('Nested error');
		});
	});

	describe('validateElectiveForm()', () => {
		it('should validate valid elective data', () => {
			const validData = {
				name: 'Cardiology',
				specialty: 'Cardiology',
				minimumDays: 5,
				isRequired: true
			};

			const result = validateElectiveForm(validData, electiveFormSchema);

			expect(result).toEqual(validData);
		});

		it('should throw ZodError for invalid data', () => {
			const invalidData = {
				name: '',
				minimumDays: 0,
				isRequired: false
			};

			expect(() => validateElectiveForm(invalidData, electiveFormSchema)).toThrow(ZodError);
		});

		it('should validate data with defaults', () => {
			const dataWithDefaults = {
				name: 'General',
				minimumDays: 3
			};

			const result = validateElectiveForm(dataWithDefaults, electiveFormSchema);

			expect(result.name).toBe('General');
			expect(result.minimumDays).toBe(3);
			expect(result.isRequired).toBe(false); // Default value
		});

		it('should validate data with null specialty', () => {
			const dataWithNull = {
				name: 'General',
				specialty: null,
				minimumDays: 3,
				isRequired: false
			};

			const result = validateElectiveForm(dataWithNull, electiveFormSchema);

			expect(result.specialty).toBeNull();
		});

		it('should validate data without specialty', () => {
			const dataWithoutSpecialty = {
				name: 'General',
				minimumDays: 3,
				isRequired: false
			};

			const result = validateElectiveForm(dataWithoutSpecialty, electiveFormSchema);

			expect(result.specialty).toBeUndefined();
		});

		it('should pass through ZodError for extraction', () => {
			const invalidData = {
				name: '',
				minimumDays: 0
			};

			try {
				validateElectiveForm(invalidData, electiveFormSchema);
				expect.fail('Should have thrown ZodError');
			} catch (error) {
				expect(error).toBeInstanceOf(ZodError);

				if (error instanceof ZodError) {
					// Should be able to extract errors from this
					const fieldErrors = extractZodErrors(error);
					expect(fieldErrors.name).toBeDefined();
					expect(fieldErrors.minimumDays).toBeDefined();
				}
			}
		});

		it('should handle unknown data types', () => {
			const unknownData = 'not-an-object';

			expect(() => validateElectiveForm(unknownData, electiveFormSchema)).toThrow(ZodError);
		});

		it('should handle null input', () => {
			expect(() => validateElectiveForm(null, electiveFormSchema)).toThrow(ZodError);
		});

		it('should handle undefined input', () => {
			expect(() => validateElectiveForm(undefined, electiveFormSchema)).toThrow(ZodError);
		});
	});

	describe('Integration: Error extraction workflow', () => {
		it('should extract errors from validation failure', () => {
			const invalidData = {
				name: 'A'.repeat(201),
				minimumDays: -5,
				isRequired: 'invalid'
			};

			try {
				const validated = validateElectiveForm(invalidData, electiveFormSchema);
				expect.fail('Should have thrown');
			} catch (error) {
				if (error instanceof ZodError) {
					const fieldErrors = extractZodErrors(error);

					expect(fieldErrors.name).toBe('Name too long');
					expect(fieldErrors.minimumDays).toBe('Minimum days must be at least 1');
					expect(fieldErrors.isRequired).toBeDefined();
				} else {
					throw error;
				}
			}
		});

		it('should combine Zod and API errors in typical form submission', () => {
			// First validate client-side
			const formData = {
				name: '',
				minimumDays: 5,
				isRequired: false
			};

			let clientErrors: Record<string, string> = {};
			try {
				validateElectiveForm(formData, electiveFormSchema);
			} catch (error) {
				if (error instanceof ZodError) {
					clientErrors = extractZodErrors(error);
				}
			}

			// Then simulate API errors
			const apiErrorResponse = [
				{ field: 'name', message: 'Name conflicts with existing elective' }
			];
			const serverErrors = extractApiErrors(apiErrorResponse);

			// Combine errors (server overwrites client)
			const allErrors: Record<string, string> = { ...clientErrors, ...serverErrors };

			expect(allErrors.name).toBe('Name conflicts with existing elective');
		});
	});
});
