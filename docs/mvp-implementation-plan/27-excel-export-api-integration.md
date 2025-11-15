# Step 27: Excel Export - API & UI Integration

## Overview
Implement the API endpoint and UI integration for Excel export functionality. This includes a download endpoint that generates and returns Excel files, and a UI button that triggers the export.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 22: Calendar - UI
- ✅ Step 26: Excel Export - Service Layer

## Requirements

### API Endpoint
- `GET /api/schedules/export` - Generate and download Excel file
- Support query parameters for filtering
- Return Excel file with proper headers
- Handle errors gracefully

### UI Integration
- Export button on calendar/schedule page
- Filter preservation (export what's visible)
- Download filename with date
- Loading state during generation
- Success/error feedback

## Implementation Details

### File Structure
```
/src/routes/api/schedules/
├── export/
│   ├── +server.ts              # GET endpoint (NEW)
│   └── +server.test.ts         # Integration tests (NEW)
/src/routes/(app)/calendar/
├── +page.svelte                # (Update - add export button)
└── components/
    └── ExportButton.svelte     # Export button component (NEW)
```

---

## Files to Create

### 1. `/src/routes/api/schedules/export/+server.ts`

Excel export API endpoint.

**Exports:**
```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler;  // Export schedule to Excel
```

---

#### GET Handler - Export Schedule

**Logic:**
1. Extract query parameters (start_date, end_date, filters)
2. Validate parameters
3. Build filters object
4. Call `generateScheduleExcel()` service function
5. Generate filename with current date
6. Return Excel buffer with download headers

**Query Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD
- `student_id` (optional): Student UUID
- `preceptor_id` (optional): Preceptor UUID
- `clerkship_id` (optional): Clerkship UUID

**Response:**
- Status: 200
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="schedule-YYYY-MM-DD.xlsx"`
- Body: Excel file buffer

**Errors:**
- 400: Missing required parameters
- 400: Invalid date format
- 500: Unexpected errors

**Example Request:**
```
GET /api/schedules/export?start_date=2024-01-01&end_date=2024-12-31
GET /api/schedules/export?start_date=2024-01-01&end_date=2024-12-31&student_id=student-123
```

---

## Implementation

```typescript
import { db } from '$lib/db';
import { errorResponse, handleApiError } from '$lib/api';
import { generateScheduleExcel } from '$lib/features/schedules/services/export-service';
import type { CalendarFilters } from '$lib/features/schedules/types';
import { z } from 'zod';

const exportQuerySchema = z.object({
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
    const validated = exportQuerySchema.parse(params);

    // Build filters
    const filters: CalendarFilters = {
      start_date: validated.start_date,
      end_date: validated.end_date,
      student_id: validated.student_id,
      preceptor_id: validated.preceptor_id,
      clerkship_id: validated.clerkship_id,
    };

    // Generate Excel file
    const buffer = await generateScheduleExcel(db, filters);

    // Generate filename with current date
    const filename = `schedule-${new Date().toISOString().split('T')[0]}.xlsx`;

    // Return Excel file with download headers
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
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

### 2. `/src/routes/(app)/calendar/components/ExportButton.svelte`

Export button component with loading state.

**Props:**
```typescript
export let filters: CalendarFilters;
```

**Features:**
- Export button
- Loading state during generation
- Success/error toasts
- Triggers browser download

**Implementation:**
```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Download } from 'lucide-svelte';
  import { toast } from '$lib/components/ui/toast';
  import type { CalendarFilters } from '$lib/features/schedules/types';

  export let filters: CalendarFilters;

  let isExporting = false;

  async function handleExport() {
    isExporting = true;

    try {
      // Build query string
      let queryParams = `start_date=${filters.start_date}&end_date=${filters.end_date}`;
      if (filters.student_id) queryParams += `&student_id=${filters.student_id}`;
      if (filters.preceptor_id) queryParams += `&preceptor_id=${filters.preceptor_id}`;
      if (filters.clerkship_id) queryParams += `&clerkship_id=${filters.clerkship_id}`;

      // Fetch Excel file
      const response = await fetch(`/api/schedules/export?${queryParams}`);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'schedule.xlsx';

      // Download file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Schedule exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export schedule');
    } finally {
      isExporting = false;
    }
  }
</script>

<Button on:click={handleExport} disabled={isExporting} variant="outline">
  <Download class="mr-2 h-4 w-4" />
  {isExporting ? 'Exporting...' : 'Export to Excel'}
</Button>
```

---

### 3. Update `/src/routes/(app)/calendar/+page.svelte`

Add export button to calendar page.

**Add to header:**
```svelte
<div class="flex gap-4">
  <ExportButton {filters} />
  <Button on:click={goToToday}>Today</Button>
</div>
```

**Import:**
```svelte
<script>
  import ExportButton from './components/ExportButton.svelte';
</script>
```

---

## Testing Requirements

### Integration Tests

#### `/src/routes/api/schedules/export/+server.test.ts`

**GET /api/schedules/export:**
- ✅ Returns 200 with Excel file
- ✅ Returns 400 when start_date missing
- ✅ Returns 400 when end_date missing
- ✅ Returns 400 for invalid date format
- ✅ Returns 400 for start_date > end_date
- ✅ Sets correct Content-Type header
- ✅ Sets correct Content-Disposition header
- ✅ Filename includes current date
- ✅ Filters by student_id correctly
- ✅ Filters by preceptor_id correctly
- ✅ Filters by clerkship_id correctly
- ✅ Generated file is valid Excel
- ✅ File contains expected data

**File Validation:**
- ✅ Can open exported file in Excel
- ✅ All worksheets present
- ✅ Data matches database
- ✅ Formatting applied correctly

---

### Component Tests

#### ExportButton.svelte
- ✅ Renders export button
- ✅ Shows loading state during export
- ✅ Triggers download on click
- ✅ Shows success toast on successful export
- ✅ Shows error toast on failed export
- ✅ Button disabled during export

---

### Testing Strategy

1. **Setup:**
   - Use test database
   - Seed with assignments
   - Reset between tests

2. **API Testing:**
   - Test all query parameters
   - Verify file generation
   - Verify headers

3. **File Testing:**
   - Parse generated Excel
   - Verify content
   - Verify formatting

4. **UI Testing:**
   - Test button click
   - Verify download triggered
   - Test error handling

---

## Acceptance Criteria

- [ ] GET /api/schedules/export endpoint implemented
- [ ] Excel file generated and returned
- [ ] Correct Content-Type and Content-Disposition headers
- [ ] Filename includes date
- [ ] Filtering works correctly
- [ ] ExportButton component implemented
- [ ] Export button on calendar page
- [ ] Loading state during export
- [ ] Success/error toasts working
- [ ] Browser download triggered
- [ ] All integration tests passing
- [ ] Generated files are valid Excel

---

## Usage Example

```typescript
// Direct API call (browser)
window.open('/api/schedules/export?start_date=2024-01-01&end_date=2024-12-31');

// Using fetch with filters
const filters = {
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  student_id: 'student-123'
};

const queryString = new URLSearchParams(filters).toString();
const response = await fetch(`/api/schedules/export?${queryString}`);
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'schedule.xlsx';
a.click();
```

User workflow:
1. View calendar with filters applied
2. Click "Export to Excel" button
3. Button shows "Exporting..." loading state
4. Excel file generates on server
5. Browser downloads file automatically
6. Success toast appears
7. User opens file in Excel

---

## Notes

- Use proper MIME type for Excel files
- Content-Disposition header triggers browser download
- Generate filename with date for clarity
- Preserve calendar filters in export
- Consider adding export format options (CSV, PDF) in future
- Large exports may take time - consider progress indicator

---

## References

- [Excel MIME Type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types)
- [Content-Disposition Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
- [File Download in Browser](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- [SvelteKit Responses](https://kit.svelte.dev/docs/routing#server)
