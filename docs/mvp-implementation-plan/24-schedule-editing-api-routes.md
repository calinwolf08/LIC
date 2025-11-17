# Step 24: Schedule Editing - API Routes

## Overview
Implement RESTful API routes for manual schedule editing operations. These routes provide endpoints for updating assignments, reassigning students/preceptors, and regenerating schedules.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 18: Schedule Assignments - Service Layer
- ✅ Step 23: Schedule Editing - Service Layer

## Requirements

### API Endpoints
- `PATCH /api/schedules/assignments/[id]` - Update single assignment
- `POST /api/schedules/assignments/[id]/reassign` - Reassign to different preceptor
- `POST /api/schedules/assignments/swap` - Swap two assignments
- `DELETE /api/schedules` - Clear all assignments (for regeneration)

### Request Validation
- Validate all inputs
- Support dry-run parameter for previews
- Validate UUIDs
- Validate dates

### Response Format
- Return validation errors with details
- Return conflict information
- Use standardized response helpers

## Implementation Details

### File Structure
```
/src/routes/api/schedules/
├── assignments/
│   ├── [id]/
│   │   ├── +server.ts                # PATCH, DELETE (NEW)
│   │   ├── +server.test.ts           # Integration tests (NEW)
│   │   └── reassign/
│   │       ├── +server.ts            # POST reassign (NEW)
│   │       └── +server.test.ts       # Integration tests (NEW)
│   └── swap/
│       ├── +server.ts                # POST swap (NEW)
│       └── +server.test.ts           # Integration tests (NEW)
├── +server.ts                        # DELETE all (NEW)
└── +server.test.ts                   # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/schedules/assignments/[id]/+server.ts`

Update or delete individual assignment.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler;   // Update assignment
export const DELETE: RequestHandler;  // Delete assignment
```

---

#### PATCH Handler - Update Assignment

**Logic:**
1. Extract assignment ID from URL params
2. Parse JSON body
3. Validate input using `updateAssignmentSchema`
4. Call `updateAssignment()` service function
5. Return updated assignment or validation errors

**Request Body:**
```json
{
  "start_date": "2024-02-01",
  "end_date": "2024-02-28",
  "preceptor_id": "preceptor-456"
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: ScheduleAssignmentsTable }`

**Errors:**
- 400: Validation error
- 404: Assignment not found
- 409: Conflict (validation failed)
- 500: Unexpected errors

---

#### DELETE Handler - Delete Assignment

**Logic:**
1. Extract assignment ID from URL params
2. Call `deleteAssignment()` service function
3. Return success response

**Response:**
- Status: 200
- Body: `{ success: true, data: null }`

**Errors:**
- 404: Assignment not found
- 500: Unexpected errors

---

### 2. `/src/routes/api/schedules/assignments/[id]/reassign/+server.ts`

Reassign student to different preceptor.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler;  // Reassign to different preceptor
```

---

#### POST Handler - Reassign

**Logic:**
1. Extract assignment ID from URL params
2. Parse JSON body (new_preceptor_id, dry_run)
3. Validate inputs
4. Call `reassignToPreceptor()` service function
5. Return result with validation status

**Request Body:**
```json
{
  "new_preceptor_id": "preceptor-456",
  "dry_run": true
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: ReassignResult }`

**Response Type:**
```typescript
interface ReassignResult {
  valid: boolean;
  errors: string[];
  assignment?: ScheduleAssignmentsTable;
}
```

**Errors:**
- 400: Validation error
- 404: Assignment or preceptor not found
- 500: Unexpected errors

**Example Response (Success):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "assignment": {
      "id": "assignment-123",
      "student_id": "student-123",
      "preceptor_id": "preceptor-456",
      "clerkship_id": "clerkship-789",
      "start_date": "2024-01-01",
      "end_date": "2024-01-28",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T00:00:00Z"
    }
  }
}
```

**Example Response (Validation Failed):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      "Preceptor has conflicting assignment during this period",
      "Preceptor specialty does not match clerkship specialty"
    ]
  }
}
```

---

### 3. `/src/routes/api/schedules/assignments/swap/+server.ts`

Swap two assignments.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler;  // Swap two assignments
```

---

#### POST Handler - Swap Assignments

**Logic:**
1. Parse JSON body (assignment_id_1, assignment_id_2, dry_run)
2. Validate UUIDs
3. Call `swapAssignments()` service function
4. Return result with validation status

**Request Body:**
```json
{
  "assignment_id_1": "assignment-123",
  "assignment_id_2": "assignment-456",
  "dry_run": false
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: SwapResult }`

**Response Type:**
```typescript
interface SwapResult {
  valid: boolean;
  errors: string[];
  assignments?: ScheduleAssignmentsTable[];
}
```

**Errors:**
- 400: Validation error
- 404: Assignment not found
- 500: Unexpected errors

---

### 4. `/src/routes/api/schedules/+server.ts`

Clear all assignments (for regeneration).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler;  // Clear all assignments
```

---

#### DELETE Handler - Clear All Assignments

**Logic:**
1. Confirm operation (could add confirmation parameter)
2. Delete all assignments from database
3. Return success response with count

**Response:**
- Status: 200
- Body: `{ success: true, data: { deleted_count: number } }`

