# Step 21: Calendar - API Routes

## Overview
Implement RESTful API routes for calendar data retrieval. These routes provide access to schedule assignments with enriched data (student/preceptor/clerkship names) and support filtering by various criteria.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 20: Calendar Data - Service Layer

## Requirements

### API Endpoints
- `GET /api/calendar` - Get calendar events with filters

### Query Parameters
- `start_date` (required): Start date for calendar view
- `end_date` (required): End date for calendar view
- `student_id` (optional): Filter by student
- `preceptor_id` (optional): Filter by preceptor
- `clerkship_id` (optional): Filter by clerkship

### Response Format
- Use standardized response helpers
- Return calendar events array
- Include summary metadata
- Type-safe response bodies

### Error Handling
- Validate query parameters
- Handle invalid date formats
- Return user-friendly error messages

## Implementation Details

### File Structure
```
/src/routes/api/calendar/
├── +server.ts              # GET endpoint (NEW)
└── +server.test.ts         # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/calendar/+server.ts`

Calendar data retrieval endpoint.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;   // Get calendar events
```

---

#### GET Handler - Get Calendar Events

**Logic:**
1. Extract query parameters (start_date, end_date, filters)
2. Validate required parameters (start_date, end_date)
3. Validate date formats
4. Build filters object
5. Call `getCalendarEvents()` service function
6. Call `getScheduleSummary()` for metadata
7. Return success response with events and summary

**Query Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD
- `student_id` (optional): Student UUID
- `preceptor_id` (optional): Preceptor UUID
- `clerkship_id` (optional): Clerkship UUID

**Response:**
- Status: 200
- Body: `{ success: true, data: CalendarResponse }`

**Response Type:**
```typescript
interface CalendarResponse {
  events: CalendarEvent[];
  summary: {
    total_assignments: number;
    active_students: number;
    active_preceptors: number;
    assignments_by_clerkship: { clerkship_name: string; count: number }[];
  };
}
```

**Errors:**
- 400: Missing required parameters
- 400: Invalid date format
- 400: Invalid UUID format
- 500: Unexpected errors

**Example Request:**
```
GET /api/calendar?start_date=2024-01-01&end_date=2024-12-31&student_id=student-123
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "assignment-123",
        "title": "John Doe - Internal Medicine",
        "start": "2024-01-01",
        "end": "2024-01-28",
        "description": "with Dr. Smith",
        "color": "#3b82f6",
        "assignment": {
          "id": "assignment-123",
          "student_id": "student-123",
          "student_name": "John Doe",
          "student_email": "john@example.com",
          "preceptor_id": "preceptor-456",
          "preceptor_name": "Dr. Smith",
          "preceptor_email": "smith@example.com",
          "preceptor_specialty": "Internal Medicine",
          "clerkship_id": "clerkship-789",
          "clerkship_name": "Internal Medicine",
          "clerkship_specialty": "Internal Medicine",
          "clerkship_required_days": 28,
          "start_date": "2024-01-01",
          "end_date": "2024-01-28",
          "created_at": "2024-01-01T00:00:00Z",
          "updated_at": "2024-01-01T00:00:00Z"
        }
      }
    ],
    "summary": {
      "total_assignments": 1,
      "active_students": 1,
      "active_preceptors": 1,
      "assignments_by_clerkship": [
        { "clerkship_name": "Internal Medicine", "count": 1 }
      ]
    }
  }
}
```

---

## Implementation

```typescript
import { db } from '$lib/db';
import { successResponse, errorResponse, handleApiError } from '$lib/api';
import { getCalendarEvents, getScheduleSummary } from '$lib/features/schedules/services/calendar-service';
import type { CalendarFilters } from '$lib/features/schedules/types';
import { z } from 'zod';

const calendarQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  student_id: z.string().uuid().optional(),
  preceptor_id: z.string().uuid().optional(),
  clerkship_id: z.string().uuid().optional(),
}).refine(data => data.start_date <= data.end_date, {
  message: 'start_date must be before or equal to end_date',
});

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Extract and validate query parameters
    const params = {
      start_date: url.searchParams.get('start_date'),
      end_date: url.searchParams.get('end_date'),
      student_id: url.searchParams.get('student_id') || undefined,
      preceptor_id: url.searchParams.get('preceptor_id') || undefined,
      clerkship_id: url.searchParams.get('clerkship_id') || undefined,
    };

    // Validate required parameters
    if (!params.start_date || !params.end_date) {
      return errorResponse('start_date and end_date are required', 400);
    }

    // Validate all parameters
    const validated = calendarQuerySchema.parse(params);

    // Build filters
    const filters: CalendarFilters = {
      start_date: validated.start_date,
      end_date: validated.end_date,
      student_id: validated.student_id,
      preceptor_id: validated.preceptor_id,
      clerkship_id: validated.clerkship_id,
    };

    // Fetch calendar events and summary
    const [events, summary] = await Promise.all([
      getCalendarEvents(db, filters),
      getScheduleSummary(db, validated.start_date, validated.end_date),
    ]);

    return successResponse({
      events,
      summary,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.errors[0].message, 400);
    }
    return handleApiError(error);
  }
};
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/calendar/+server.test.ts`

**GET /api/calendar:**
- ✅ Returns 200 with events and summary
- ✅ Returns 400 when start_date missing
- ✅ Returns 400 when end_date missing
- ✅ Returns 400 for invalid date format
- ✅ Returns 400 for start_date > end_date
- ✅ Returns 400 for invalid student_id UUID
- ✅ Returns 400 for invalid preceptor_id UUID
- ✅ Returns 400 for invalid clerkship_id UUID
- ✅ Filters by student_id correctly
- ✅ Filters by preceptor_id correctly
- ✅ Filters by clerkship_id correctly
- ✅ Filters by date range correctly
- ✅ Combines multiple filters correctly
- ✅ Returns empty events array when no matches
- ✅ Summary counts are accurate
- ✅ Response has correct structure

**Data Validation:**
- ✅ Events include all enriched data
- ✅ Event titles are formatted correctly
- ✅ Event descriptions are formatted correctly
- ✅ Summary totals match event count
- ✅ Clerkship breakdown is accurate

---

### Testing Strategy

1. **Setup:**
   - Use test database
   - Seed with students, preceptors, clerkships, assignments
   - Reset between tests

2. **Query Parameter Testing:**
   - Test all required parameters
   - Test all optional parameters
   - Test parameter combinations
   - Test invalid values

3. **Filtering:**
   - Verify each filter works independently
   - Verify filters combine correctly
   - Test edge cases (no results, all results)

4. **Response Validation:**
   - Verify event structure
   - Verify summary calculations
   - Verify enriched data present

---

## Acceptance Criteria

- [ ] GET /api/calendar endpoint implemented
- [ ] All query parameters validated
- [ ] Required parameters enforced
- [ ] Date format validation working
- [ ] UUID format validation working
- [ ] Filtering by student/preceptor/clerkship working
- [ ] Calendar events include enriched data
- [ ] Summary statistics calculated correctly
- [ ] All integration tests passing
- [ ] Response structure matches specification
- [ ] Error messages are user-friendly

---

## Usage Example

```typescript
// Get calendar events for all students
const response = await fetch('/api/calendar?start_date=2024-01-01&end_date=2024-12-31');
const { data } = await response.json();
console.log('Events:', data.events);
console.log('Summary:', data.summary);

// Get calendar events for specific student
const response = await fetch('/api/calendar?start_date=2024-01-01&end_date=2024-12-31&student_id=student-123');

// Get calendar events for specific preceptor
const response = await fetch('/api/calendar?start_date=2024-01-01&end_date=2024-12-31&preceptor_id=preceptor-456');

// Get calendar events for specific clerkship
const response = await fetch('/api/calendar?start_date=2024-01-01&end_date=2024-12-31&clerkship_id=clerkship-789');

// Combine filters
const response = await fetch('/api/calendar?start_date=2024-01-01&end_date=2024-03-31&student_id=student-123&clerkship_id=clerkship-789');
```

---

## Notes

- Use SvelteKit's `RequestHandler` type for type safety
- Query parameters accessed via `url.searchParams.get()`
- Validate all inputs before passing to service layer
- Return both events and summary for dashboard display
- Consider caching for frequently accessed date ranges
- Consider pagination for large result sets (future)
- Consider adding `view` parameter (month, week, day) for pre-formatted grouping

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [SvelteKit URL](https://kit.svelte.dev/docs/web-standards#url-apis)
- [Query String Parsing](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- [Zod Validation](https://zod.dev/)
