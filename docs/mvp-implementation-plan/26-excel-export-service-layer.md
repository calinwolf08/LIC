# Step 26: Excel Export - Service Layer

## Overview
Implement the service layer for exporting schedule data to Excel format. This includes generating formatted Excel workbooks with schedule assignments, using the ExcelJS library for file generation and formatting.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 20: Calendar Data - Service Layer

## Requirements

### Excel Generation
Implement functions to create Excel workbooks:
- Export all assignments for a date range
- Format with headers and styling
- Multiple worksheets (by student, by preceptor, summary)
- Column sizing and formatting
- Cell styling (headers, borders, colors)

### Data Formatting
- Student schedule worksheet
- Preceptor schedule worksheet
- Master schedule worksheet
- Summary statistics worksheet
- Proper date formatting
- Color coding by clerkship type

### File Generation
- Use ExcelJS library
- Generate in-memory buffer
- Return as downloadable file
- Support filtering options

## Implementation Details

### File Structure
```
/src/lib/features/schedules/
├── services/
│   ├── assignment-service.ts       # (Existing)
│   ├── calendar-service.ts         # (Existing)
│   ├── export-service.ts           # Export functions (NEW)
│   └── export-service.test.ts      # Export tests (NEW)
└── types.ts                         # (Existing)
```

---

## Files to Create

### 1. `/src/lib/features/schedules/services/export-service.ts`

Service functions for Excel export.

**Dependencies:**
```bash
npm install exceljs
npm install --save-dev @types/exceljs
```

**Exports:**
```typescript
import ExcelJS from 'exceljs';
import type { Kysely } from 'kysely';
import type { Database } from '$lib/db/types';
import type { EnrichedAssignment, CalendarFilters } from '../types';

export async function generateScheduleExcel(
  db: Kysely<Database>,
  filters: CalendarFilters
): Promise<Buffer>

export async function generateStudentScheduleWorksheet(
  workbook: ExcelJS.Workbook,
  assignments: EnrichedAssignment[]
): Promise<void>

export async function generatePreceptorScheduleWorksheet(
  workbook: ExcelJS.Workbook,
  assignments: EnrichedAssignment[]
): Promise<void>

export async function generateMasterScheduleWorksheet(
  workbook: ExcelJS.Workbook,
  assignments: EnrichedAssignment[]
): Promise<void>

export async function generateSummaryWorksheet(
  workbook: ExcelJS.Workbook,
  assignments: EnrichedAssignment[],
  startDate: string,
  endDate: string
): Promise<void>

export function getClerkshipColor(clerkshipName: string): string
```

**Requirements:**
- Generate multi-worksheet workbook
- Apply formatting and styling
- Support filtering
- Return Buffer for download
- Type-safe operations

---

## Business Logic Functions

### 1. `generateScheduleExcel(db, filters): Promise<Buffer>`

Generate complete Excel workbook with all worksheets.

**Logic:**
1. Fetch enriched assignments using filters
2. Create new ExcelJS workbook
3. Generate student schedule worksheet
4. Generate preceptor schedule worksheet
5. Generate master schedule worksheet
6. Generate summary worksheet
7. Write workbook to buffer
8. Return buffer

**Parameters:**
- `filters`: Calendar filters (date range, student, preceptor, clerkship)

**Returns:** Buffer containing Excel file

**Errors:**
- Throws error if data fetching fails

**Example:**
```typescript
const buffer = await generateScheduleExcel(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});

// Buffer can be sent as download response
```

---

### 2. `generateStudentScheduleWorksheet(workbook, assignments): Promise<void>`

Create worksheet with student-centric view.

**Logic:**
1. Add new worksheet "Student Schedules"
2. Set column headers: Student Name, Email, Clerkship, Preceptor, Start Date, End Date, Days
3. Style header row (bold, background color, borders)
4. Group assignments by student
5. For each student:
   - Add student name row (bold)
   - Add assignment rows
   - Calculate total days
6. Auto-size columns
7. Freeze header row
8. Apply borders and formatting

**Parameters:**
- `workbook`: ExcelJS workbook instance
- `assignments`: Array of enriched assignments

**Returns:** void (modifies workbook)

