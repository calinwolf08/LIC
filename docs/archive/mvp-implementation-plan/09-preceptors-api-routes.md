# Step 09: Preceptors - API Routes

## Overview
Implement RESTful API routes for preceptor CRUD operations and availability management. These routes handle HTTP requests, validate input, call service functions, and return properly formatted responses.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 07: Preceptors - Service Layer
- ✅ Step 08: Preceptor Availability - Service Layer

## Requirements

### API Endpoints
- `GET /api/preceptors` - List all preceptors
- `GET /api/preceptors/[id]` - Get single preceptor
- `POST /api/preceptors` - Create new preceptor
- `PATCH /api/preceptors/[id]` - Update preceptor
- `DELETE /api/preceptors/[id]` - Delete preceptor
- `GET /api/preceptors/[id]/availability` - Get preceptor's availability
- `POST /api/preceptors/[id]/availability` - Set/bulk update availability

### Response Format
- Use standardized response helpers
- Return appropriate HTTP status codes
- Include error details for debugging
- Type-safe response bodies

### Error Handling
- Catch and format service layer errors
- Return user-friendly error messages
- Handle validation errors from Zod
- Log errors appropriately

## Implementation Details

### File Structure
```
/src/routes/api/preceptors/
├── +server.ts                           # GET (list), POST (create) (NEW)
├── +server.test.ts                      # Integration tests (NEW)
├── [id]/
│   ├── +server.ts                       # GET, PATCH, DELETE (NEW)
│   ├── +server.test.ts                  # Integration tests (NEW)
│   └── availability/
│       ├── +server.ts                   # GET, POST availability (NEW)
│       └── +server.test.ts              # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/preceptors/+server.ts`

Handles collection-level operations (list all, create).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // List all preceptors
export const POST: RequestHandler;  // Create preceptor
```

---

#### GET Handler - List All Preceptors

**Logic:**
1. Optionally filter by specialty (query param)
2. Call appropriate service function
3. Return success response with preceptors array

**Query Parameters:**
- `specialty` (optional): Filter by medical specialty

**Response:**
- Status: 200
- Body: `{ success: true, data: PreceptorsTable[] }`

**Errors:**
- Status: 500 for unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "123-456-789",
      "name": "Dr. Smith",
      "email": "smith@example.com",
      "specialty": "Internal Medicine",
      "max_students": 1,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST Handler - Create Preceptor

**Logic:**
1. Parse JSON body from request
2. Validate input using `createPreceptorSchema`
3. If validation fails, return validation error response
4. Call `createPreceptor(db, validatedData)` service function
5. If ConflictError (email exists), return 409 error
6. Return success response with created preceptor

**Request Body:**
```json
{
  "name": "Dr. Smith",
  "email": "smith@example.com",
  "specialty": "Internal Medicine",
  "max_students": 1
}
```

**Response:**
- Status: 201
- Body: `{ success: true, data: PreceptorsTable }`

**Errors:**
- 400: Validation error (invalid input)
- 409: Conflict (email already exists)
- 500: Unexpected errors

---

### 2. `/src/routes/api/preceptors/[id]/+server.ts`

Handles individual preceptor operations (get, update, delete).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;     // Get single preceptor
export const PATCH: RequestHandler;   // Update preceptor
export const DELETE: RequestHandler;  // Delete preceptor
```

---

#### GET Handler - Get Single Preceptor

**Logic:**
1. Extract preceptor ID from URL params
2. Validate ID is valid UUID
3. Call `getPreceptorById(db, id)` service function
4. If null, return 404 NotFoundError
5. Return success response with preceptor

**Response:**
- Status: 200
- Body: `{ success: true, data: PreceptorsTable }`

**Errors:**
- 400: Invalid UUID format
- 404: Preceptor not found
- 500: Unexpected errors

---

#### PATCH Handler - Update Preceptor

**Logic:**
1. Extract preceptor ID from URL params
2. Validate ID is valid UUID
3. Parse JSON body from request
4. Validate input using `updatePreceptorSchema`
5. If validation fails, return validation error response
6. Call `updatePreceptor(db, id, validatedData)` service function
7. If NotFoundError, return 404
8. If ConflictError (email exists), return 409
9. Return success response with updated preceptor

**Request Body:**
```json
{
  "name": "Dr. Jane Smith",
  "specialty": "Cardiology"
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: PreceptorsTable }`

