# Plan 09: Test Plan for Signup Flow and Wizard Changes

## Overview

This plan documents the test updates and new tests needed for:
1. Auto-create schedule on signup (Option A2)
2. Welcome modal for schedule configuration
3. New wizard step order (Details → Health Systems → Sites → Clerkships → Preceptors → Teams → Students → Review)

## Tests Requiring Updates

### 1. Schedule Wizard UI Tests

**File**: `e2e/ui/onboarding/schedule-wizard.ui.test.ts`

**Issue**: Step navigation tests assume OLD step order:
- Step 2 was Students → NOW Step 7
- Step 3 was Preceptors → NOW Step 5
- Step 4 was Sites → NOW Step 3
- Step 5 was Health Systems → NOW Step 2
- Step 6 was Clerkships → NOW Step 4
- Step 7 was Teams → NOW Step 6

**Tests to Update**:

| Test | Current | Update Needed |
|------|---------|---------------|
| Step 2.1-2.3: Student selection | Step 2 | Change to Step 7 (navigate through 6 steps first) |
| Step 3: Preceptor selection | Step 3 | Change to Step 5 |
| Step 4: Site selection | Step 4 | Change to Step 3 |
| Step 5: Health system selection | Step 5 | Change to Step 2 |
| Step 6: Clerkship selection | Step 6 | Change to Step 4 |
| Step 7: Team selection | Step 7 | Change to Step 6 |

**Required Changes**:
```typescript
// Update step navigation counts for each test
// Example for "Step 2.1: should display student selection"
// OLD: Click next once to reach Students (step 2)
// NEW: Click next 6 times to reach Students (step 7)

// Before (old step 2):
await nextButton.click(); // Step 2 (Students)

// After (new step 7):
for (let i = 0; i < 6; i++) {
  await nextButton.click();
  await page.waitForTimeout(300);
}
```

### 2. First-Time User Journey Tests

**File**: `e2e/ui/onboarding/first-time-user.ui.test.ts`

**Issue**: Tests expect redirect to schedule creation wizard after signup, but now user will:
1. Have schedule auto-created on signup
2. Land on dashboard
3. See welcome modal to configure schedule

**Tests to Update**:

| Test | Current Expectation | New Expectation |
|------|---------------------|-----------------|
| Test 1: should redirect new user to schedule creation | Redirect to /schedules/new | Redirect to / (dashboard) with welcome modal |
| Test 3: should show getting started prompts | Check for prompts OR schedule page | Check for welcome modal OR configured schedule |
| Test 4: should guide user through required setup | Navigate to /schedules/new | Verify welcome modal or dashboard access |

**Required Changes**:
```typescript
// Test 1 - Update expectations
// OLD:
await expect(page).toHaveURL(/schedules\/new/);

// NEW:
// User lands on dashboard with welcome modal
await expect(page).toHaveURL(/^\/$|^\/$/); // Dashboard
// OR check for welcome modal visibility
const welcomeModal = page.getByText(/welcome to lic scheduler/i);
await expect(welcomeModal).toBeVisible();
```

### 3. Authentication Tests

**File**: `e2e/ui/auth/authentication.ui.test.ts`

**Minor updates** - These tests verify redirect behavior. After signup/login, user may now go to dashboard instead of schedule creation.

**Tests to Update**:

| Test | Update Needed |
|------|---------------|
| Test 6: should register new user successfully | Expect redirect to / instead of /schedules/new |
| Test 7: should login with valid credentials | No change (user has schedule) |

## New Tests to Add

### 1. Auto-Create Schedule on Signup

**File**: `e2e/ui/onboarding/first-time-user.ui.test.ts` (add tests)

