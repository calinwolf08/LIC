# Step 28: Main Dashboard & Navigation

## Overview
Implement the main dashboard home page with overview statistics and the navigation structure for the entire application. This includes a sidebar/header navigation menu, quick action buttons, and summary cards showing system status.

## Dependencies
- ✅ Step 04: Students - Service Layer
- ✅ Step 07: Preceptors - Service Layer
- ✅ Step 11: Clerkships - Service Layer
- ✅ Step 20: Calendar Data - Service Layer
- All UI steps (06, 10, 13, 16, 22, 25)

## Requirements

### Dashboard Home Page
- **Overview Statistics Cards**
  - Total students
  - Total preceptors
  - Total clerkships
  - Total assignments
  - Students fully scheduled
  - Students partially scheduled
  - Students unscheduled

- **Quick Actions**
  - Generate schedule button
  - View calendar button
  - Add student/preceptor/clerkship buttons
  - Export schedule button

- **Recent Activity** (optional for MVP)
  - Recently created assignments
  - Recently added students/preceptors

### Navigation
- **Sidebar or Header Navigation**
  - Dashboard (home)
  - Students
  - Preceptors
  - Clerkships
  - Blackout Dates
  - Calendar
  - Logo/branding
  - User menu (future: auth)

### User Experience
- Responsive design (mobile, tablet, desktop)
- Active route highlighting
- Loading states for statistics
- Accessible navigation
- Consistent layout across pages

## Implementation Details

### File Structure
```
/src/routes/(app)/
├── +layout.svelte               # App layout with nav (NEW)
├── +layout.ts                   # Layout data loading (NEW)
├── +page.svelte                 # Dashboard home (NEW)
├── +page.ts                     # Dashboard data loading (NEW)
├── students/                    # (Existing from Step 06)
├── preceptors/                  # (Existing from Step 10)
├── clerkships/                  # (Existing from Step 13)
├── blackout-dates/              # (Existing from Step 16)
└── calendar/                    # (Existing from Step 22)

/src/lib/components/
└── navigation/
    ├── Sidebar.svelte           # Sidebar navigation (NEW)
    ├── Header.svelte            # Header navigation (NEW)
    └── NavItem.svelte           # Navigation item (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/+layout.svelte`

Application layout with navigation.

**Features:**
- Sidebar or header navigation
- Main content area
- Responsive layout
- Active route highlighting

**Implementation:**
```svelte
<script lang="ts">
  import Sidebar from '$lib/components/navigation/Sidebar.svelte';
  import Header from '$lib/components/navigation/Header.svelte';
  import { page } from '$app/stores';

  export let data;

  // Determine if mobile based on screen size
  let isMobile = false;
  let isSidebarOpen = true;

  $: currentPath = $page.url.pathname;
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Desktop: Sidebar -->
  {#if !isMobile}
    <Sidebar {currentPath} />
  {/if}

  <!-- Mobile: Header -->
  {#if isMobile}
    <Header {currentPath} bind:isSidebarOpen />
  {/if}

  <!-- Main Content -->
  <div class="lg:pl-64">
    <main class="py-8">
      <slot />
    </main>
  </div>
</div>
```

---

### 2. `/src/routes/(app)/+layout.ts`

Layout data loading (if needed for navigation).

**Exports:**
```typescript
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  // Load any global data needed for navigation
  // For MVP, this may be empty or just return user info when auth is added

  return {
    // Future: user info, permissions, etc.
  };
};
```

---

### 3. `/src/routes/(app)/+page.svelte`

Dashboard home page.

**Features:**
- Welcome message
- Statistics cards
- Quick action buttons
- Recent activity (optional)