**Errors:**
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": {
    "deleted_count": 150
  }
}
```

---

## Implementation Pattern

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { updateAssignment } from '$lib/features/schedules/services/assignment-service';
import { reassignToPreceptor } from '$lib/features/schedules/services/editing-service';
import { updateAssignmentSchema } from '$lib/features/schedules/schemas';
import { NotFoundError, ConflictError, ValidationError } from '$lib/api/errors';
import { z } from 'zod';

// PATCH /api/schedules/assignments/[id]
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const validatedData = updateAssignmentSchema.parse(body);
    const assignment = await updateAssignment(db, params.id, validatedData);
    return successResponse(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    if (error instanceof NotFoundError) {
      return errorResponse(error.message, 404);
    }
    if (error instanceof ConflictError) {
      return errorResponse(error.message, 409);
    }
    return handleApiError(error);
  }
};

// POST /api/schedules/assignments/[id]/reassign
const reassignSchema = z.object({
  new_preceptor_id: z.string().uuid(),
  dry_run: z.boolean().default(false),
});

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { new_preceptor_id, dry_run } = reassignSchema.parse(body);

    const result = await reassignToPreceptor(
      db,
      params.id,
      new_preceptor_id,
      dry_run
    );

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    if (error instanceof NotFoundError) {
      return errorResponse(error.message, 404);
    }
    return handleApiError(error);
  }
};
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/schedules/assignments/[id]/+server.test.ts`

**PATCH /api/schedules/assignments/[id]:**
- ✅ Updates assignment successfully (200)
- ✅ Returns 404 for non-existent assignment
- ✅ Returns 400 for invalid input
- ✅ Returns 409 for validation errors
- ✅ Updates updated_at timestamp
- ✅ Validates all constraints

**DELETE /api/schedules/assignments/[id]:**
- ✅ Deletes assignment successfully (200)
- ✅ Returns 404 for non-existent assignment
- ✅ Assignment no longer in database after delete

---

#### `/src/routes/api/schedules/assignments/[id]/reassign/+server.test.ts`

**POST /api/schedules/assignments/[id]/reassign:**
- ✅ Reassigns successfully with valid data (200)
- ✅ Returns validation result for dry run
- ✅ Doesn't save changes in dry run mode
- ✅ Returns 404 for non-existent assignment
- ✅ Returns 404 for non-existent preceptor
- ✅ Returns validation errors for conflicts
- ✅ Returns validation errors for specialty mismatch
- ✅ Returns 400 for invalid UUID

---

#### `/src/routes/api/schedules/assignments/swap/+server.test.ts`

**POST /api/schedules/assignments/swap:**
- ✅ Swaps assignments successfully (200)
- ✅ Returns validation result for dry run
- ✅ Doesn't save changes in dry run mode
- ✅ Returns 404 for non-existent assignments
- ✅ Returns validation errors for invalid swaps
- ✅ Uses transaction (atomic operation)

---

#### `/src/routes/api/schedules/+server.test.ts`

**DELETE /api/schedules:**
- ✅ Deletes all assignments (200)
- ✅ Returns correct count
- ✅ Database is empty after deletion
- ✅ Can regenerate schedule after clearing

---

### Testing Strategy

1. **Setup:**
   - Use test database
   - Seed with assignments
   - Reset between tests

2. **Validation Testing:**
   - Test all constraint validations
   - Test dry run mode
   - Test error responses

3. **Transaction Testing:**
   - Verify atomic operations
   - Test rollback scenarios

---

## Acceptance Criteria

- [ ] PATCH /api/schedules/assignments/[id] endpoint implemented
- [ ] DELETE /api/schedules/assignments/[id] endpoint implemented
- [ ] POST /api/schedules/assignments/[id]/reassign endpoint implemented
- [ ] POST /api/schedules/assignments/swap endpoint implemented
- [ ] DELETE /api/schedules endpoint implemented
- [ ] All endpoints validate inputs
- [ ] Dry run mode supported where applicable
- [ ] Validation errors returned with details
- [ ] All integration tests passing
- [ ] Response structures match specification

---

## Usage Example

```typescript
// Update assignment dates
const response = await fetch('/api/schedules/assignments/123', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    start_date: '2024-02-01',
    end_date: '2024-02-28'
  })
});

// Preview reassignment
const previewResponse = await fetch('/api/schedules/assignments/123/reassign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    new_preceptor_id: 'preceptor-456',
    dry_run: true
  })
});
const { data: preview } = await previewResponse.json();

if (preview.valid) {
  // Commit reassignment
  const response = await fetch('/api/schedules/assignments/123/reassign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      new_preceptor_id: 'preceptor-456',
      dry_run: false
    })
  });
}

// Swap assignments
const response = await fetch('/api/schedules/assignments/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assignment_id_1: '123',
    assignment_id_2: '456',
    dry_run: false
  })
});

// Clear all assignments
const response = await fetch('/api/schedules', {
  method: 'DELETE'
});
const { data } = await response.json();
console.log(`Deleted ${data.deleted_count} assignments`);
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Dry run mode critical for user preview
- Clear validation error messages help users
- Consider adding confirmation for delete all
- Future: Add batch operations endpoint
- Future: Add undo/redo functionality

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [HTTP PATCH Method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PATCH)
- [REST API Best Practices](https://restfulapi.net/)