**Example Worksheet:**
```
| Student Name | Email            | Clerkship          | Preceptor   | Start Date | End Date   | Days |
|--------------|------------------|--------------------|-------------|------------|------------|------|
| John Doe     | john@example.com | Internal Medicine  | Dr. Smith   | 2024-01-01 | 2024-01-28 | 28   |
|              |                  | Surgery            | Dr. Jones   | 2024-02-01 | 2024-02-28 | 28   |
| Jane Smith   | jane@example.com | Internal Medicine  | Dr. Brown   | 2024-01-01 | 2024-01-28 | 28   |
```

---

### 3. `generatePreceptorScheduleWorksheet(workbook, assignments): Promise<void>`

Create worksheet with preceptor-centric view.

**Logic:**
1. Add new worksheet "Preceptor Schedules"
2. Set column headers: Preceptor Name, Email, Specialty, Student, Clerkship, Start Date, End Date, Days
3. Style header row
4. Group assignments by preceptor
5. For each preceptor:
   - Add preceptor name row
   - Add assignment rows
   - Calculate total days
6. Auto-size columns
7. Freeze header row
8. Apply formatting

**Parameters:**
- `workbook`: ExcelJS workbook instance
- `assignments`: Array of enriched assignments

**Returns:** void (modifies workbook)

---

### 4. `generateMasterScheduleWorksheet(workbook, assignments): Promise<void>`

Create worksheet with complete schedule (all assignments).

**Logic:**
1. Add new worksheet "Master Schedule"
2. Set column headers: Student, Preceptor, Clerkship, Specialty, Start Date, End Date, Days
3. Style header row
4. Sort assignments by start date
5. For each assignment, add row with all details
6. Apply color coding by clerkship
7. Auto-size columns
8. Freeze header row
9. Apply borders

**Parameters:**
- `workbook`: ExcelJS workbook instance
- `assignments`: Array of enriched assignments

**Returns:** void (modifies workbook)

---

### 5. `generateSummaryWorksheet(workbook, assignments, startDate, endDate): Promise<void>`

Create worksheet with summary statistics.

**Logic:**
1. Add new worksheet "Summary"
2. Add title and date range
3. Calculate statistics:
   - Total assignments
   - Number of students
   - Number of preceptors
   - Number of clerkships
   - Assignments by clerkship (breakdown)
   - Average days per assignment
4. Format as key-value pairs
5. Add charts if possible (optional)
6. Apply styling

**Parameters:**
- `workbook`: ExcelJS workbook instance
- `assignments`: Array of enriched assignments
- `startDate`: Schedule start date
- `endDate`: Schedule end date

**Returns:** void (modifies workbook)

**Example Worksheet:**
```
Schedule Summary
Date Range: 2024-01-01 to 2024-12-31

Total Assignments:      150
Active Students:        50
Active Preceptors:      30
Clerkship Types:        5

Assignments by Clerkship:
- Internal Medicine:    50
- Surgery:              40
- Pediatrics:           30
- OB/GYN:              20
- Psychiatry:           10

Average Days per Assignment: 28
```

---

### 6. `getClerkshipColor(clerkshipName): string`

Get Excel color code for clerkship type.

**Logic:**
- Return hex color code based on clerkship name
- Use predefined color mapping
- Default to gray if not mapped

**Parameters:**
- `clerkshipName`: Name of clerkship

**Returns:** Hex color string (e.g., "FF3B82F6")

**Example:**
```typescript
const color = getClerkshipColor('Internal Medicine'); // "FF3B82F6" (blue)
const color = getClerkshipColor('Surgery'); // "FFEF4444" (red)
```

---

## Implementation Example