```typescript
test('should auto-create schedule on signup', async ({ page }) => {
  const testUser = generateTestUser('auto-schedule');

  // Register new user
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: testUser.name, email: testUser.email, password: testUser.password }
  });

  // Verify schedule was created in database
  const user = await db.selectFrom('user')
    .selectAll()
    .where('email', '=', testUser.email)
    .executeTakeFirst();

  expect(user).toBeDefined();
  expect(user?.active_schedule_id).toBeDefined();

  // Verify schedule exists
  const schedule = await db.selectFrom('scheduling_periods')
    .selectAll()
    .where('id', '=', user!.active_schedule_id)
    .executeTakeFirst();

  expect(schedule).toBeDefined();
  expect(schedule?.user_id).toBe(user!.id);
  expect(schedule?.name).toBe('My Schedule'); // Default name
});

test('should show welcome modal on first dashboard visit', async ({ page }) => {
  const testUser = generateTestUser('welcome-modal');

  // Register and login
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: testUser.name, email: testUser.email, password: testUser.password }
  });

  await page.goto('/login');
  await page.fill('#email', testUser.email);
  await page.fill('#password', testUser.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });

  // Navigate to dashboard
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Welcome modal should be visible
  const welcomeModal = page.getByText(/welcome to lic scheduler/i);
  await expect(welcomeModal).toBeVisible();

  // Modal should have name and date fields
  await expect(page.locator('input#schedule-name')).toBeVisible();
  await expect(page.locator('input#start-date')).toBeVisible();
  await expect(page.locator('input#end-date')).toBeVisible();
});

test('should configure schedule via welcome modal', async ({ page }) => {
  const testUser = generateTestUser('configure-modal');
  const scheduleName = 'Fall 2025 Clerkships';

  // Register and login
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: testUser.name, email: testUser.email, password: testUser.password }
  });

  await page.goto('/login');
  await page.fill('#email', testUser.email);
  await page.fill('#password', testUser.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Fill in welcome modal
  await page.fill('input#schedule-name', scheduleName);
  await page.fill('input#start-date', '2025-08-01');
  await page.fill('input#end-date', '2025-12-15');

  // Submit
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForTimeout(1000);

  // Modal should close
  await expect(page.getByText(/welcome to lic scheduler/i)).not.toBeVisible();

  // Verify schedule was updated in database
  const user = await db.selectFrom('user')
    .selectAll()
    .where('email', '=', testUser.email)
    .executeTakeFirst();

  const schedule = await db.selectFrom('scheduling_periods')
    .selectAll()
    .where('id', '=', user!.active_schedule_id)
    .executeTakeFirst();

  expect(schedule?.name).toBe(scheduleName);
  expect(schedule?.start_date).toBe('2025-08-01');
  expect(schedule?.end_date).toBe('2025-12-15');
});

test('should not show welcome modal after configuration', async ({ page }) => {
  const testUser = generateTestUser('no-repeat-modal');

  // Register and login
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: testUser.name, email: testUser.email, password: testUser.password }
  });

  // Update schedule name to simulate it being configured
  const user = await db.selectFrom('user')
    .selectAll()
    .where('email', '=', testUser.email)
    .executeTakeFirst();

  await db.updateTable('scheduling_periods')
    .set({ name: 'Configured Schedule' })
    .where('id', '=', user!.active_schedule_id)
    .execute();

  // Login and go to dashboard
  await page.goto('/login');
  await page.fill('#email', testUser.email);
  await page.fill('#password', testUser.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Welcome modal should NOT be visible
  const welcomeModal = page.getByText(/welcome to lic scheduler/i);
  await expect(welcomeModal).not.toBeVisible();
});
```

### 2. API Authentication Tests

**File**: `e2e/api/schedules.api.test.ts` (add tests)

