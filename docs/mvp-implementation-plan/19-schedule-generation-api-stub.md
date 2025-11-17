# Step 19: Schedule Generation - API Route (Stub)

## Overview
Implement a stub API endpoint for schedule generation. This endpoint will validate inputs and return a placeholder response. The actual algorithm integration will happen later when the user implements the scheduling algorithm from Step 17.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 17: Schedule Algorithm Specification (documentation)
- ✅ Step 18: Schedule Assignments - Service Layer

## Requirements

### API Endpoint
- `POST /api/schedules/generate` - Trigger schedule generation

### Request Validation
- Validate start_date and end_date
- Ensure date range is valid
- Ensure entities exist (students, preceptors, clerkships)

### Response Structure
- Return assignments array (stub: empty for now)
- Return warnings array
- Return metadata (total assignments, unassigned students, etc.)

### Stub Behavior
- **MVP Implementation**: Return empty assignments array
- Validate all inputs
- Return success response
- **Future**: Integrate actual scheduling algorithm

## Implementation Details

### File Structure
```
/src/routes/api/schedules/
├── generate/
│   ├── +server.ts          # POST endpoint (NEW)
│   └── +server.test.ts     # Integration tests (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/schedules/generate/+server.ts`

Schedule generation endpoint (stub implementation).

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler;  // Generate schedule
```

---

#### POST Handler - Generate Schedule

**Logic:**
1. Parse JSON body from request
2. Validate input (start_date, end_date)
3. Verify date range is valid
4. Verify students exist in database
5. Verify preceptors exist in database
6. Verify clerkships exist in database
7. **STUB**: Return empty assignments array
8. Return success response with metadata

**Request Body:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Response:**
- Status: 200
- Body: `{ success: true, data: GenerateScheduleResult }`

**Response Type:**
```typescript
interface GenerateScheduleResult {
  assignments: ScheduleAssignmentsTable[];
  metadata: {
    total_students: number;
    total_clerkships: number;
    total_preceptors: number;
    total_assignments: number;
    fully_scheduled_students: number;
    partially_scheduled_students: number;
    unscheduled_students: number;
    start_date: string;
    end_date: string;
    generated_at: string;
  };
  warnings: string[];
}
```

**Errors:**
- 400: Validation error (invalid dates, start >= end)
- 500: Unexpected errors

**Example Response (Stub):**
```json
{
  "success": true,
  "data": {
    "assignments": [],
    "metadata": {
      "total_students": 10,
      "total_clerkships": 5,
      "total_preceptors": 15,
      "total_assignments": 0,
      "fully_scheduled_students": 0,
      "partially_scheduled_students": 0,
      "unscheduled_students": 10,
      "start_date": "2024-01-01",
      "end_date": "2024-12-31",
      "generated_at": "2024-01-01T12:00:00Z"
    },
    "warnings": [
      "Schedule generation not yet implemented (stub endpoint)"
    ]
  }
}
```

---

## Implementation

```typescript
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, handleApiError } from '$lib/api';
import { getStudents } from '$lib/features/students/services/student-service';
import { getPreceptors } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkships } from '$lib/features/clerkships/services/clerkship-service';
import { z } from 'zod';

const generateScheduleSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(data => data.start_date < data.end_date, {
  message: 'start_date must be before end_date',
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { start_date, end_date } = generateScheduleSchema.parse(body);

    // Fetch all entities
    const students = await getStudents(db);
    const preceptors = await getPreceptors(db);
    const clerkships = await getClerkships(db);

    // STUB: Algorithm not yet implemented
    // TODO: Integrate scheduling algorithm from Step 17
    const assignments: ScheduleAssignmentsTable[] = [];
    const warnings: string[] = [
      'Schedule generation not yet implemented (stub endpoint)',
    ];

    // Calculate metadata
    const metadata = {
      total_students: students.length,
      total_clerkships: clerkships.length,
      total_preceptors: preceptors.length,
      total_assignments: assignments.length,
      fully_scheduled_students: 0,
      partially_scheduled_students: 0,
      unscheduled_students: students.length,
      start_date,
      end_date,
      generated_at: new Date().toISOString(),
    };

    const result = {
      assignments,
      metadata,
      warnings,
    };

    return successResponse(result);
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

#### `/src/routes/api/schedules/generate/+server.test.ts`

**POST /api/schedules/generate:**
- ✅ Returns 200 with stub response
- ✅ Validates start_date format
- ✅ Validates end_date format
- ✅ Rejects start_date >= end_date
- ✅ Returns 400 for missing start_date
- ✅ Returns 400 for missing end_date
- ✅ Returns 400 for invalid date format
- ✅ Returns metadata with correct counts
- ✅ Returns warning about stub implementation
- ✅ Response has correct structure

**Metadata Validation:**
- ✅ total_students matches database
- ✅ total_preceptors matches database
- ✅ total_clerkships matches database
- ✅ total_assignments is 0 (stub)
- ✅ unscheduled_students equals total_students (stub)

---

### Testing Strategy

1. **Setup:**
   - Use test database
   - Seed with known entities
   - Reset between tests

2. **Validation Testing:**
   - Test all input validation rules
   - Test date format validation
   - Test date range validation

3. **Metadata Testing:**
   - Verify counts are accurate
   - Verify dates match input
   - Verify generated_at timestamp

4. **Future Testing:**
   - When algorithm is integrated, test actual scheduling
   - Test edge cases from Step 17 specification

---

## Future Implementation

**When integrating the actual algorithm:**

1. Import scheduling algorithm function
2. Fetch all required data:
   - Students
   - Preceptors (with availability)
   - Clerkships
   - Blackout dates
3. Call algorithm function with inputs
4. Validate algorithm output
5. Use `bulkCreateAssignments()` to save to database
6. Calculate accurate metadata:
   - Count fully scheduled students
   - Count partially scheduled students
   - Collect warnings from algorithm
7. Return actual results

**Example Future Implementation:**
```typescript
// Future: import actual algorithm
import { generateSchedule } from '$lib/features/schedules/algorithm';
import { bulkCreateAssignments } from '$lib/features/schedules/services/assignment-service';
import { getAvailability } from '$lib/features/preceptors/services/availability-service';
import { getBlackoutDates } from '$lib/features/blackout-dates/services/blackout-date-service';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { start_date, end_date } = generateScheduleSchema.parse(body);

    // Fetch all entities
    const students = await getStudents(db);
    const preceptors = await getPreceptors(db);
    const clerkships = await getClerkships(db);
    const blackoutDates = await getBlackoutDates(db);

    // Fetch preceptor availability
    const availability = await Promise.all(
      preceptors.map(p => getAvailability(db, p.id))
    );

    // Run algorithm
    const result = generateSchedule({
      start_date,
      end_date,
      students,
      preceptors,
      clerkships,
      blackoutDates,
      availability,
    });

    // Save assignments to database
    if (result.assignments.length > 0) {
      await bulkCreateAssignments(db, { assignments: result.assignments });
    }

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    return handleApiError(error);
  }
};
```

---

## Acceptance Criteria

- [ ] POST /api/schedules/generate endpoint implemented
- [ ] Request validation working
- [ ] Returns stub response with empty assignments
- [ ] Metadata calculation working
- [ ] Warning message indicates stub implementation
- [ ] All integration tests passing
- [ ] Response structure matches specification
- [ ] Clear TODO comments for future algorithm integration

---

## Usage Example

```typescript
// Generate schedule (stub)
const response = await fetch('/api/schedules/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    start_date: '2024-01-01',
    end_date: '2024-12-31'
  })
});

const { data } = await response.json();
console.log('Assignments:', data.assignments); // [] (stub)
console.log('Metadata:', data.metadata);
console.log('Warnings:', data.warnings);
```

---

## Notes

- This is a STUB endpoint - algorithm not yet implemented
- Validates inputs and returns proper structure
- User will implement actual algorithm later
- Clear separation between validation and algorithm logic
- Response structure designed for future algorithm output
- Consider adding progress updates for long-running schedules
- Consider adding dry-run mode to preview without saving

---

## References

- [SvelteKit API Routes](https://kit.svelte.dev/docs/routing#server)
- [Step 17: Schedule Algorithm Specification](./17-schedule-algorithm-specification.md)
- [Zod Validation](https://zod.dev/)
