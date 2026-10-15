# Dashboards Design Document

**Status:** Design Phase
**Priority:** Medium (Phase 4)
**Last Updated:** 2025-11-24

---

## Overview

Create comprehensive dashboards for Students, Preceptors, and Clerkships to provide clear views of schedules, progress tracking, and related associations. Dashboards should enable easy navigation between related entities and display current progress based on the current system date.

---

## Student Dashboard

### Overview

Display a student's complete schedule, progress in each clerkship, and assigned preceptors.

### URL

`/students/:id/dashboard` or `/students/:id` (make it the default view)

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  Student Dashboard: John Doe                               │
│  Email: john@example.com | Phone: +1 (555) 123-4567       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Schedule Overview                                         │
│  Current Date: 2025-01-15                                  │
│                                                            │
│  [Calendar View - shows assignments by date]               │
│  - Interactive calendar with assignments highlighted       │
│  - Click date to see details                               │
│  - Color-coded by clerkship                                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Clerkship Progress                                        │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Clerkship           │ Progress  │ Preceptors       │  │
│  ├─────────────────────┼───────────┼──────────────────┤  │
│  │ Family Medicine     │ 15/28 days│ Dr. Smith        │  │
│  │ [Link]              │ ███░░ 54% │ [Link]           │  │
│  ├─────────────────────┼───────────┼──────────────────┤  │
│  │ Surgery             │ 5/28 days │ Dr. Jones        │  │
│  │ [Link]              │ █░░░░ 18% │ [Link]           │  │
│  ├─────────────────────┼───────────┼──────────────────┤  │
│  │ Pediatrics          │ 0/21 days │ Not assigned     │  │
│  │ [Link]              │ ░░░░░  0% │                  │  │
│  └─────────────────────┴───────────┴──────────────────┘  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Upcoming Assignments                                      │
│                                                            │
│  • 2025-01-16: Family Medicine with Dr. Smith             │
│  • 2025-01-17: Family Medicine with Dr. Smith             │
│  • 2025-01-20: Surgery with Dr. Jones                     │
└────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Student Header

- Student name (as page title)
- Contact information (email, phone if available)
- Link to edit student details

#### 2. Schedule Calendar

- Full calendar view of current month
- Days with assignments highlighted with clerkship color
- Hover shows assignment details (clerkship, preceptor)
- Click to navigate to assignment details
- Navigation to previous/next months
- Legend showing clerkship colors

#### 3. Clerkship Progress Table

Columns:

- **Clerkship:** Name with link to clerkship page
- **Progress:**
  - "X/Y days" (X = days completed, Y = required days)
  - Progress bar visual
  - Percentage
- **Preceptors:** List of preceptors worked with (links to preceptor pages)
  - If multiple: "Dr. Smith, Dr. Jones (2 total)"
  - If none yet: "Not assigned"

Sorting: Default by progress (highest first), allow sorting by name or percentage

#### 4. Upcoming Assignments List

- Next 5-10 upcoming assignments
- Format: "Date: Clerkship with Preceptor"
- Links to clerkship and preceptor pages
- If no upcoming: "No upcoming assignments scheduled"

### Data Requirements

```typescript
interface StudentDashboardData {
	student: {
		id: string;
		name: string;
		email: string;
		phone: string | null;
	};

	clerkshipProgress: Array<{
		clerkship: {
			id: string;
			name: string;
			required_days: number;
		};
		days_completed: number;
		percentage: number;
		preceptors: Array<{
			id: string;
			name: string;
		}>;
	}>;

	calendar: Array<{
		date: string;
		clerkship_id: string;
		clerkship_name: string;
		clerkship_color: string;
		preceptor_id: string;
		preceptor_name: string;
		assignment_id: string;
	}>;

	upcomingAssignments: Array<{
		date: string;
		clerkship: { id: string; name: string };
		preceptor: { id: string; name: string };
	}>;
}
```

---

## Preceptor Dashboard

### Overview

Display a preceptor's teaching schedule showing when students are assigned to them.

### URL

