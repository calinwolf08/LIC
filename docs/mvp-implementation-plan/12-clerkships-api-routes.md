# Step 12: Clerkships - API Routes

## Overview
Implement RESTful API routes for clerkship CRUD operations. These routes handle HTTP requests for managing clerkship types and their requirements.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 11: Clerkships - Service Layer

## Requirements

### API Endpoints
- `GET /api/clerkships` - List all clerkships
- `GET /api/clerkships/[id]` - Get single clerkship
- `POST /api/clerkships` - Create new clerkship
- `PATCH /api/clerkships/[id]` - Update clerkship
- `DELETE /api/clerkships/[id]` - Delete clerkship

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
/src/routes/api/clerkships/
├── +server.ts              # GET (list), POST (create) (NEW)
├── +server.test.ts         # Integration tests (NEW)
├── [id]/
│   ├── +server.ts          # GET, PATCH, DELETE (NEW)
│   └── +server.test.ts     # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/clerkships/+server.ts`

Handles collection-level operations (list all, create).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // List all clerkships
export const POST: RequestHandler;  // Create clerkship
```

---

#### GET Handler - List All Clerkships

**Logic:**
1. Optionally filter by specialty (query param)
2. Call appropriate service function
3. Return success response with clerkships array

**Query Parameters:**
- `specialty` (optional): Filter by medical specialty

**Response:**
- Status: 200
- Body: `{ success: true, data: ClerkshipsTable[] }`

**Errors:**
- Status: 500 for unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "123-456-789",
      "name": "Internal Medicine",
      "specialty": "Internal Medicine",
      "required_days": 28,
      "description": "Four-week rotation",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST Handler - Create Clerkship

**Logic:**
1. Parse JSON body from request
2. Validate input using `createClerkshipSchema`
3. If validation fails, return validation error response
4. Call `createClerkship(db, validatedData)` service function
5. If ConflictError (name exists), return 409 error
6. Return success response with created clerkship

**Request Body:**
```json
{
  "name": "Internal Medicine",
  "specialty": "Internal Medicine",
  "required_days": 28,
  "description": "Four-week rotation"
}
```

**Response:**
- Status: 201
- Body: `{ success: true, data: ClerkshipsTable }`

**Errors:**
- 400: Validation error (invalid input)
- 409: Conflict (name already exists)
- 500: Unexpected errors

---

### 2. `/src/routes/api/clerkships/[id]/+server.ts`

Handles individual clerkship operations (get, update, delete).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;     // Get single clerkship
export const PATCH: RequestHandler;   // Update clerkship
export const DELETE: RequestHandler;  // Delete clerkship
```

---

#### GET Handler - Get Single Clerkship

**Logic:**
1. Extract clerkship ID from URL params
2. Validate ID is valid UUID
3. Call `getClerkshipById(db, id)` service function
4. If null, return 404 NotFoundError
5. Return success response with clerkship

**Response:**
- Status: 200
- Body: `{ success: true, data: ClerkshipsTable }`

**Errors:**
- 400: Invalid UUID format
- 404: Clerkship not found
- 500: Unexpected errors

---

#### PATCH Handler - Update Clerkship

**Logic:**
1. Extract clerkship ID from URL params
2. Validate ID is valid UUID
3. Parse JSON body from request
4. Validate input using `updateClerkshipSchema`
5. If validation fails, return validation error response
6. Call `updateClerkship(db, id, validatedData)` service function
7. If NotFoundError, return 404
8. If ConflictError (name exists), return 409
9. Return success response with updated clerkship

**Request Body:**
```json
{
  "required_days": 56,
  "description": "Eight-week rotation"
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: ClerkshipsTable }`

**Errors:**
- 400: Validation error or invalid UUID
- 404: Clerkship not found
- 409: Conflict (name already exists)
- 500: Unexpected errors

---

#### DELETE Handler - Delete Clerkship

**Logic:**
1. Extract clerkship ID from URL params
2. Validate ID is valid UUID
3. Call `deleteClerkship(db, id)` service function
4. If NotFoundError, return 404
5. If ConflictError (has assignments), return 409
6. Return success response (no data)

**Response:**
- Status: 200
- Body: `{ success: true, data: null }`