```typescript
import ExcelJS from 'exceljs';
import type { Kysely } from 'kysely';
import type { Database } from '$lib/db/types';
import { getEnrichedAssignments } from './calendar-service';
import type { EnrichedAssignment, CalendarFilters } from '../types';

export async function generateScheduleExcel(
  db: Kysely<Database>,
  filters: CalendarFilters
): Promise<Buffer> {
  // Fetch assignments
  const assignments = await getEnrichedAssignments(db, filters);

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LIC Scheduling System';
  workbook.created = new Date();

  // Generate worksheets
  await generateMasterScheduleWorksheet(workbook, assignments);
  await generateStudentScheduleWorksheet(workbook, assignments);
  await generatePreceptorScheduleWorksheet(workbook, assignments);
  await generateSummaryWorksheet(workbook, assignments, filters.start_date, filters.end_date);

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateMasterScheduleWorksheet(
  workbook: ExcelJS.Workbook,
  assignments: EnrichedAssignment[]
): Promise<void> {
  const worksheet = workbook.addWorksheet('Master Schedule');

  // Define columns
  worksheet.columns = [
    { header: 'Student', key: 'student', width: 20 },
    { header: 'Preceptor', key: 'preceptor', width: 20 },
    { header: 'Clerkship', key: 'clerkship', width: 25 },
    { header: 'Specialty', key: 'specialty', width: 20 },
    { header: 'Start Date', key: 'start_date', width: 12 },
    { header: 'End Date', key: 'end_date', width: 12 },
    { header: 'Days', key: 'days', width: 8 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4B5563' },
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows
  assignments.forEach((assignment) => {
    const startDate = new Date(assignment.start_date);
    const endDate = new Date(assignment.end_date);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const row = worksheet.addRow({
      student: assignment.student_name,
      preceptor: assignment.preceptor_name,
      clerkship: assignment.clerkship_name,
      specialty: assignment.clerkship_specialty,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
      days: days,
    });

    // Color code by clerkship
    const color = getClerkshipColor(assignment.clerkship_name);
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    };
  });

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Apply borders
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });
}

export function getClerkshipColor(clerkshipName: string): string {
  const colors: Record<string, string> = {
    'Internal Medicine': 'FF3B82F6',
    'Surgery': 'FFEF4444',
    'Pediatrics': 'FF10B981',
    'OB/GYN': 'FFF59E0B',
    'Psychiatry': 'FF8B5CF6',
  };

  return colors[clerkshipName] || 'FFD1D5DB'; // Default gray
}
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/schedules/services/export-service.test.ts`

**generateScheduleExcel():**
- ✅ Generates Excel buffer
- ✅ Buffer is valid Excel file
- ✅ Contains all worksheets
- ✅ Respects filters
- ✅ Handles empty assignments

**generateStudentScheduleWorksheet():**
- ✅ Creates worksheet with correct name
- ✅ Adds all assignments
- ✅ Groups by student
- ✅ Calculates total days
- ✅ Applies formatting

**generatePreceptorScheduleWorksheet():**
- ✅ Creates worksheet with correct name
- ✅ Adds all assignments
- ✅ Groups by preceptor
- ✅ Applies formatting

**generateMasterScheduleWorksheet():**
- ✅ Creates worksheet with correct name
- ✅ Adds all assignments
- ✅ Sorts by date
- ✅ Applies color coding
- ✅ Freezes header

**generateSummaryWorksheet():**
- ✅ Creates worksheet with correct name
- ✅ Calculates statistics correctly
- ✅ Formats data appropriately

**getClerkshipColor():**
- ✅ Returns correct colors for known clerkships
- ✅ Returns default color for unknown clerkships

---

### Testing Strategy

1. **File Validation:**
   - Verify generated buffer is valid Excel
   - Test with Excel reader library
   - Verify worksheet structure

2. **Data Accuracy:**
   - Verify all assignments exported
   - Verify calculations correct
   - Verify grouping correct

3. **Formatting:**
   - Verify headers styled
   - Verify colors applied
   - Verify columns sized

---

## Acceptance Criteria

- [ ] export-service.ts created with all 6 functions
- [ ] ExcelJS dependency installed
- [ ] Generates valid Excel files
- [ ] Multiple worksheets created
- [ ] Formatting and styling applied
- [ ] Color coding working
- [ ] Filters respected
- [ ] Summary statistics accurate
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] Buffer generation working

---

## Usage Example

```typescript
import { db } from '$lib/db';
import { generateScheduleExcel } from '$lib/features/schedules/services/export-service';

// Generate Excel file
const buffer = await generateScheduleExcel(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});

// Save to file system (server-side)
import fs from 'fs';
fs.writeFileSync('schedule.xlsx', buffer);

// Or send as download (in API route)
return new Response(buffer, {
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="schedule.xlsx"'
  }
});
```

---

## Notes

- ExcelJS is the recommended library for server-side Excel generation
- Color coding improves readability
- Multiple worksheets provide different views
- Consider adding charts (future enhancement)
- Consider adding filters to Excel worksheets
- File size may be large for many assignments

---

## References

- [ExcelJS Documentation](https://github.com/exceljs/exceljs)
- [Excel File Format](https://en.wikipedia.org/wiki/Office_Open_XML)
- [ExcelJS Examples](https://github.com/exceljs/exceljs#interface)
