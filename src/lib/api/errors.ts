/**
 * Custom Error Classes and Error Handling
 *
 * Provides typed error classes for different error scenarios
 */

import { errorResponse } from './responses';

/**
 * Base API error class with status code
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
		// Maintain proper stack trace in V8
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

/**
 * 404 Not Found error
 */
export class NotFoundError extends ApiError {
	constructor(resource: string) {
		super(`${resource} not found`, 404);
		this.name = 'NotFoundError';
	}
}

/**
 * 400 Validation error
 */
export class ValidationError extends ApiError {
	constructor(message: string, details?: unknown) {
		super(message, 400, details);
		this.name = 'ValidationError';
	}
}

/**
 * 409 Conflict error (e.g., unique constraint violation)
 */
export class ConflictError extends ApiError {
	constructor(message: string, details?: unknown) {
		super(message, 409, details);
		this.name = 'ConflictError';
	}
}

/**
 * 401 Unauthorized error
 */
export class UnauthorizedError extends ApiError {
	constructor(message = 'Unauthorized') {
		super(message, 401);
		this.name = 'UnauthorizedError';
	}
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
	return error instanceof ApiError;
}

/**
 * Converts any error into an API response
 */
export function handleApiError(error: unknown): Response {
	// Log error for debugging
	console.error('API Error:', error);

	// Handle known API errors
	if (isApiError(error)) {
		return errorResponse(error.message, error.status, error.details);
	}

	// Handle unknown errors
	return errorResponse('Internal server error', 500);
}
