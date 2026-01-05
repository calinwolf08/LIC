# Development Plan: Blackout Dates UI

## Overview

Add blackout dates management UI to the calendar page with rescheduling trigger capability.

## Current State

- Database table exists with `date`, `reason` fields
- Service layer is complete (`blackout-date-service.ts`)
- Integrated into scheduling engine via `BlackoutDateConstraint` (non-bypassable)
- **Missing:** API routes and UI

## Requirements

- Simple UI on calendar page to add/remove blackout dates
- Visual indication of blackout dates on calendar
- Trigger rescheduling if blackout date conflicts with existing assignments

---

## Phase 1: API Routes

### 1.1 Create API endpoints

**File:** `src/routes/api/blackout-dates/+server.ts`
- `GET` - List all blackout dates (use existing `getBlackoutDates` service)
- `POST` - Create blackout date (use existing `createBlackoutDate` service)

**File:** `src/routes/api/blackout-dates/[id]/+server.ts`
- `GET` - Get single blackout date
- `DELETE` - Delete blackout date (use existing `deleteBlackoutDate` service)

### 1.2 Add conflict detection endpoint

**File:** `src/routes/api/blackout-dates/conflicts/+server.ts`
- `POST` - Check if a date has existing assignments
- Query `schedule_assignments` table for the given date
- Return count and list of affected students/preceptors

### Testing

- Unit tests for API route handlers
- Integration tests for CRUD operations
- Test conflict detection with existing assignments
- Run `npm run check` and `npm run test`

---

## Phase 2: UI Components

### 2.1 Create BlackoutDateManager component

**File:** `src/lib/features/blackout-dates/components/blackout-date-manager.svelte`

Features:
- List of existing blackout dates (sorted by date)
- Add new blackout date form (date picker + optional reason)
- Delete button per date
- Visual indicator for dates with conflicts

### 2.2 Create BlackoutDateConflictDialog component

**File:** `src/lib/features/blackout-dates/components/blackout-date-conflict-dialog.svelte`

- Shows when adding a blackout date that conflicts with existing assignments
- Displays affected assignments (student, preceptor, clerkship)
- Options: "Cancel" or "Add & Reschedule Affected"

### Testing

- Component unit tests
- Test dialog appears on conflict
- Run `npm run check` and `npm run test`

---

## Phase 3: Calendar Page Integration

### 3.1 Add to calendar page

**File:** `src/routes/calendar/+page.svelte`

- Add collapsible sidebar section or tab for "Blackout Dates"
- Integrate `BlackoutDateManager` component
- Update page data loader to fetch blackout dates

### 3.2 Visual calendar integration

- Mark blackout dates on calendar grid with distinct styling (e.g., striped/grayed out)
- Prevent drag-drop assignments onto blackout dates

### Testing

- Integration tests for calendar page with blackout dates
- E2E test: add blackout date -> verify calendar updates
- Run `npm run check` and `npm run test`

---

## Phase 4: Rescheduling Integration

### 4.1 Add reschedule trigger

When blackout date is added with conflicts:
- Delete affected assignments
- Trigger partial reschedule for affected students
- Use existing scheduling engine with date constraints

### 4.2 Update scheduling context

- Ensure `buildSchedulingContext` properly loads blackout dates (already does)
- Add service method to reschedule specific students for specific clerkships

### Testing

- Integration test: add blackout date with conflict -> verify reschedule
- Test that rescheduled assignments avoid the new blackout date
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/routes/api/blackout-dates/+server.ts` |
| Create | `src/routes/api/blackout-dates/[id]/+server.ts` |
| Create | `src/routes/api/blackout-dates/conflicts/+server.ts` |
| Create | `src/lib/features/blackout-dates/components/blackout-date-manager.svelte` |
| Create | `src/lib/features/blackout-dates/components/blackout-date-conflict-dialog.svelte` |
| Modify | `src/routes/calendar/+page.svelte` |
| Modify | `src/routes/calendar/+page.ts` |

---

## Validation Checklist

- [ ] All API endpoints return correct responses
- [ ] Blackout dates display on calendar with distinct styling
- [ ] Cannot drag-drop assignments onto blackout dates
- [ ] Conflict dialog shows when adding date with existing assignments
- [ ] Rescheduling works correctly after adding conflicting blackout date
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