**Implementation:**
```svelte
<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Calendar, Users, UserCog, BookOpen, AlertCircle } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  export let data;

  $: stats = data.stats;

  function navigateTo(path: string) {
    goto(path);
  }
</script>

<div class="container mx-auto">
  <div class="mb-8">
    <h1 class="text-4xl font-bold">Dashboard</h1>
    <p class="text-gray-600 mt-2">Welcome to the LIC Scheduling System</p>
  </div>

  <!-- Statistics Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    <!-- Total Students -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between pb-2">
        <CardTitle class="text-sm font-medium">Total Students</CardTitle>
        <Users class="h-4 w-4 text-gray-500" />
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold">{stats.total_students}</div>
      </CardContent>
    </Card>

    <!-- Total Preceptors -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between pb-2">
        <CardTitle class="text-sm font-medium">Total Preceptors</CardTitle>
        <UserCog class="h-4 w-4 text-gray-500" />
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold">{stats.total_preceptors}</div>
      </CardContent>
    </Card>

    <!-- Total Clerkships -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between pb-2">
        <CardTitle class="text-sm font-medium">Clerkship Types</CardTitle>
        <BookOpen class="h-4 w-4 text-gray-500" />
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold">{stats.total_clerkships}</div>
      </CardContent>
    </Card>

    <!-- Total Assignments -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between pb-2">
        <CardTitle class="text-sm font-medium">Active Assignments</CardTitle>
        <Calendar class="h-4 w-4 text-gray-500" />
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold">{stats.total_assignments}</div>
      </CardContent>
    </Card>
  </div>

  <!-- Student Scheduling Status -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    <!-- Fully Scheduled -->
    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium">Fully Scheduled</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold text-green-600">
          {stats.fully_scheduled_students}
        </div>
        <p class="text-sm text-gray-500">
          {((stats.fully_scheduled_students / stats.total_students) * 100).toFixed(0)}% of students
        </p>
      </CardContent>
    </Card>

    <!-- Partially Scheduled -->
    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium">Partially Scheduled</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold text-amber-600">
          {stats.partially_scheduled_students}
        </div>
        <p class="text-sm text-gray-500">
          {((stats.partially_scheduled_students / stats.total_students) * 100).toFixed(0)}% of students
        </p>
      </CardContent>
    </Card>

    <!-- Unscheduled -->
    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium">Unscheduled</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-3xl font-bold text-red-600">
          {stats.unscheduled_students}
        </div>
        <p class="text-sm text-gray-500">
          {((stats.unscheduled_students / stats.total_students) * 100).toFixed(0)}% of students
        </p>
      </CardContent>
    </Card>
  </div>

  <!-- Quick Actions -->
  <Card class="mb-8">
    <CardHeader>
      <CardTitle>Quick Actions</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button on:click={() => navigateTo('/calendar')} class="w-full">
          <Calendar class="mr-2 h-4 w-4" />
          View Calendar
        </Button>

        <Button on:click={() => navigateTo('/students')} variant="outline" class="w-full">
          <Users class="mr-2 h-4 w-4" />
          Manage Students
        </Button>

        <Button on:click={() => navigateTo('/preceptors')} variant="outline" class="w-full">
          <UserCog class="mr-2 h-4 w-4" />
          Manage Preceptors
        </Button>

        <Button on:click={() => navigateTo('/clerkships')} variant="outline" class="w-full">
          <BookOpen class="mr-2 h-4 w-4" />
          Manage Clerkships
        </Button>
      </div>
    </CardContent>
  </Card>

  <!-- Warnings/Alerts (if any) -->
  {#if stats.unscheduled_students > 0}
    <Card class="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle class="flex items-center text-amber-800">
          <AlertCircle class="mr-2 h-5 w-5" />
          Scheduling Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-amber-700">
          {stats.unscheduled_students} student(s) have not been scheduled yet.
          Consider generating or updating the schedule.
        </p>
      </CardContent>
    </Card>
  {/if}
</div>
```

---

### 4. `/src/routes/(app)/+page.ts`

Dashboard data loading.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  // Fetch counts for statistics
  const [studentsRes, preceptorsRes, clerkshipsRes] = await Promise.all([
    fetch('/api/students'),
    fetch('/api/preceptors'),
    fetch('/api/clerkships'),
  ]);

  const { data: students } = await studentsRes.json();
  const { data: preceptors } = await preceptorsRes.json();
  const { data: clerkships } = await clerkshipsRes.json();

  // Fetch assignment statistics (for current academic year or all time)
  // This could be a dedicated API endpoint
  const assignmentsRes = await fetch('/api/schedules/assignments');
  const { data: assignments } = await assignmentsRes.json();

  // Calculate scheduling status
  // NOTE: This is simplified - actual implementation would need more sophisticated logic
  const studentIds = new Set(assignments.map(a => a.student_id));
  const scheduledStudents = students.filter(s => studentIds.has(s.id));

  // Simple heuristic: fully scheduled if has >= number of clerkships
  const fullyScheduled = scheduledStudents.filter(s => {
    const studentAssignments = assignments.filter(a => a.student_id === s.id);
    return studentAssignments.length >= clerkships.length;
  });

  const partiallyScheduled = scheduledStudents.filter(s => {
    const studentAssignments = assignments.filter(a => a.student_id === s.id);
    return studentAssignments.length > 0 && studentAssignments.length < clerkships.length;
  });

  const unscheduled = students.filter(s => !studentIds.has(s.id));

  return {
    stats: {
      total_students: students.length,
      total_preceptors: preceptors.length,
      total_clerkships: clerkships.length,
      total_assignments: assignments.length,
      fully_scheduled_students: fullyScheduled.length,
      partially_scheduled_students: partiallyScheduled.length,
      unscheduled_students: unscheduled.length,
    },
  };
};
```

---

### 5. `/src/lib/components/navigation/Sidebar.svelte`

Sidebar navigation component.

**Props:**
```typescript
export let currentPath: string;
```

**Features:**
- Logo/branding
- Navigation links
- Active route highlighting
- Icons for each section

**Implementation:**
```svelte
<script lang="ts">
  import NavItem from './NavItem.svelte';
  import {
    LayoutDashboard,
    Users,
    UserCog,
    BookOpen,
    CalendarOff,
    Calendar,
  } from 'lucide-svelte';

  export let currentPath: string;

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/students', label: 'Students', icon: Users },
    { href: '/preceptors', label: 'Preceptors', icon: UserCog },
    { href: '/clerkships', label: 'Clerkships', icon: BookOpen },
    { href: '/blackout-dates', label: 'Blackout Dates', icon: CalendarOff },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
  ];