**Errors:**
- 400: Invalid UUID
- 404: Clerkship not found
- 409: Clerkship has schedule assignments
- 500: Unexpected errors

---

## Implementation Pattern

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { getClerkships, createClerkship, getClerkshipsBySpecialty } from '$lib/features/clerkships/services/clerkship-service';
import { createClerkshipSchema } from '$lib/features/clerkships/schemas';
import { ConflictError, NotFoundError } from '$lib/api/errors';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const specialty = url.searchParams.get('specialty');

    const clerkships = specialty
      ? await getClerkshipsBySpecialty(db, specialty)
      : await getClerkships(db);

    return successResponse(clerkships);
  } catch (error) {
    return handleApiError(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const validatedData = createClerkshipSchema.parse(body);
    const clerkship = await createClerkship(db, validatedData);
    return successResponse(clerkship, 201);
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

#### `/src/routes/api/clerkships/+server.test.ts`

**GET /api/clerkships:**
- ✅ Returns 200 with empty array when no clerkships
- ✅ Returns 200 with array of clerkships
- ✅ Clerkships are ordered by name
- ✅ Filters by specialty when query param provided
- ✅ Returns empty array when no matches for specialty
- ✅ Response has correct structure

**POST /api/clerkships:**
- ✅ Creates clerkship with valid data (201)
- ✅ Returns created clerkship with ID
- ✅ Returns 400 for missing name
- ✅ Returns 400 for missing specialty
- ✅ Returns 400 for missing required_days
- ✅ Returns 400 for negative required_days
- ✅ Returns 409 for duplicate name
- ✅ Creates clerkship with optional description
- ✅ Created clerkship appears in GET list

---

#### `/src/routes/api/clerkships/[id]/+server.test.ts`

**GET /api/clerkships/[id]:**
- ✅ Returns 200 with clerkship data
- ✅ Returns 404 for non-existent clerkship
- ✅ Returns 400 for invalid UUID format
- ✅ Response has correct structure

**PATCH /api/clerkships/[id]:**
- ✅ Updates clerkship name (200)
- ✅ Updates clerkship specialty (200)
- ✅ Updates clerkship required_days (200)
- ✅ Updates clerkship description (200)
- ✅ Updates multiple fields (200)
- ✅ Returns updated clerkship data
- ✅ Returns 404 for non-existent clerkship
- ✅ Returns 400 for invalid UUID
- ✅ Returns 409 for duplicate name
- ✅ Returns 400 for empty update object
- ✅ Allows keeping same name

**DELETE /api/clerkships/[id]:**
- ✅ Deletes clerkship successfully (200)
- ✅ Clerkship no longer appears in GET list
- ✅ Returns 404 for non-existent clerkship
- ✅ Returns 400 for invalid UUID
- ✅ Returns 409 when clerkship has assignments

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

4. **Error Cases:**
   - Test all error conditions
   - Verify error response format
   - Check appropriate status codes

---

## Acceptance Criteria

- [ ] GET /api/clerkships endpoint implemented
- [ ] POST /api/clerkships endpoint implemented
- [ ] GET /api/clerkships/[id] endpoint implemented
- [ ] PATCH /api/clerkships/[id] endpoint implemented
- [ ] DELETE /api/clerkships/[id] endpoint implemented
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
// List all clerkships
const response = await fetch('/api/clerkships');
const { data: clerkships } = await response.json();

// Filter by specialty
const response = await fetch('/api/clerkships?specialty=Internal Medicine');
const { data: internMedClerkships } = await response.json();

// Create clerkship
const response = await fetch('/api/clerkships', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Internal Medicine',
    specialty: 'Internal Medicine',
    required_days: 28,
    description: 'Four-week rotation'
  })
});

// Update clerkship
const response = await fetch('/api/clerkships/123', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    required_days: 56
  })
});

// Delete clerkship
await fetch('/api/clerkships/123', {
  method: 'DELETE'
});
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Database instance (`db`) imported at top of file
- Consistent error handling pattern across all endpoints
- Query parameters use `url.searchParams.get()`
- Consider rate limiting for production

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [SvelteKit RequestHandler](https://kit.svelte.dev/docs/types#public-types-requesthandler)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [REST API Best Practices](https://restfulapi.net/)
