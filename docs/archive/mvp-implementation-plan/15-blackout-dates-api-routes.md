# Step 15: Blackout Dates - API Routes

## Overview
Implement RESTful API routes for blackout date operations. These routes handle HTTP requests for managing system-wide blackout dates (holidays, breaks, non-teaching days).

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 14: Blackout Dates - Service Layer

## Requirements

### API Endpoints
- `GET /api/blackout-dates` - List all blackout dates
- `POST /api/blackout-dates` - Create new blackout date
- `DELETE /api/blackout-dates/[id]` - Delete blackout date

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
/src/routes/api/blackout-dates/
├── +server.ts              # GET (list), POST (create) (NEW)
├── +server.test.ts         # Integration tests (NEW)
├── [id]/
│   ├── +server.ts          # DELETE (NEW)
│   └── +server.test.ts     # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/blackout-dates/+server.ts`

Handles collection-level operations (list all, create).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // List all blackout dates
export const POST: RequestHandler;  // Create blackout date
```

---

#### GET Handler - List All Blackout Dates

**Logic:**
1. Optionally filter by date range (query params)
2. Call appropriate service function
3. Return success response with blackout dates array

**Query Parameters:**
- `start_date` (optional): Filter start date (YYYY-MM-DD)
- `end_date` (optional): Filter end date (YYYY-MM-DD)

**Response:**
- Status: 200
- Body: `{ success: true, data: BlackoutDatesTable[] }`

**Errors:**
- 400: Invalid date format
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "123-456-789",
      "start_date": "2024-12-25",
      "end_date": "2024-12-26",
      "reason": "Christmas Holiday",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST Handler - Create Blackout Date

**Logic:**
1. Parse JSON body from request
2. Validate input using `createBlackoutDateSchema`
3. If validation fails, return validation error response
4. Call `createBlackoutDate(db, validatedData)` service function
5. Return success response with created blackout date

**Request Body:**
```json
{
  "start_date": "2024-12-25",
  "end_date": "2024-12-26",
  "reason": "Christmas Holiday"
}
```

**Response:**
- Status: 201
- Body: `{ success: true, data: BlackoutDatesTable }`

**Errors:**
- 400: Validation error (invalid input)
- 500: Unexpected errors

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "123-456-789",
    "start_date": "2024-12-25",
    "end_date": "2024-12-26",
    "reason": "Christmas Holiday",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### 2. `/src/routes/api/blackout-dates/[id]/+server.ts`

Handles individual blackout date operations (delete only - no update needed).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler;  // Delete blackout date
```

---

#### DELETE Handler - Delete Blackout Date

**Logic:**
1. Extract blackout date ID from URL params
2. Validate ID is valid UUID
3. Call `deleteBlackoutDate(db, id)` service function
4. If NotFoundError, return 404
5. Return success response (no data)

**Response:**
- Status: 200
- Body: `{ success: true, data: null }`

**Errors:**
- 400: Invalid UUID
- 404: Blackout date not found
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

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { getBlackoutDates, createBlackoutDate, getBlackoutDatesByRange } from '$lib/features/blackout-dates/services/blackout-date-service';
import { createBlackoutDateSchema, dateRangeSchema } from '$lib/features/blackout-dates/schemas';
import { NotFoundError } from '$lib/api/errors';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    let blackoutDates;
    if (startDate && endDate) {
      const dateRange = dateRangeSchema.parse({ start_date: startDate, end_date: endDate });
      blackoutDates = await getBlackoutDatesByRange(db, dateRange);
    } else {
      blackoutDates = await getBlackoutDates(db);
    }

    return successResponse(blackoutDates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    return handleApiError(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const validatedData = createBlackoutDateSchema.parse(body);
    const blackoutDate = await createBlackoutDate(db, validatedData);
    return successResponse(blackoutDate, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    return handleApiError(error);
  }
};
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/blackout-dates/+server.test.ts`

**GET /api/blackout-dates:**
- ✅ Returns 200 with empty array when no blackout dates
- ✅ Returns 200 with array of blackout dates
- ✅ Blackout dates are ordered by start_date
- ✅ Filters by date range when query params provided
- ✅ Returns empty array when no matches for date range
- ✅ Returns 400 for invalid date format
- ✅ Response has correct structure

**POST /api/blackout-dates:**
- ✅ Creates blackout date with valid data (201)
- ✅ Returns created blackout date with ID
- ✅ Returns 400 for missing start_date
- ✅ Returns 400 for missing end_date
- ✅ Returns 400 for missing reason
- ✅ Returns 400 for invalid date format
- ✅ Returns 400 for start_date > end_date
- ✅ Allows start_date = end_date (single day)
- ✅ Allows overlapping blackout dates
- ✅ Created blackout date appears in GET list

---

#### `/src/routes/api/blackout-dates/[id]/+server.test.ts`

**DELETE /api/blackout-dates/[id]:**
- ✅ Deletes blackout date successfully (200)
- ✅ Blackout date no longer appears in GET list
- ✅ Returns 404 for non-existent blackout date
- ✅ Returns 400 for invalid UUID

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

3. **Date Range Testing:**
   - Test filtering functionality
   - Test invalid date formats
   - Test boundary conditions

4. **Overlap Testing:**
   - Verify overlapping blackout dates are allowed
   - Test multiple overlaps

---

## Acceptance Criteria

- [ ] GET /api/blackout-dates endpoint implemented
- [ ] POST /api/blackout-dates endpoint implemented
- [ ] DELETE /api/blackout-dates/[id] endpoint implemented
- [ ] All endpoints use service functions (no direct DB access)
- [ ] All endpoints use standardized response helpers
- [ ] Proper error handling for all edge cases
- [ ] Validation errors return 400 with details
- [ ] All integration tests passing
- [ ] Response types match expected structure
- [ ] Date range filtering works correctly
- [ ] Overlapping blackout dates are allowed

---

## Usage Example

```typescript
// List all blackout dates
const response = await fetch('/api/blackout-dates');
const { data: blackoutDates } = await response.json();

// Filter by date range
const response = await fetch('/api/blackout-dates?start_date=2024-01-01&end_date=2024-12-31');
const { data: yearBlackouts } = await response.json();

// Create blackout date
const response = await fetch('/api/blackout-dates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    start_date: '2024-12-25',
    end_date: '2024-12-26',
    reason: 'Christmas Holiday'
  })
});

// Delete blackout date
await fetch('/api/blackout-dates/123', {
  method: 'DELETE'
});
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Database instance (`db`) imported at top of file
- Consistent error handling pattern across all endpoints
- Query parameters use `url.searchParams.get()`
- No update endpoint needed (delete and recreate instead)
- Consider bulk create endpoint for importing holidays

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [SvelteKit RequestHandler](https://kit.svelte.dev/docs/types#public-types-requesthandler)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [REST API Best Practices](https://restfulapi.net/)
