# Step 03: Shared Utilities & Test Helpers

## Overview
Create reusable utility functions and test helpers that will be used throughout the application. This includes API response formatting, error handling, validation utilities, and database mocking for tests.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Zod installed for validation

## Requirements

### API Response Utilities
Consistent response formats for all API endpoints:
- Success responses with data
- Error responses with appropriate status codes
- Validation error formatting
- Type-safe response builders

### Error Handling
Standardized error handling:
- Custom error classes for different error types
- Error logging utilities
- Error formatting for API responses
- User-friendly error messages

### Validation Utilities
Reusable validation helpers:
- Common Zod schemas (email, UUID, dates)
- Date validation and parsing
- ISO date string utilities

### Test Helpers
Database and API testing utilities:
- In-memory database setup for tests
- Database seeding functions
- Mock data generators
- API request helpers for integration tests

## Implementation Details

### File Structure
```
/src/lib/
├── api/
│   ├── responses.ts              # API response helpers
│   ├── responses.test.ts         # Response tests
│   ├── errors.ts                 # Error classes and handlers
│   └── errors.test.ts            # Error tests
├── validation/
│   ├── common-schemas.ts         # Shared Zod schemas
│   ├── common-schemas.test.ts    # Schema tests
│   ├── dates.ts                  # Date utilities
│   └── dates.test.ts             # Date tests
└── testing/
    ├── db-helpers.ts             # Database test helpers
    ├── db-helpers.test.ts        # DB helper tests
    ├── fixtures.ts               # Mock data generators
    └── api-helpers.ts            # API testing utilities
```

---

## 1. API Response Helpers

### `/src/lib/api/responses.ts`

Standardized API response formatting.

**Exports:**
```typescript
// Success response
export function successResponse<T>(data: T, status = 200): Response

// Error response
export function errorResponse(message: string, status = 400, details?: unknown): Response

// Validation error response
export function validationErrorResponse(errors: ZodError): Response

// Not found response
export function notFoundResponse(resource: string): Response

// Type definitions
export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
}

export type ApiErrorResponse = {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
}
```

**Requirements:**
- Return proper Response objects with correct status codes
- Include appropriate headers (Content-Type: application/json)
- Format validation errors consistently
- Include type-safe response types

**Functions to Implement:**

1. `successResponse<T>(data: T, status = 200): Response`
   - Creates success response with data
   - Sets status code (default 200)
   - Returns JSON response with `{ success: true, data }`

2. `errorResponse(message: string, status = 400, details?: unknown): Response`
   - Creates error response
   - Sets status code (default 400)
   - Returns JSON response with `{ success: false, error: { message, details } }`

3. `validationErrorResponse(errors: ZodError): Response`
   - Formats Zod validation errors
   - Returns 400 status
   - Includes field-specific error messages

4. `notFoundResponse(resource: string): Response`
   - Creates 404 response
   - Returns message like "Student not found"

---

## 2. Error Handling

### `/src/lib/api/errors.ts`

Custom error classes and error handling utilities.

**Exports:**
```typescript
export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown)
}

export class NotFoundError extends ApiError
export class ValidationError extends ApiError
export class ConflictError extends ApiError
export class UnauthorizedError extends ApiError

export function handleApiError(error: unknown): Response
export function isApiError(error: unknown): error is ApiError
```

**Requirements:**
- Extend Error class properly
- Include status codes in custom errors
- Provide error type guards
- Handle unknown errors gracefully

**Classes to Implement:**

1. `ApiError`
   - Base error class with status code
   - Stores error message and optional details
   - Properly extends Error with stack trace

2. `NotFoundError extends ApiError`
   - Status code: 404
   - Used for missing resources

3. `ValidationError extends ApiError`
   - Status code: 400
   - Used for invalid input data

4. `ConflictError extends ApiError`
   - Status code: 409
   - Used for unique constraint violations

5. `UnauthorizedError extends ApiError`
   - Status code: 401
   - Used for authentication failures

**Functions to Implement:**

1. `handleApiError(error: unknown): Response`
   - Converts any error to API response
   - Uses custom error status if ApiError
   - Defaults to 500 for unknown errors
   - Logs errors appropriately

2. `isApiError(error: unknown): error is ApiError`
   - Type guard for ApiError instances

---

## 3. Validation Utilities

### `/src/lib/validation/common-schemas.ts`

Reusable Zod schemas used across the application.

**Exports:**
```typescript
export const uuidSchema: z.ZodString
export const emailSchema: z.ZodString
export const dateStringSchema: z.ZodString
export const positiveIntSchema: z.ZodNumber
export const nameSchema: z.ZodString
```

**Requirements:**
- Use Zod for all schemas
- Include helpful error messages
- Reusable across different features
- Export both schema and inferred types

**Schemas to Implement:**