`/preceptors/:id/dashboard` or `/preceptors/:id`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  Preceptor Dashboard: Dr. Jane Smith                      │
│  Specialty: Family Medicine                               │
│  Email: jane@hospital.com | Phone: +1 (555) 987-6543      │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Teaching Schedule                                         │
│  Current Date: 2025-01-15                                  │
│                                                            │
│  [Calendar View - shows assigned students by date]         │
│  - Days with students highlighted                          │
│  - Hover shows student names                               │
│  - Color indicates capacity (green=available, yellow=full) │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Current Students                                          │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Student         │ Clerkship       │ Start - End     │  │
│  ├─────────────────┼─────────────────┼─────────────────┤  │
│  │ John Doe        │ Family Medicine │ Jan 8 - Feb 4   │  │
│  │ [Link]          │ [Link]          │ (Active)        │  │
│  ├─────────────────┼─────────────────┼─────────────────┤  │
│  │ Jane Smith      │ Family Medicine │ Jan 15 - Feb 11 │  │
│  │ [Link]          │ [Link]          │ (Active)        │  │
│  └─────────────────┴─────────────────┴─────────────────┘  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Upcoming Students                                         │
│                                                            │
│  • Feb 12: Bob Johnson - Surgery                           │
│  • Feb 19: Alice Williams - Family Medicine                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Availability Summary                                      │
│  Max Students: 2                                           │
│  Days Available This Month: 20                             │
│  Days Scheduled: 15                                        │
└────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Preceptor Header

- Preceptor name
- Specialty
- Contact information
- Assigned site/health system (if any)
- Link to edit preceptor details

#### 2. Teaching Schedule Calendar

- Full calendar view
- Days with assigned students highlighted
- Visual capacity indicator:
  - Green: Available slots
  - Yellow: At capacity
  - Red: Over capacity (if applicable)
- Hover shows student names for that day
- Click to see assignment details

#### 3. Current Students Table

Shows students currently assigned (assignments overlapping current date):

- **Student:** Name with link
- **Clerkship:** Name with link
- **Date Range:** "Start - End" with status indicator
- **Status:** (Active, Completed, Upcoming)

Sorting: Default by start date

#### 4. Upcoming Students List

- Next 5-10 future assignments
- Format: "Date: Student - Clerkship"
- Links to student and clerkship pages

#### 5. Availability Summary

- Max students capacity
- Days available this month/period
- Days scheduled
- Utilization percentage

### Data Requirements

```typescript
interface PreceptorDashboardData {
	preceptor: {
		id: string;
		name: string;
		specialty: string;
		email: string;
		phone: string | null;
		max_students: number;
		health_system?: { id: string; name: string };
		site?: { id: string; name: string };
	};

	calendar: Array<{
		date: string;
		students: Array<{
			id: string;
			name: string;
			clerkship_id: string;
			clerkship_name: string;
		}>;
		capacity_used: number;
		capacity_available: number;
	}>;

	currentStudents: Array<{
		student: { id: string; name: string };
		clerkship: { id: string; name: string };
		start_date: string;
		end_date: string;
		status: 'active' | 'completed' | 'upcoming';
	}>;

	upcomingStudents: Array<{
		start_date: string;
		student: { id: string; name: string };
		clerkship: { id: string; name: string };
	}>;

	availabilitySummary: {
		max_students: number;
		days_available_this_month: number;
		days_scheduled: number;
		utilization_percentage: number;
	};
}
```

---

## Clerkship Dashboard

### Overview

Display all students' progress in a specific clerkship, associated preceptors, and electives.

### URL

`/clerkships/:id/dashboard` or `/clerkships/:id`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  Clerkship Dashboard: Family Medicine                     │
│  Specialty: Family Medicine | Required Days: 28           │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Student Progress                                          │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Student     │ Days      │ Progress │ Current         │  │
│  │             │ Completed │          │ Preceptor       │  │
│  ├─────────────┼───────────┼──────────┼─────────────────┤  │
│  │ John Doe    │ 15/28     │ ███░░ 54%│ Dr. Smith       │  │
│  │ [Link]      │           │          │ [Link]          │  │
│  ├─────────────┼───────────┼──────────┼─────────────────┤  │
│  │ Jane Smith  │ 28/28     │ █████100%│ Completed       │  │
│  │ [Link]      │           │          │                 │  │
│  ├─────────────┼───────────┼──────────┼─────────────────┤  │
│  │ Bob Johnson │ 5/28      │ █░░░░ 18%│ Dr. Jones       │  │
│  │ [Link]      │           │          │ [Link]          │  │
│  └─────────────┴───────────┴──────────┴─────────────────┘  │
│                                                            │
│  Summary: 3 students | Avg completion: 57%                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Preceptors                                                │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Preceptor    │ Site/System     │ Current Students  │  │
│  ├──────────────┼─────────────────┼───────────────────┤  │
│  │ Dr. Smith    │ Main Campus     │ 2                 │  │
│  │ [Link]       │ [Link]          │                   │  │
│  ├──────────────┼─────────────────┼───────────────────┤  │
│  │ Dr. Jones    │ County Hospital │ 1                 │  │
│  │ [Link]       │ [Link]          │                   │  │
│  └──────────────┴─────────────────┴───────────────────┘  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Associated Electives                                      │
│                                                            │
│  • Sports Medicine (7 days minimum)                        │
│  • Geriatric Medicine (5 days minimum)                    │
│  • No electives configured                                 │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Configuration                                             │
│  Required Days: 28                                         │
│  Assignment Strategy: Round Robin                          │
│  Requirements: Family Medicine specialty match             │
└────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Clerkship Header

