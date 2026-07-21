# Plan 08: Auto-Create Schedule on Signup with Welcome Modal

## Overview

Implement Option A2: When a user signs up, automatically create their first schedule and show a welcome modal to configure its name and dates. This eliminates the friction of the redirect-to-wizard flow while still giving users control over schedule configuration.

## Current Problems

1. **Default schedule shows before sign-in**: `/api/scheduling-periods` has no auth check
2. **No redirect after signup**: User isn't directed to create a schedule
3. **Database column missing**: `active_schedule_id` column error - migration may not have run
4. **Entity creation fails without schedule**: `autoAssociateWithActiveSchedule` silently fails

## Solution: Option A2

1. **Auto-create schedule on signup** with sensible defaults
2. **Show welcome modal on first dashboard visit** to configure name/dates
3. **Fix API authentication** to require auth for scheduling-periods
4. **Fix entity association** to use the auto-created schedule

## Implementation

### Phase 1: Database & Migration Fixes

**File**: `src/lib/db/migrations/024_add_active_schedule_to_user.ts`

Ensure migration runs and adds `active_schedule_id` to user table:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('user')
    .addColumn('active_schedule_id', 'text', (col) =>
      col.references('scheduling_periods.id').onDelete('set null')
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user').dropColumn('active_schedule_id').execute();
}
```

Run migrations:
```bash
npm run db:migrate
```

### Phase 2: Auto-Create Schedule on Signup

**File**: `src/lib/auth.ts` (or equivalent auth configuration)

Add post-signup hook to create schedule:

```typescript
import { db } from '$lib/db';
import { generateId } from '$lib/utils/id';