</script>

<aside class="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white">
  <!-- Logo -->
  <div class="flex h-16 items-center px-6 border-b border-gray-800">
    <h1 class="text-xl font-bold">LIC Scheduling</h1>
  </div>

  <!-- Navigation -->
  <nav class="mt-6 px-3">
    {#each navItems as item}
      <NavItem
        href={item.href}
        label={item.label}
        icon={item.icon}
        active={currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href))}
      />
    {/each}
  </nav>
</aside>
```

---

### 6. `/src/lib/components/navigation/NavItem.svelte`

Individual navigation item.

**Props:**
```typescript
export let href: string;
export let label: string;
export let icon: any;
export let active: boolean = false;
```

**Implementation:**
```svelte
<script lang="ts">
  import { page } from '$app/stores';

  export let href: string;
  export let label: string;
  export let icon: any;
  export let active: boolean = false;
</script>

<a
  {href}
  class="flex items-center gap-3 rounded-lg px-3 py-2 mb-1 transition-colors {active
    ? 'bg-gray-800 text-white'
    : 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
>
  <svelte:component this={icon} class="h-5 w-5" />
  <span>{label}</span>
</a>
```

---

### 7. `/src/lib/components/navigation/Header.svelte`

Mobile header navigation.

**Props:**
```typescript
export let currentPath: string;
export let isSidebarOpen: boolean;
```

**Features:**
- Mobile menu toggle
- Logo
- User menu (future)

---

## Testing Requirements

### Component Tests

#### Sidebar.svelte
- ✅ Renders all navigation items
- ✅ Highlights active route
- ✅ Displays logo
- ✅ Links navigate correctly

#### NavItem.svelte
- ✅ Renders icon and label
- ✅ Applies active styles
- ✅ Applies hover styles
- ✅ Navigates on click

#### Dashboard (+page.svelte)
- ✅ Displays all statistics
- ✅ Calculates percentages correctly
- ✅ Renders quick action buttons
- ✅ Shows alerts when needed
- ✅ Buttons navigate correctly

---

### Integration Tests

#### `/src/routes/(app)/+page.test.ts`
- ✅ Page loads dashboard data
- ✅ Statistics are accurate
- ✅ Quick actions navigate correctly
- ✅ Alerts display when appropriate

---

## Acceptance Criteria

- [ ] App layout created with navigation
- [ ] Sidebar navigation implemented
- [ ] Dashboard home page created
- [ ] Statistics cards display correctly
- [ ] Quick action buttons work
- [ ] Navigation highlights active route
- [ ] Responsive design (desktop and mobile)
- [ ] All navigation links work
- [ ] Statistics calculate correctly
- [ ] Loading states display during data fetch
- [ ] Alerts display when appropriate
- [ ] All components are accessible
- [ ] All tests passing

---

## Usage Example

User workflow:
1. User navigates to application root (`/`)
2. Dashboard page loads with statistics
3. User sees overview of system status
4. User clicks "View Calendar" button
5. Navigates to calendar page
6. Sidebar highlights "Calendar" as active
7. User clicks "Students" in sidebar
8. Navigates to students page
9. Sidebar highlights "Students" as active

---

## Notes

- Dashboard provides quick overview of system health
- Statistics help identify scheduling issues
- Quick actions provide shortcuts to common tasks
- Navigation should be consistent across all pages
- Consider adding user profile/settings (future with auth)
- Consider adding notifications/announcements
- May want to add recent activity feed
- Dashboard could show charts/graphs (future enhancement)

---

## References

- [Dashboard Design Patterns](https://www.nngroup.com/articles/dashboard-design/)
- [Navigation Best Practices](https://www.nngroup.com/articles/navigation-ia-tests/)
- [Responsive Sidebar](https://tailwindcss.com/docs/responsive-design)
- [shadcn/ui Card](https://ui.shadcn.com/docs/components/card)
