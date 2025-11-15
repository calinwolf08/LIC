# Step 05: Students - API Routes

## Overview
Implement RESTful API routes for student CRUD operations. These routes handle HTTP requests, validate input, call service functions, and return properly formatted responses.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 04: Students - Service Layer

## Requirements

### API Endpoints
- `GET /api/students` - List all students
- `GET /api/students/[id]` - Get single student
- `POST /api/students` - Create new student
- `PATCH /api/students/[id]` - Update student
- `DELETE /api/students/[id]` - Delete student

### Response Format
- Use standardized response helpers from Step 03
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
/src/routes/api/students/
├── +server.ts              # GET (list), POST (create) (NEW)
├── +server.test.ts         # Integration tests (NEW)
├── [id]/
│   ├── +server.ts          # GET, PATCH, DELETE (NEW)
│   └── +server.test.ts     # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/students/+server.ts`

Handles collection-level operations (list all, create).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // List all students
export const POST: RequestHandler;  // Create student
```

---

#### GET Handler - List All Students

**Logic:**
1. Call `getStudents(db)` service function
2. Return success response with students array
3. Handle any errors

**Response:**
- Status: 200
- Body: `{ success: true, data: StudentsTable[] }`

**Errors:**
- Status: 500 for unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "123-456-789",
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST Handler - Create Student

**Logic:**
1. Parse JSON body from request
2. Validate input using `createStudentSchema`
3. If validation fails, return validation error response
4. Call `createStudent(db, validatedData)` service function
5. If ConflictError (email exists), return 409 error
6. Return success response with created student

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Response:**
- Status: 201
- Body: `{ success: true, data: StudentsTable }`

**Errors:**
- 400: Validation error (invalid input)
- 409: Conflict (email already exists)
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "123-456-789",
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### 2. `/src/routes/api/students/[id]/+server.ts`

Handles individual student operations (get, update, delete).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;     // Get single student
export const PATCH: RequestHandler;   // Update student
export const DELETE: RequestHandler;  // Delete student
```

---

#### GET Handler - Get Single Student

**Logic:**
1. Extract student ID from URL params
2. Validate ID is valid UUID
3. Call `getStudentById(db, id)` service function
4. If null, return 404 NotFoundError
5. Return success response with student

**Response:**
- Status: 200
- Body: `{ success: true, data: StudentsTable }`

**Errors:**
- 400: Invalid UUID format
- 404: Student not found
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "123-456-789",
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

#### PATCH Handler - Update Student

**Logic:**
1. Extract student ID from URL params
2. Validate ID is valid UUID
3. Parse JSON body from request
4. Validate input using `updateStudentSchema`
5. If validation fails, return validation error response
6. Call `updateStudent(db, id, validatedData)` service function
7. If NotFoundError, return 404
8. If ConflictError (email exists), return 409
9. Return success response with updated student

**Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: StudentsTable }`

**Errors:**
- 400: Validation error or invalid UUID
- 404: Student not found
- 409: Conflict (email already exists)
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "123-456-789",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-02T00:00:00Z"
  }
}
```

---

#### DELETE Handler - Delete Student

**Logic:**
1. Extract student ID from URL params
2. Validate ID is valid UUID
3. Call `deleteStudent(db, id)` service function
4. If NotFoundError, return 404
5. If ConflictError (has assignments), return 409
6. Return success response (no data)

**Response:**
- Status: 200
- Body: `{ success: true, data: null }`

**Errors:**
- 400: Invalid UUID
- 404: Student not found
- 409: Student has schedule assignments
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": null
}
```

---

## Implementation Pattern

All handlers should follow this pattern:

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { getStudents, createStudent } from '$lib/features/students/services/student-service';
import { createStudentSchema } from '$lib/features/students/schemas';
import { ConflictError, NotFoundError } from '$lib/api/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse and validate input
    const body = await request.json();
    const validatedData = createStudentSchema.parse(body);

    // Call service function
    const student = await createStudent(db, validatedData);

    // Return success response
    return successResponse(student, 201);

  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }

    // Handle business logic errors
    if (error instanceof ConflictError) {
      return errorResponse(error.message, 409);
    }

    // Handle unexpected errors
    return handleApiError(error);
  }
};
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/students/+server.test.ts`

**GET /api/students:**
- ✅ Returns 200 with empty array when no students
- ✅ Returns 200 with array of students
- ✅ Students are ordered by name
- ✅ Response has correct structure

**POST /api/students:**
- ✅ Creates student with valid data (201)
- ✅ Returns created student with ID
- ✅ Returns 400 for missing name
- ✅ Returns 400 for missing email
- ✅ Returns 400 for invalid email format
- ✅ Returns 400 for short name (< 2 chars)
- ✅ Returns 409 for duplicate email
- ✅ Created student appears in GET list

---

#### `/src/routes/api/students/[id]/+server.test.ts`

**GET /api/students/[id]:**
- ✅ Returns 200 with student data
- ✅ Returns 404 for non-existent student
- ✅ Returns 400 for invalid UUID format
- ✅ Response has correct structure

**PATCH /api/students/[id]:**
- ✅ Updates student name (200)
- ✅ Updates student email (200)
- ✅ Updates both name and email (200)
- ✅ Returns updated student data
- ✅ Returns 404 for non-existent student
- ✅ Returns 400 for invalid UUID
- ✅ Returns 400 for invalid email format
- ✅ Returns 409 for duplicate email
- ✅ Returns 400 for empty update object
- ✅ Allows keeping same email

**DELETE /api/students/[id]:**
- ✅ Deletes student successfully (200)
- ✅ Student no longer appears in GET list
- ✅ Returns 404 for non-existent student
- ✅ Returns 400 for invalid UUID
- ✅ Returns 409 when student has assignments

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

3. **Data Validation:**
   - Verify response structure matches types
   - Check that created/updated data persists
   - Verify deletions actually remove data

4. **Error Cases:**
   - Test all error conditions
   - Verify error response format
   - Check appropriate status codes

---

## Acceptance Criteria

- [ ] GET /api/students endpoint implemented
- [ ] POST /api/students endpoint implemented
- [ ] GET /api/students/[id] endpoint implemented
- [ ] PATCH /api/students/[id] endpoint implemented
- [ ] DELETE /api/students/[id] endpoint implemented
- [ ] All endpoints use service functions (no direct DB access)
- [ ] All endpoints use standardized response helpers
- [ ] Proper error handling for all edge cases
- [ ] Validation errors return 400 with details
- [ ] All integration tests passing
- [ ] Response types match expected structure
- [ ] Endpoints can be called from client code

---

## Usage Example

After completion, client code can use the API:

```typescript
// List all students
const response = await fetch('/api/students');
const { data: students } = await response.json();

// Create student
const response = await fetch('/api/students', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
});
const { data: newStudent } = await response.json();

// Update student
const response = await fetch('/api/students/123-456-789', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'newemail@example.com'
  })
});

// Delete student
await fetch('/api/students/123-456-789', {
  method: 'DELETE'
});
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Database instance (`db`) imported at top of file
- Consistent error handling pattern across all endpoints
- Response format consistent with API standards
- Consider rate limiting for production
- Log errors for debugging but don't expose internals to client

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [SvelteKit RequestHandler](https://kit.svelte.dev/docs/types#public-types-requesthandler)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [REST API Best Practices](https://restfulapi.net/)
