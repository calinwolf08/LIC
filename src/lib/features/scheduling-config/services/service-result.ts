/**
 * Service Result Types
 *
 * Defines Result type pattern for predictable error handling across all services.
 */

import type { ServiceError } from './service-errors';

/**
 * Result type for service operations
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

/**
 * Helper functions for creating Results
 */
export const Result = {
  success: <T>(data: T): ServiceResult<T> => ({
    success: true,
    data,
  }),

  failure: <T>(error: ServiceError): ServiceResult<T> => ({
    success: false,
    error,
  }),
};

/**
 * Type guard to check if result is success
 */
export function isSuccess<T>(result: ServiceResult<T>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Type guard to check if result is failure
 */
export function isFailure<T>(
  result: ServiceResult<T>
): result is { success: false; error: ServiceError } {
  return result.success === false;
}
