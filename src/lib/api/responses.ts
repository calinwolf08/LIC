/**
 * API Response Helpers
 *
 * Standardized response formatting for all API endpoints
 */

import { json } from '@sveltejs/kit';
import type { ZodError } from 'zod';

export type ApiSuccessResponse<T> = {
	success: true;
	data: T;
};

export type ApiErrorResponse = {
	success: false;
	error: {
		message: string;
		details?: unknown;
	};
};

/**
 * Creates a success response with data
 */
export function successResponse<T>(data: T, status = 200): Response {
	return json<ApiSuccessResponse<T>>(
		{
			success: true,
			data
		},
		{ status }
	);
}

/**
 * Creates an error response
 */
export function errorResponse(message: string, status = 400, details?: unknown): Response {
	return json<ApiErrorResponse>(
		{
			success: false,
			error: {
				message,
				...(details && { details })
			}
		},
		{ status }
	);
}

/**
 * Formats Zod validation errors into a user-friendly response
 */
export function validationErrorResponse(errors: ZodError): Response {
	const fieldErrors = errors.errors.map((err) => ({
		field: err.path.join('.'),
		message: err.message
	}));

	return errorResponse('Validation failed', 400, fieldErrors);
}

/**
 * Creates a 404 not found response
 */
export function notFoundResponse(resource: string): Response {
	return errorResponse(`${resource} not found`, 404);
}