**Errors:**
- 400: Validation error or invalid UUID
- 404: Preceptor not found
- 409: Conflict (email already exists)
- 500: Unexpected errors

---

#### DELETE Handler - Delete Preceptor

**Logic:**
1. Extract preceptor ID from URL params
2. Validate ID is valid UUID
3. Call `deletePreceptor(db, id)` service function
4. If NotFoundError, return 404
5. If ConflictError (has assignments), return 409
6. Return success response (no data)

**Response:**
- Status: 200
- Body: `{ success: true, data: null }`

**Errors:**
- 400: Invalid UUID
- 404: Preceptor not found
- 409: Preceptor has schedule assignments
- 500: Unexpected errors

---

### 3. `/src/routes/api/preceptors/[id]/availability/+server.ts`

Handles preceptor availability operations.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // Get availability
export const POST: RequestHandler;  // Bulk update availability
```

---

#### GET Handler - Get Availability

**Logic:**
1. Extract preceptor ID from URL params
2. Validate ID is valid UUID
3. Optionally filter by date range (query params)
4. Call appropriate service function
5. Return success response with availability periods

**Query Parameters:**
- `start_date` (optional): Filter start date (YYYY-MM-DD)
- `end_date` (optional): Filter end date (YYYY-MM-DD)

**Response:**
- Status: 200
- Body: `{ success: true, data: PreceptorAvailabilityTable[] }`

**Errors:**
- 400: Invalid UUID or date format
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "avail-123",
      "preceptor_id": "preceptor-123",
      "start_date": "2024-01-01",
      "end_date": "2024-01-31",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST Handler - Bulk Update Availability

**Logic:**
1. Extract preceptor ID from URL params
2. Validate ID is valid UUID
3. Parse JSON body from request
4. Validate input using `bulkAvailabilitySchema`
5. Call `bulkUpdateAvailability(db, data)` service function
6. If NotFoundError, return 404
7. If ValidationError (overlapping periods), return 400
8. Return success response with created availability periods

**Request Body:**
```json
{
  "periods": [
    { "start_date": "2024-01-01", "end_date": "2024-01-31" },
    { "start_date": "2024-03-01", "end_date": "2024-03-31" }
  ]
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: PreceptorAvailabilityTable[] }`

**Errors:**
- 400: Validation error
- 404: Preceptor not found
- 500: Unexpected errors

---

## Implementation Pattern

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { getPreceptors, createPreceptor, getPreceptorsBySpecialty } from '$lib/features/preceptors/services/preceptor-service';
import { createPreceptorSchema } from '$lib/features/preceptors/schemas';
import { ConflictError, NotFoundError } from '$lib/api/errors';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const specialty = url.searchParams.get('specialty');

    const preceptors = specialty
      ? await getPreceptorsBySpecialty(db, specialty)
      : await getPreceptors(db);

    return successResponse(preceptors);
  } catch (error) {
    return handleApiError(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const validatedData = createPreceptorSchema.parse(body);
    const preceptor = await createPreceptor(db, validatedData);
    return successResponse(preceptor, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    if (error instanceof ConflictError) {
      return errorResponse(error.message, 409);
    }
    return handleApiError(error);
  }
};
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/preceptors/+server.test.ts`

**GET /api/preceptors:**
- ✅ Returns 200 with empty array when no preceptors
- ✅ Returns 200 with array of preceptors
- ✅ Preceptors are ordered by name
- ✅ Filters by specialty when query param provided
- ✅ Returns empty array when no matches for specialty
- ✅ Response has correct structure

**POST /api/preceptors:**
- ✅ Creates preceptor with valid data (201)
- ✅ Returns created preceptor with ID
- ✅ Returns 400 for missing name
- ✅ Returns 400 for missing email
- ✅ Returns 400 for missing specialty
- ✅ Returns 400 for invalid email format
- ✅ Returns 400 for invalid max_students (negative)
- ✅ Returns 409 for duplicate email
- ✅ Defaults max_students to 1
- ✅ Created preceptor appears in GET list

---

#### `/src/routes/api/preceptors/[id]/+server.test.ts`

**GET /api/preceptors/[id]:**
- ✅ Returns 200 with preceptor data
- ✅ Returns 404 for non-existent preceptor
- ✅ Returns 400 for invalid UUID format
- ✅ Response has correct structure