1. `uuidSchema`
   - Validates UUID format
   - Error: "Invalid UUID format"

2. `emailSchema`
   - Validates email format
   - Error: "Invalid email address"

3. `dateStringSchema`
   - Validates ISO date string (YYYY-MM-DD)
   - Error: "Invalid date format. Use YYYY-MM-DD"

4. `positiveIntSchema`
   - Validates positive integers
   - Error: "Must be a positive integer"

5. `nameSchema`
   - Validates non-empty name (min 2 characters)
   - Error: "Name must be at least 2 characters"

---

### `/src/lib/validation/dates.ts`

Date utility functions for parsing and validation.

**Exports:**
```typescript
export function isValidISODate(dateString: string): boolean
export function parseISODate(dateString: string): Date
export function formatToISODate(date: Date): string
export function isDateInRange(date: string, start: string, end: string): boolean
export function getDaysBetween(start: string, end: string): string[]
```

**Requirements:**
- Work with ISO date strings (YYYY-MM-DD)
- Handle invalid dates gracefully
- Provide timezone-safe operations
- Include range and iteration utilities

**Functions to Implement:**

1. `isValidISODate(dateString: string): boolean`
   - Checks if string is valid ISO date
   - Returns true/false

2. `parseISODate(dateString: string): Date`
   - Parses ISO date string to Date object
   - Throws error if invalid

3. `formatToISODate(date: Date): string`
   - Formats Date to ISO string (YYYY-MM-DD)
   - Handles timezone correctly

4. `isDateInRange(date: string, start: string, end: string): boolean`
   - Checks if date is between start and end (inclusive)

5. `getDaysBetween(start: string, end: string): string[]`
   - Returns array of all dates between start and end
   - Includes both start and end dates
   - Returns ISO date strings

---

## 4. Test Helpers

### `/src/lib/testing/db-helpers.ts`

Database testing utilities for creating test databases and cleaning up.

**Exports:**
```typescript
export function createTestDb(): Kysely<Database>
export function resetTestDb(db: Kysely<Database>): Promise<void>
export function closeTestDb(db: Kysely<Database>): Promise<void>
export function seedTestDb(db: Kysely<Database>, data?: Partial<SeedData>): Promise<SeedData>

export type SeedData = {
  students: StudentsTable[];
  preceptors: PreceptorsTable[];
  clerkships: ClerkshipsTable[];
  // ... other tables
}
```

**Requirements:**
- Use in-memory SQLite (`:memory:`)
- Run migrations on test database
- Provide cleanup utilities
- Include seeding functions

**Functions to Implement:**

1. `createTestDb(): Kysely<Database>`
   - Creates in-memory SQLite database
   - Runs all migrations
   - Returns typed database instance

2. `resetTestDb(db: Kysely<Database>): Promise<void>`
   - Deletes all data from all tables
   - Resets to clean state
   - Maintains schema

3. `closeTestDb(db: Kysely<Database>): Promise<void>`
   - Closes database connection
   - Cleans up resources

4. `seedTestDb(db: Kysely<Database>, data?: Partial<SeedData>): Promise<SeedData>`
   - Populates database with test data
   - Uses provided data or generates default fixtures
   - Returns inserted data with IDs

---

### `/src/lib/testing/fixtures.ts`

Mock data generators for testing.

**Exports:**
```typescript
export function createMockStudent(overrides?: Partial<StudentsTable>): StudentsTable
export function createMockPreceptor(overrides?: Partial<PreceptorsTable>): PreceptorsTable
export function createMockClerkship(overrides?: Partial<ClerkshipsTable>): ClerkshipsTable
export function createMockAssignment(overrides?: Partial<ScheduleAssignmentsTable>): ScheduleAssignmentsTable
```

**Requirements:**
- Generate valid mock data
- Allow partial overrides
- Use realistic values
- Include proper IDs and timestamps

**Functions to Implement:**

1. `createMockStudent(overrides?: Partial<StudentsTable>): StudentsTable`
   - Generates student with random valid data
   - Merges with provided overrides
   - Includes unique email

2. `createMockPreceptor(overrides?: Partial<PreceptorsTable>): PreceptorsTable`
   - Generates preceptor with random valid data
   - Includes specialty
   - max_students defaults to 1

3. `createMockClerkship(overrides?: Partial<ClerkshipsTable>): ClerkshipsTable`
   - Generates clerkship with random valid data
   - Includes required_days > 0

4. `createMockAssignment(overrides?: Partial<ScheduleAssignmentsTable>): ScheduleAssignmentsTable`
   - Generates assignment with random valid data
   - Includes valid date string

---

### `/src/lib/testing/api-helpers.ts`

Utilities for testing API endpoints.

**Exports:**
```typescript
export async function mockFetch(url: string, options?: RequestInit): Promise<Response>
export function createMockRequest(method: string, url: string, body?: unknown): Request
export async function parseJsonResponse<T>(response: Response): Promise<T>
```