- Clerkship name
- Specialty
- Required days
- Link to edit clerkship

#### 2. Student Progress Table

Shows all students enrolled in this clerkship:

- **Student:** Name with link
- **Days Completed:** "X/Y" format
- **Progress:** Visual progress bar and percentage
- **Current Preceptor:**
  - Active preceptor name with link (if currently rotating)
  - "Completed" if finished
  - "Not started" if not yet begun

Sorting: Default by progress percentage, allow sorting by name or completion

Status indicators:

- 🟢 Completed (100%)
- 🟡 In Progress (1-99%)
- ⚪ Not Started (0%)

Summary row at bottom:

- Total students
- Average completion percentage
- Number completed vs in progress vs not started

#### 3. Preceptors Table

Lists all preceptors teaching this clerkship:

- **Preceptor:** Name with link
- **Site/Health System:** Location with link
- **Current Students:** Number of students currently assigned
- **Max Capacity:** From preceptor record

Sorting: Default by name

#### 4. Associated Electives

- List of elective options within this clerkship
- Format: "Elective Name (X days minimum)"
- Links to elective configuration
- If none: "No electives configured"

#### 5. Configuration Summary

- Key configuration details:
  - Required days
  - Assignment strategy (if configured)
  - Special requirements
  - Global defaults applied
- Link to full configuration page

### Data Requirements

```typescript
interface ClerkshipDashboardData {
	clerkship: {
		id: string;
		name: string;
		specialty: string;
		required_days: number;
	};

	studentProgress: Array<{
		student: { id: string; name: string };
		days_completed: number;
		days_required: number;
		percentage: number;
		status: 'not_started' | 'in_progress' | 'completed';
		current_preceptor: {
			id: string;
			name: string;
		} | null;
	}>;

	summary: {
		total_students: number;
		average_completion: number;
		completed_count: number;
		in_progress_count: number;
		not_started_count: number;
	};

	preceptors: Array<{
		id: string;
		name: string;
		site: { id: string; name: string } | null;
		health_system: { id: string; name: string } | null;
		current_students: number;
		max_students: number;
	}>;

	electives: Array<{
		id: string;
		name: string;
		minimum_days: number;
	}>;

	configuration: {
		required_days: number;
		assignment_strategy: string | null;
		requirements: string[];
	};
}
```

---

## Service Layer

### Student Dashboard Service

**File:** `src/lib/features/dashboards/services/student-dashboard-service.ts`

