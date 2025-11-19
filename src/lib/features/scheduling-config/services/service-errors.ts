/**
 * Service Error Types
 *
 * Defines error categories and structures for service layer error handling.
 */

/**
 * Error Categories
 */
export enum ServiceErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
}

/**
 * Service Error Structure
 */
export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Factory functions for creating common errors
 */
export const ServiceErrors = {
  validationError: (message: string, details?: unknown): ServiceError => ({
    code: ServiceErrorCode.VALIDATION_ERROR,
    message,
    details,
  }),

  notFound: (entityType: string, id: string): ServiceError => ({
    code: ServiceErrorCode.NOT_FOUND,
    message: `${entityType} with ID ${id} not found`,
  }),

  conflict: (message: string, details?: unknown): ServiceError => ({
    code: ServiceErrorCode.CONFLICT,
    message,
    details,
  }),

  databaseError: (message: string, details?: unknown): ServiceError => ({
    code: ServiceErrorCode.DATABASE_ERROR,
    message: `DB error: ${message}`,
    details,
  }),

  dependencyError: (
    entityType: string,
    dependencyType: string,
    details?: unknown
  ): ServiceError => ({
    code: ServiceErrorCode.DEPENDENCY_ERROR,
    message: `Cannot delete ${entityType} because it has dependent ${dependencyType}`,
    details,
  }),
};