```typescript
test('GET /api/scheduling-periods should require authentication', async ({ request }) => {
  // Clear any session cookies
  const response = await request.get('/api/scheduling-periods');

  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.success).toBe(false);
  expect(body.error).toContain('Unauthorized');
});

test('GET /api/scheduling-periods should return only user schedules', async ({ request }) => {
  // This test requires authenticated request
  // Create user and login via API first
  const testUser = generateTestUser('api-schedules');

  // Register
  await request.post('/api/auth/sign-up/email', {
    data: { name: testUser.name, email: testUser.email, password: testUser.password }
  });

  // Login to get session cookie
  const loginResponse = await request.post('/api/auth/sign-in/email', {
    data: { email: testUser.email, password: testUser.password }
  });
  expect(loginResponse.ok()).toBeTruthy();

  // Now fetch schedules with session
  const schedulesResponse = await request.get('/api/scheduling-periods');
  expect(schedulesResponse.ok()).toBeTruthy();

  const body = await schedulesResponse.json();
  expect(body.success).toBe(true);
  expect(Array.isArray(body.data)).toBe(true);

  // Should only have the auto-created schedule
  expect(body.data.length).toBe(1);
  expect(body.data[0].name).toBe('My Schedule');
});
```

### 3. Entity Association Tests

**File**: `e2e/api/entity-association.api.test.ts` (new file)

```typescript
import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db-helpers';
import { generateTestUser } from '../utils/auth-helpers';

test.describe('Entity Association with Active Schedule', () => {
  test('should associate new entity with active schedule', async ({ request }) => {
    const testUser = generateTestUser('entity-assoc');

    // Register (creates schedule automatically)
    await request.post('/api/auth/sign-up/email', {
      data: { name: testUser.name, email: testUser.email, password: testUser.password }
    });

    // Login
    await request.post('/api/auth/sign-in/email', {
      data: { email: testUser.email, password: testUser.password }
    });

    // Create a health system
    const createResponse = await request.post('/api/health-systems', {
      data: { name: 'Test Health System', abbreviation: 'THS' }
    });

    expect(createResponse.ok()).toBeTruthy();

    const body = await createResponse.json();
    expect(body.success).toBe(true);
    const healthSystemId = body.data.id;

    // Verify it was associated with the schedule
    const db = await getTestDb();
    const user = await db.selectFrom('user')
      .selectAll()
      .where('email', '=', testUser.email)
      .executeTakeFirst();

    const association = await db.selectFrom('schedule_health_systems')
      .selectAll()
      .where('schedule_id', '=', user!.active_schedule_id!)
      .where('health_system_id', '=', healthSystemId)
      .executeTakeFirst();

    expect(association).toBeDefined();
  });
});
```

## Testing Checklist

### Pre-Implementation
- [ ] Run existing tests to establish baseline (expect some to fail with new code)

### After Implementation

#### Unit Tests
- [ ] createDefaultScheduleForUser function creates schedule correctly
- [ ] Schedule has correct default values (name, dates)
- [ ] Schedule is associated with user via user_id
- [ ] User's active_schedule_id is set

#### API Tests
- [ ] GET /api/scheduling-periods returns 401 without auth
- [ ] GET /api/scheduling-periods returns only user's schedules
- [ ] POST entity routes associate with active schedule

#### E2E UI Tests
- [ ] New user signup creates schedule automatically
- [ ] Welcome modal appears on first dashboard visit
- [ ] Welcome modal allows configuring schedule name and dates
- [ ] Welcome modal dismisses after save
- [ ] Modal doesn't reappear after configuration
- [ ] Wizard step order is correct (8 tests to update)
- [ ] Entity creation works with auto-created schedule

### Regression Tests
- [ ] Existing users with schedules can still login
- [ ] Schedule switching still works
- [ ] Entity CRUD operations still work
- [ ] Calendar view still works
- [ ] Schedule generation still works

## Files to Modify

1. `e2e/ui/onboarding/schedule-wizard.ui.test.ts` - Update step navigation
2. `e2e/ui/onboarding/first-time-user.ui.test.ts` - Update expectations, add new tests
3. `e2e/ui/auth/authentication.ui.test.ts` - Minor redirect updates
4. `e2e/api/schedules.api.test.ts` - Add auth requirement tests

## New Test Files

1. `e2e/api/entity-association.api.test.ts` - Test entity-schedule association

## Execution Order

1. Implement auto-create schedule on signup
2. Implement welcome modal
3. Fix API authentication
4. Update E2E tests for wizard step order
5. Add new tests for signup flow
6. Run full test suite and fix failures