```typescript
export async function getStudentDashboardData(
	db: Kysely<DB>,
	accountId: string,
	scheduleId: string,
	studentId: string
): Promise<StudentDashboardData> {
	const currentDate = new Date().toISOString().split('T')[0];

	// Fetch student info
	const student = await db
		.selectFrom('students')
		.selectAll()
		.where('id', '=', studentId)
		.where('account_id', '=', accountId)
		.where('schedule_id', '=', scheduleId)
		.executeTakeFirstOrThrow();

	// Calculate clerkship progress
	const clerkshipProgress = await calculateClerkshipProgress(
		db,
		studentId,
		scheduleId,
		currentDate
	);

	// Get calendar events
	const calendar = await getStudentCalendar(db, studentId, scheduleId);

	// Get upcoming assignments
	const upcomingAssignments = await getUpcomingAssignments(db, studentId, scheduleId, currentDate);

	return {
		student: {
			id: student.id,
			name: student.name,
			email: student.email,
			phone: student.phone
		},
		clerkshipProgress,
		calendar,
		upcomingAssignments
	};
}

async function calculateClerkshipProgress(
	db: Kysely<DB>,
	studentId: string,
	scheduleId: string,
	currentDate: string
): Promise<ClerkshipProgress[]> {
	// Get all assignments for student up to current date
	const assignments = await db
		.selectFrom('schedule_assignments as sa')
		.innerJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.select([
			'c.id as clerkship_id',
			'c.name as clerkship_name',
			'c.required_days',
			'sa.date',
			'sa.preceptor_id'
		])
		.where('sa.student_id', '=', studentId)
		.where('sa.date', '<=', currentDate)
		.execute();

	// Group by clerkship and count days
	const progressMap = new Map<string, any>();

	for (const assignment of assignments) {
		if (!progressMap.has(assignment.clerkship_id)) {
			progressMap.set(assignment.clerkship_id, {
				clerkship: {
					id: assignment.clerkship_id,
					name: assignment.clerkship_name,
					required_days: assignment.required_days
				},
				days_completed: 0,
				preceptor_ids: new Set()
			});
		}

		const progress = progressMap.get(assignment.clerkship_id);
		progress.days_completed++;
		progress.preceptor_ids.add(assignment.preceptor_id);
	}

	// Fetch preceptor details and format results
	const results = [];
	for (const [clerkshipId, data] of progressMap) {
		const preceptors = await db
			.selectFrom('preceptors')
			.select(['id', 'name'])
			.where('id', 'in', Array.from(data.preceptor_ids))
			.execute();

		results.push({
			clerkship: data.clerkship,
			days_completed: data.days_completed,
			percentage: Math.round((data.days_completed / data.clerkship.required_days) * 100),
			preceptors
		});
	}

	return results;
}
```

### Preceptor Dashboard Service

Similar pattern for preceptor dashboard data.

### Clerkship Dashboard Service

Similar pattern for clerkship dashboard data.

---

## API Endpoints

**GET /api/students/:id/dashboard**

- Returns complete student dashboard data
- Response: `{ success: true, data: StudentDashboardData }`

**GET /api/preceptors/:id/dashboard**

- Returns complete preceptor dashboard data
- Response: `{ success: true, data: PreceptorDashboardData }`

**GET /api/clerkships/:id/dashboard**

- Returns complete clerkship dashboard data
- Response: `{ success: true, data: ClerkshipDashboardData }`

---

## Implementation Checklist

### Phase 1: Service Layer

- [ ] Create student dashboard service
- [ ] Create preceptor dashboard service
- [ ] Create clerkship dashboard service
- [ ] Write unit tests for all services

### Phase 2: API Endpoints

- [ ] Implement student dashboard endpoint
- [ ] Implement preceptor dashboard endpoint
- [ ] Implement clerkship dashboard endpoint
- [ ] Write E2E tests

### Phase 3: UI Components

- [ ] Create calendar component (reusable)
- [ ] Create progress bar component
- [ ] Create progress table component
- [ ] Create upcoming assignments list component

### Phase 4: Dashboard Pages

- [ ] Build student dashboard page
- [ ] Build preceptor dashboard page
- [ ] Build clerkship dashboard page
- [ ] Add navigation links from list views

### Phase 5: Polish

- [ ] Add loading states
- [ ] Add error handling
- [ ] Responsive design
- [ ] Accessibility (ARIA labels, keyboard navigation)

---

## Future Enhancements

1. **Interactive Features:**
   - Click calendar day to add/edit assignments
   - Drag-and-drop to reschedule
   - Quick actions (email student, call preceptor)

2. **Filters & Views:**
   - Filter by date range
   - Filter by clerkship/specialty
   - Group by week/month
   - List view vs calendar view toggle

3. **Export/Print:**
   - Export schedule to PDF
   - Print-friendly layouts
   - Export to iCal/Google Calendar

4. **Notifications:**
   - Upcoming assignment reminders
   - Progress milestones (50%, 75%, 100%)
   - Preceptor capacity alerts

5. **Analytics:**
   - Clerkship completion trends
   - Preceptor utilization heatmaps
   - Student cohort comparisons

---

## Related Documents

- `DESIGN_MULTI_TENANCY.md` - Account-specific dashboards
- `DESIGN_SCHEDULE_MANAGEMENT.md` - Schedule-specific dashboard data
- `DESIGN_CONTACT_FIELDS.md` - Contact information display