// In better-auth configuration, add after user creation:
async function createDefaultScheduleForUser(userId: string): Promise<string> {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Default to academic year (July - June) or calendar year
  const startDate = now.getMonth() >= 6
    ? `${currentYear}-07-01`
    : `${currentYear}-01-01`;
  const endDate = now.getMonth() >= 6
    ? `${currentYear + 1}-06-30`
    : `${currentYear}-12-31`;

  const scheduleId = generateId();

  await db
    .insertInto('scheduling_periods')
    .values({
      id: scheduleId,
      name: 'My Schedule',
      start_date: startDate,
      end_date: endDate,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .execute();

  // Set as active schedule
  await db
    .updateTable('user')
    .set({ active_schedule_id: scheduleId })
    .where('id', '=', userId)
    .execute();

  return scheduleId;
}
```

**File**: `src/routes/api/auth/[...all]/+server.ts` (or auth hook location)

Integrate with better-auth signup flow:

```typescript
// After successful signup, create default schedule
if (isSignup && user.id) {
  await createDefaultScheduleForUser(user.id);
}
```

### Phase 3: Welcome Modal Component

**File**: `src/lib/features/schedules/components/welcome-schedule-modal.svelte`

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  interface Props {
    open: boolean;
    schedule: { id: string; name: string; start_date: string; end_date: string };
    onComplete: () => void;
  }

  let { open, schedule, onComplete }: Props = $props();

  let name = $state(schedule.name);
  let startDate = $state(schedule.start_date);
  let endDate = $state(schedule.end_date);
  let isSubmitting = $state(false);
  let error = $state('');

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    isSubmitting = true;
    error = '';

    try {
      const response = await fetch(`/api/scheduling-periods/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, start_date: startDate, end_date: endDate })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update schedule');
      }

      // Mark as configured in localStorage to prevent showing again
      localStorage.setItem('schedule_configured', 'true');
      onComplete();
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50"></div>
    <div class="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Welcome to LIC Scheduler!</h2>
      <p class="text-gray-600 mb-6">
        Let's set up your first schedule. You can change these settings anytime.
      </p>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="schedule-name" class="block text-sm font-medium text-gray-700 mb-1">
            Schedule Name
          </label>
          <input
            id="schedule-name"
            type="text"
            bind:value={name}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Fall 2025 Clerkships"
            required
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="start-date" class="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              id="start-date"
              type="date"
              bind:value={startDate}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label for="end-date" class="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              id="end-date"
              type="date"
              bind:value={endDate}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {#if error}
          <p class="text-red-600 text-sm">{error}</p>
        {/if}

        <div class="flex justify-end gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Get Started'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
```

### Phase 4: Integrate Welcome Modal in Dashboard

**File**: `src/routes/+page.svelte`

```svelte
<script lang="ts">
  import WelcomeScheduleModal from '$lib/features/schedules/components/welcome-schedule-modal.svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  // Check if this is first visit (schedule not configured yet)
  let showWelcome = $state(false);

  $effect(() => {
    if (browser && data.activeSchedule) {
      const configured = localStorage.getItem('schedule_configured');
      // Show welcome if schedule has default name and not previously configured
      if (!configured && data.activeSchedule.name === 'My Schedule') {
        showWelcome = true;
      }
    }
  });

  function handleWelcomeComplete() {
    showWelcome = false;
    invalidateAll();
  }
</script>

<!-- Existing dashboard content -->
...

<!-- Welcome Modal -->
{#if showWelcome && data.activeSchedule}
  <WelcomeScheduleModal
    open={showWelcome}
    schedule={data.activeSchedule}
    onComplete={handleWelcomeComplete}
  />
{/if}
```

### Phase 5: Fix API Authentication

**File**: `src/routes/api/scheduling-periods/+server.ts`

Add authentication check to GET endpoint:

```typescript
import { auth } from '$lib/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const schedules = await db
    .selectFrom('scheduling_periods')
    .where('user_id', '=', session.user.id)
    .selectAll()
    .execute();

  return json({ success: true, data: schedules });
};
```

### Phase 6: Fix Layout Redirect Logic

**File**: `src/routes/+layout.server.ts`

Remove check for `user_id IS NULL` schedules:

```typescript
// Before (buggy):
const schedule = await db
  .selectFrom('scheduling_periods')
  .where((eb) =>
    eb.or([
      eb('user_id', '=', user.id),
      eb('user_id', 'is', null)  // Remove this line
    ])
  )
  .selectAll()
  .executeTakeFirst();

// After (correct):
const schedule = await db
  .selectFrom('scheduling_periods')
  .where('user_id', '=', user.id)
  .selectAll()
  .executeTakeFirst();
```

### Phase 7: Fix Schedule Selector Component

**File**: `src/lib/features/schedules/components/schedule-selector.svelte`

Handle unauthenticated state gracefully:

```svelte
<script lang="ts">
  import { page } from '$app/stores';

  let schedules = $state<Array<{ id: string; name: string }>>([]);
  let loading = $state(true);
  let error = $state('');

  $effect(() => {
    loadSchedules();
  });

  async function loadSchedules() {
    try {
      const response = await fetch('/api/scheduling-periods');
      if (response.status === 401) {
        // Not authenticated - don't show any schedules
        schedules = [];
        return;
      }
      const data = await response.json();
      if (data.success) {
        schedules = data.data;
      }
    } catch (e) {
      error = 'Failed to load schedules';
    } finally {
      loading = false;
    }
  }
</script>

{#if loading}
  <div class="text-gray-400 text-sm">Loading...</div>
{:else if schedules.length === 0}
  <div class="text-gray-400 text-sm">No schedules</div>
{:else}
  <!-- Schedule selector dropdown -->
  ...
{/if}
```

### Phase 8: Update Seed Script

**File**: `src/lib/db/seed.ts`

Ensure seed data creates schedules with proper user association:

```typescript
// Remove any orphan schedules (user_id = null)
// All seeded schedules should be associated with test user
const testSchedule = {
  id: 'test-schedule-001',
  name: 'Demo Schedule 2025',
  start_date: '2025-01-06',
  end_date: '2025-06-30',
  user_id: testUser.id,  // Must have user_id
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
```

## Testing Checklist

### Manual Testing

- [ ] Sign up as new user
- [ ] Schedule auto-created on signup
- [ ] Redirected to dashboard (not wizard)
- [ ] Welcome modal appears
- [ ] Can configure schedule name and dates
- [ ] Modal dismisses after save
- [ ] Schedule selector shows user's schedule
- [ ] No schedules visible before login
- [ ] Entity creation works (uses active schedule)

### Automated Testing

- [ ] API tests for auth on scheduling-periods
- [ ] E2E test for signup → welcome modal flow
- [ ] E2E test for schedule configuration
- [ ] Unit tests for createDefaultScheduleForUser

## Files Modified

1. `src/lib/db/migrations/024_add_active_schedule_to_user.ts` - Ensure migration exists
2. `src/lib/auth.ts` - Add post-signup schedule creation hook
3. `src/lib/features/schedules/components/welcome-schedule-modal.svelte` - NEW
4. `src/routes/+page.svelte` - Add welcome modal integration
5. `src/routes/api/scheduling-periods/+server.ts` - Add auth check
6. `src/routes/+layout.server.ts` - Fix redirect logic
7. `src/lib/features/schedules/components/schedule-selector.svelte` - Handle unauth state
8. `src/lib/db/seed.ts` - Fix orphan schedules

## Acceptance Criteria

- [ ] New users get schedule auto-created on signup
- [ ] Welcome modal shown on first dashboard visit
- [ ] Modal allows configuring schedule name and dates
- [ ] No schedules visible before authentication
- [ ] Entity creation uses active schedule correctly
- [ ] All existing functionality preserved