**PATCH /api/preceptors/[id]:**
- ✅ Updates preceptor name (200)
- ✅ Updates preceptor email (200)
- ✅ Updates preceptor specialty (200)
- ✅ Updates preceptor max_students (200)
- ✅ Updates multiple fields (200)
- ✅ Returns updated preceptor data
- ✅ Returns 404 for non-existent preceptor
- ✅ Returns 400 for invalid UUID
- ✅ Returns 400 for invalid email format
- ✅ Returns 409 for duplicate email
- ✅ Returns 400 for empty update object
- ✅ Allows keeping same email

**DELETE /api/preceptors/[id]:**
- ✅ Deletes preceptor successfully (200)
- ✅ Preceptor no longer appears in GET list
- ✅ Returns 404 for non-existent preceptor
- ✅ Returns 400 for invalid UUID
- ✅ Returns 409 when preceptor has assignments
- ✅ Cascades delete to availability records

---

#### `/src/routes/api/preceptors/[id]/availability/+server.test.ts`

**GET /api/preceptors/[id]/availability:**
- ✅ Returns 200 with empty array when no availability
- ✅ Returns 200 with array of availability periods
- ✅ Periods are ordered by start_date
- ✅ Filters by date range when query params provided
- ✅ Returns 400 for invalid date format
- ✅ Returns 400 for invalid UUID

**POST /api/preceptors/[id]/availability:**
- ✅ Bulk updates availability (200)
- ✅ Replaces all existing periods
- ✅ Returns created periods
- ✅ Returns 404 for non-existent preceptor
- ✅ Returns 400 for invalid date format
- ✅ Returns 400 for start_date >= end_date
- ✅ Returns 400 for overlapping periods in request
- ✅ Allows empty periods array (clears all)

---

### Testing Strategy

1. **Setup:**
   - Use test database (`createTestDb()`)
   - Seed with known test data
   - Reset between tests

2. **HTTP Testing:**
   - Use SvelteKit's test utilities
   - Make actual HTTP requests to endpoints
   - Assert status codes and response bodies

3. **Query Parameters:**
   - Test filtering functionality
   - Test invalid parameters
   - Test missing parameters

4. **Error Cases:**
   - Test all error conditions
   - Verify error response format
   - Check appropriate status codes

---

## Acceptance Criteria

- [ ] GET /api/preceptors endpoint implemented
- [ ] POST /api/preceptors endpoint implemented
- [ ] GET /api/preceptors/[id] endpoint implemented
- [ ] PATCH /api/preceptors/[id] endpoint implemented
- [ ] DELETE /api/preceptors/[id] endpoint implemented
- [ ] GET /api/preceptors/[id]/availability endpoint implemented
- [ ] POST /api/preceptors/[id]/availability endpoint implemented
- [ ] All endpoints use service functions (no direct DB access)
- [ ] All endpoints use standardized response helpers
- [ ] Proper error handling for all edge cases
- [ ] Validation errors return 400 with details
- [ ] All integration tests passing
- [ ] Response types match expected structure
- [ ] Query parameter filtering works correctly

---

## Usage Example

```typescript
// List all preceptors
const response = await fetch('/api/preceptors');
const { data: preceptors } = await response.json();

// Filter by specialty
const response = await fetch('/api/preceptors?specialty=Internal Medicine');
const { data: internists } = await response.json();

// Create preceptor
const response = await fetch('/api/preceptors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Dr. Smith',
    email: 'smith@example.com',
    specialty: 'Internal Medicine'
  })
});

// Get preceptor's availability
const response = await fetch('/api/preceptors/123/availability');
const { data: availability } = await response.json();

// Bulk update availability
const response = await fetch('/api/preceptors/123/availability', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    periods: [
      { start_date: '2024-01-01', end_date: '2024-01-31' },
      { start_date: '2024-03-01', end_date: '2024-03-31' }
    ]
  })
});
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Database instance (`db`) imported at top of file
- Consistent error handling pattern across all endpoints
- Query parameters use `url.searchParams.get()`
- Consider rate limiting for production
- Log errors for debugging but don't expose internals

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [SvelteKit RequestHandler](https://kit.svelte.dev/docs/types#public-types-requesthandler)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [REST API Best Practices](https://restfulapi.net/)