**Requirements:**
- Simplify API endpoint testing
- Mock fetch for unit tests
- Parse responses easily

**Functions to Implement:**

1. `mockFetch(url: string, options?: RequestInit): Promise<Response>`
   - Creates mock fetch function
   - Returns mock Response objects

2. `createMockRequest(method: string, url: string, body?: unknown): Request`
   - Creates Request object for testing
   - Includes proper headers
   - Serializes body to JSON

3. `parseJsonResponse<T>(response: Response): Promise<T>`
   - Parses JSON from Response
   - Type-safe return

---

## Testing Requirements

### Unit Tests

#### `/src/lib/api/responses.test.ts`
- ✅ `successResponse()` returns correct status and data
- ✅ `errorResponse()` returns correct status and error message
- ✅ `validationErrorResponse()` formats Zod errors correctly
- ✅ `notFoundResponse()` returns 404 with correct message
- ✅ All responses have correct Content-Type header

#### `/src/lib/api/errors.test.ts`
- ✅ Custom error classes extend Error correctly
- ✅ Error classes include correct status codes
- ✅ `handleApiError()` converts errors to responses
- ✅ `handleApiError()` handles unknown errors
- ✅ `isApiError()` type guard works correctly

#### `/src/lib/validation/common-schemas.test.ts`
- ✅ UUID schema validates correct UUIDs
- ✅ UUID schema rejects invalid UUIDs
- ✅ Email schema validates correct emails
- ✅ Email schema rejects invalid emails
- ✅ Date schema validates ISO dates
- ✅ Date schema rejects invalid dates
- ✅ Positive int schema validates positive numbers
- ✅ Positive int schema rejects negative numbers and zero
- ✅ Name schema validates names
- ✅ Name schema rejects short names

#### `/src/lib/validation/dates.test.ts`
- ✅ `isValidISODate()` validates correct dates
- ✅ `isValidISODate()` rejects invalid dates
- ✅ `parseISODate()` parses valid dates
- ✅ `parseISODate()` throws on invalid dates
- ✅ `formatToISODate()` formats dates correctly
- ✅ `isDateInRange()` correctly checks date ranges
- ✅ `getDaysBetween()` returns all dates in range
- ✅ `getDaysBetween()` includes start and end dates

#### `/src/lib/testing/db-helpers.test.ts`
- ✅ `createTestDb()` creates database successfully
- ✅ `createTestDb()` runs migrations
- ✅ `resetTestDb()` clears all data
- ✅ `resetTestDb()` preserves schema
- ✅ `closeTestDb()` closes connection
- ✅ `seedTestDb()` inserts data correctly
- ✅ `seedTestDb()` returns inserted data with IDs

#### `/src/lib/testing/fixtures.test.ts`
- ✅ Mock generators create valid data
- ✅ Mock generators respect overrides
- ✅ Mock generators include required fields
- ✅ Mock generators create unique IDs

## Acceptance Criteria

- [ ] All response helper functions implemented and tested
- [ ] All custom error classes implemented and tested
- [ ] All validation schemas implemented and tested
- [ ] All date utility functions implemented and tested
- [ ] All database test helpers implemented and tested
- [ ] All fixture generators implemented and tested
- [ ] All API test helpers implemented and tested
- [ ] All unit tests passing (100% coverage for utilities)
- [ ] Functions are properly typed with TypeScript
- [ ] Documentation includes usage examples
- [ ] Utilities are exported from appropriate index files

## Usage Examples

### API Responses
```typescript
import { successResponse, errorResponse, NotFoundError } from '$lib/api';

// Success
return successResponse({ id: '123', name: 'John' });

// Error
return errorResponse('Invalid input', 400);

// Custom error
throw new NotFoundError('Student');
```

### Validation
```typescript
import { emailSchema, dateStringSchema } from '$lib/validation/common-schemas';
import { getDaysBetween } from '$lib/validation/dates';

// Validate email
const email = emailSchema.parse('test@example.com');

// Get date range
const dates = getDaysBetween('2024-01-01', '2024-01-31');
```

### Testing
```typescript
import { createTestDb, seedTestDb } from '$lib/testing/db-helpers';
import { createMockStudent } from '$lib/testing/fixtures';

// Setup test database
const db = createTestDb();
const seed = await seedTestDb(db);

// Create custom mock
const student = createMockStudent({ name: 'Custom Name' });
```

## Notes

- All utilities should be pure functions where possible
- Error messages should be user-friendly
- Test helpers should be easy to use and well-documented
- Consider performance for date range operations
- Ensure timezone handling is consistent

## References

- [Zod Documentation](https://zod.dev/)
- [Vitest Testing Framework](https://vitest.dev/)
- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [TypeScript Error Handling](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
