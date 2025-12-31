/**
 * Form helper utilities (testable logic)
 */

import { ZodError } from 'zod';
import type { electiveFormSchema } from '../schemas/elective-schemas';
import type { z } from 'zod';

export interface FormErrors {
	[key: string]: string;
}

/**
 * Extract field errors from ZodError
 */
export function extractZodErrors(error: ZodError): FormErrors {
	const fieldErrors: FormErrors = {};
	for (const issue of error.issues) {
		const field = issue.path[0]?.toString();
		if (field) {
			fieldErrors[field] = issue.message;
		}
	}
	return fieldErrors;
}

/**
 * Extract field errors from API response
 */
export function extractApiErrors(errorDetails: Array<{ field: string; message: string }>): FormErrors {
	const fieldErrors: FormErrors = {};
	for (const detail of errorDetails) {
		fieldErrors[detail.field] = detail.message;
	}
	return fieldErrors;
}

/**
 * Validate elective form data
 */
export function validateElectiveForm(
	data: unknown,
	schema: typeof electiveFormSchema
): z.infer<typeof schema> {
	return schema.parse(data);
}
