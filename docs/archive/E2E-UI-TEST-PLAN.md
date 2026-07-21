# E2E UI Test Plan

## Overview

This document outlines a comprehensive E2E UI testing strategy to validate all user behaviors and ensure the application works as designed. Tests will use real authentication, create entities via UI forms, and verify data persistence in the database.

## Testing Principles

### Core Methodology

1. **Real Authentication**: All tests use actual better-auth flows (no E2E_TESTING bypass)
2. **UI-Driven Actions**: Create, edit, delete entities through UI forms (not API shortcuts)
3. **Database Verification**: Every mutation confirms data persisted correctly in SQLite
4. **UI State Verification**: Confirm UI displays correct data, toast messages appear, navigation works
5. **Atomic Validation**: Each test validated individually before proceeding to next
6. **Isolated Tests**: Each test cleans up its own data to avoid interference

### Verification Checklist (Per Test)

- [ ] Action completes without error
- [ ] Database contains expected data
- [ ] UI displays updated state correctly
- [ ] Toast/notification messages appear when expected
- [ ] Navigation redirects to correct page
- [ ] Form validation errors display for invalid input

### Browser Configuration

Tests designed for single-browser execution with easy toggling:

```typescript
// playwright.config.ts
const BROWSER = process.env.TEST_BROWSER || 'chromium';

export default defineConfig({
  projects: [
    {
      name: 'default',
      use: {
        ...devices[BROWSER === 'firefox' ? 'Desktop Firefox' :
                  BROWSER === 'webkit' ? 'Desktop Safari' : 'Desktop Chrome']
      },
    },
  ],
});
```

Usage:
```bash
# Default (Chromium)
npm run test:e2e

# Firefox
TEST_BROWSER=firefox npm run test:e2e

# WebKit/Safari
TEST_BROWSER=webkit npm run test:e2e
```

---

## Test File Structure

```
e2e/
├── ui/
│   ├── auth/
│   │   └── authentication.ui.test.ts       # Login, register, logout, session
│   │
│   ├── onboarding/
│   │   ├── first-time-user.ui.test.ts      # Complete first-time user journey
│   │   └── schedule-wizard.ui.test.ts      # 8-step schedule creation wizard
│   │
│   ├── entities/
│   │   ├── students.ui.test.ts             # Student CRUD via UI
│   │   ├── preceptors.ui.test.ts           # Preceptor CRUD via UI
│   │   ├── health-systems.ui.test.ts       # Health system CRUD via UI
│   │   ├── sites.ui.test.ts                # Site CRUD via UI
│   │   ├── clerkships.ui.test.ts           # Clerkship CRUD via UI
│   │   ├── teams.ui.test.ts                # Preceptor team CRUD via UI
│   │   └── electives.ui.test.ts            # Elective CRUD via UI
│   │
│   ├── configuration/
│   │   ├── capacity-rules.ui.test.ts       # Capacity rule configuration
│   │   ├── requirements.ui.test.ts         # Clerkship requirements
│   │   ├── blackout-dates.ui.test.ts       # Blackout date management
│   │   ├── availability.ui.test.ts         # Preceptor availability patterns
│   │   └── student-onboarding.ui.test.ts   # Student health system onboarding
│   │
│   ├── scheduling/
│   │   ├── schedule-generation.ui.test.ts  # Generate schedules via UI
│   │   ├── schedule-regeneration.ui.test.ts# Regenerate with changes
│   │   └── schedule-management.ui.test.ts  # Multi-schedule operations
│   │
│   ├── calendar/
│   │   ├── calendar-views.ui.test.ts       # Calendar navigation and display
│   │   ├── assignment-editing.ui.test.ts   # Edit assignments from calendar
│   │   └── assignment-operations.ui.test.ts# Reassign, swap, delete
│   │
│   ├── export/
│   │   └── schedule-export.ui.test.ts      # Export to Excel/PDF
│   │
│   └── workflows/
│       ├── complete-scheduling-flow.ui.test.ts    # End-to-end scheduling
│       ├── student-lifecycle.ui.test.ts           # Student journey through system
│       ├── preceptor-management-flow.ui.test.ts   # Preceptor setup to assignment
│       └── schedule-adjustment-flow.ui.test.ts    # Make changes to live schedule
```

---

## Test Specifications

### 1. Authentication (`auth/authentication.ui.test.ts`)

**Purpose**: Validate all authentication flows with real better-auth

#### Tests (12 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display login page | Navigate to /login | Login form visible, email/password fields present |
| 2 | should display register page | Navigate to /register | Register form visible, all fields present |
| 3 | should show validation errors for empty login | Submit empty form | Email required, password required errors |
| 4 | should show validation error for invalid email format | Enter invalid email | Email format error displayed |
| 5 | should show error for wrong credentials | Login with wrong password | "Invalid credentials" error displayed |
| 6 | should register new user successfully | Fill register form, submit | DB: user record created, session created; UI: redirected to app |
| 7 | should login with valid credentials | Fill login form, submit | DB: session created; UI: redirected to dashboard |
| 8 | should persist session across page refresh | Login, refresh page | Still authenticated, no redirect to login |
| 9 | should redirect to original URL after login | Access /calendar unauthenticated, login | Redirected to /calendar after login |
| 10 | should logout successfully | Click logout | DB: session invalidated; UI: redirected to /login |
| 11 | should protect routes from unauthenticated access | Access /students without auth | Redirected to /login |
| 12 | should show remember me functionality | Login with remember me checked | Session persists longer (verify cookie expiry) |

---

### 2. First-Time User Journey (`onboarding/first-time-user.ui.test.ts`)

**Purpose**: Validate complete new user experience from registration to first schedule

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should redirect new user to schedule creation | Register new user | Redirected to /schedules/new (no active schedule) |
| 2 | should allow creating entities during onboarding | From wizard, access entity creation | Can create students, preceptors, etc. |
| 3 | should show getting started prompts on dashboard | Complete minimal setup, go to dashboard | Prompts for missing entities displayed |
| 4 | should guide user through required setup | Follow prompts | Each prompt leads to correct setup page |
| 5 | should prevent schedule generation without required data | Try to generate with missing entities | Appropriate error/warning displayed |
| 6 | should complete full onboarding flow | Register → Create entities → Create schedule → Generate | DB: all entities created, schedule generated; UI: calendar displays |
| 7 | should save progress if user leaves wizard | Start wizard, navigate away, return | Wizard resumes from last step |
| 8 | should allow skipping optional steps | Skip optional wizard steps | Schedule created with minimal data |

---

### 3. Schedule Creation Wizard (`onboarding/schedule-wizard.ui.test.ts`)

**Purpose**: Test each step of the 8-step schedule wizard atomically and as complete flow

#### Step 1: Details (3 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display schedule details form | Navigate to /schedules/new | Name, start date, end date, year fields visible |
| 2 | should validate required fields | Submit without name | Validation error displayed |
| 3 | should validate date range | Enter end date before start date | Date range error displayed |

#### Step 2: Students (3 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 4 | should display student selection | Complete step 1, go to step 2 | Student list displayed with checkboxes |
| 5 | should filter students by search | Type in search box | List filtered to matching students |
| 6 | should allow selecting/deselecting students | Toggle checkboxes | Selection state persists when navigating |

#### Step 3: Preceptors (3 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 7 | should display preceptor selection | Navigate to step 3 | Preceptor list displayed |
| 8 | should filter preceptors by health system | Select health system filter | List filtered accordingly |
| 9 | should show preceptor details on hover/click | Hover over preceptor | Details tooltip/modal displayed |

#### Step 4: Sites (2 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 10 | should display site selection grouped by health system | Navigate to step 4 | Sites grouped under health systems |
| 11 | should auto-select sites when health system selected | Select health system | All sites under it selected |

#### Step 5: Health Systems (2 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 12 | should display health system selection | Navigate to step 5 | Health system list displayed |
| 13 | should show dependencies warning | Deselect health system with selected sites | Warning displayed |

#### Step 6: Clerkships (2 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 14 | should display clerkship selection | Navigate to step 6 | Clerkship list displayed |
| 15 | should show clerkship requirements summary | Select clerkship | Requirements summary visible |

#### Step 7: Teams (2 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 16 | should display team selection | Navigate to step 7 | Team list displayed |
| 17 | should filter teams by clerkship | Select clerkship filter | Teams filtered |

#### Step 8: Review (3 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 18 | should display summary of all selections | Navigate to step 8 | All selections summarized |
| 19 | should allow editing previous steps | Click edit on summary section | Navigates to that step |
| 20 | should create schedule on confirmation | Click create | DB: schedule record created, set as active; UI: redirected to calendar |

#### Complete Flow (2 tests)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 21 | should complete wizard with all steps | Fill all 8 steps sequentially | DB: complete schedule created; UI: success message, calendar |
| 22 | should navigate back and forth between steps | Use back/next buttons | Previous selections preserved |

---

### 4. Student Management (`entities/students.ui.test.ts`)

**Purpose**: Complete student CRUD operations via UI forms

#### Tests (15 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display students list page | Navigate to /students | Student table displayed |
| 2 | should show empty state when no students | Clear students, view page | Empty state message, add button |
| 3 | should navigate to add student form | Click "Add Student" | Form displayed at /students/new |
| 4 | should validate required fields on create | Submit empty form | Name required error |
| 5 | should validate email format | Enter invalid email | Email format error |
| 6 | should create student via form | Fill form, submit | DB: student record created; UI: redirected to list, student visible, toast shown |
| 7 | should display student details | Click student row | Details page displayed with all info |
| 8 | should navigate to edit student form | Click edit button | Edit form displayed with current values |
| 9 | should update student via form | Change name, submit | DB: name updated; UI: updated name visible, toast shown |
| 10 | should delete student via UI | Click delete, confirm | DB: student removed; UI: removed from list, toast shown |
| 11 | should cancel delete operation | Click delete, cancel | Student still exists |
| 12 | should search/filter students | Type in search box | List filtered to matching students |
| 13 | should sort students by column | Click column header | List sorted accordingly |
| 14 | should paginate student list | Navigate pages | Correct students displayed per page |
| 15 | should show student schedule link | View student with assignments | Link to student schedule visible |

---

### 5. Preceptor Management (`entities/preceptors.ui.test.ts`)

**Purpose**: Complete preceptor CRUD and availability management via UI

#### Tests (18 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display preceptors list page | Navigate to /preceptors | Preceptor table displayed |
| 2 | should show empty state when no preceptors | Clear preceptors, view page | Empty state message |
| 3 | should create preceptor via form | Fill form with name, submit | DB: preceptor created; UI: in list, toast |
| 4 | should validate required fields | Submit empty form | Validation errors |
| 5 | should update preceptor details | Edit name, submit | DB: updated; UI: reflects change |
| 6 | should delete preceptor | Delete, confirm | DB: removed; UI: removed from list |
| 7 | should associate preceptor with health system | Select health system in form | DB: association saved |
| 8 | should associate preceptor with sites | Select sites in form | DB: site associations saved |
| 9 | should navigate to availability page | Click availability link | /preceptors/[id]/availability displayed |
| 10 | should set daily availability | Toggle day availability | DB: availability record created |
| 11 | should set availability pattern | Create weekly pattern | DB: pattern saved; UI: calendar reflects |
| 12 | should bulk set availability for date range | Select range, set available | DB: multiple records created |
| 13 | should view preceptor schedule | Click schedule link | /preceptors/[id]/schedule displayed |
| 14 | should filter preceptors by health system | Select filter | List filtered |
| 15 | should filter preceptors by site | Select site filter | List filtered |
| 16 | should show preceptor capacity | View preceptor details | Current/max capacity displayed |
| 17 | should add preceptor to team | Add to team from details | DB: team membership saved |
| 18 | should remove preceptor from team | Remove from team | DB: membership removed |

---

### 6. Health System Management (`entities/health-systems.ui.test.ts`)

**Purpose**: Health system CRUD with site dependencies

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display health systems page | Navigate to /health-systems | List displayed |
| 2 | should create health system | Fill form, submit | DB: created; UI: in list |
| 3 | should validate required fields | Submit empty | Validation errors |
| 4 | should update health system | Edit name, submit | DB: updated; UI: reflects |
| 5 | should delete health system without sites | Delete, confirm | DB: removed |
| 6 | should prevent delete with associated sites | Try delete with sites | Warning displayed, blocked |
| 7 | should show associated sites | View health system | Sites list visible |
| 8 | should show associated preceptors | View health system | Preceptors list visible |
| 9 | should navigate to add site | Click add site | Site form with health system pre-selected |
| 10 | should show student onboarding status | View health system | Onboarding summary visible |

---

### 7. Site Management (`entities/sites.ui.test.ts`)

**Purpose**: Site CRUD within health systems

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display sites page | Navigate to /sites | Sites table displayed |
| 2 | should navigate to add site | Click add | /sites/new displayed |
| 3 | should require health system selection | Submit without health system | Validation error |
| 4 | should create site | Fill form, submit | DB: site created with health_system_id; UI: in list |
| 5 | should update site details | Edit, submit | DB: updated |
| 6 | should delete site without preceptors | Delete, confirm | DB: removed |
| 7 | should warn before deleting site with preceptors | Try delete | Warning shown |
| 8 | should filter sites by health system | Select filter | List filtered |
| 9 | should show associated preceptors | View site | Preceptors at site listed |
| 10 | should edit site from health system page | Navigate via health system | Site edit form |

---

### 8. Clerkship Management (`entities/clerkships.ui.test.ts`)

**Purpose**: Clerkship CRUD and configuration

#### Tests (12 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display clerkships page | Navigate to /clerkships | Clerkship list displayed |
| 2 | should create clerkship | Fill form, submit | DB: created; UI: in list |
| 3 | should validate required fields | Submit empty | Errors shown |
| 4 | should update clerkship | Edit name, submit | DB: updated |
| 5 | should delete clerkship | Delete, confirm | DB: removed |
| 6 | should navigate to clerkship config | Click configure | /clerkships/[id]/config displayed |
| 7 | should set inpatient/outpatient days | Configure days | DB: days saved |
| 8 | should set clerkship requirements | Add requirement | DB: requirement created |
| 9 | should configure allowed sites | Select sites | DB: site associations saved |
| 10 | should configure allowed preceptors | Select preceptors | DB: associations saved |
| 11 | should set scheduling priority | Set priority | DB: priority saved |
| 12 | should configure electives under clerkship | Add elective | DB: elective linked to clerkship |

---

### 9. Team Management (`entities/teams.ui.test.ts`)

**Purpose**: Preceptor team CRUD

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display teams list | Navigate to teams | Team list displayed |
| 2 | should create new team | Fill form, submit | DB: team created |
| 3 | should add preceptors to team | Select preceptors, save | DB: memberships created |
| 4 | should remove preceptor from team | Remove, confirm | DB: membership removed |
| 5 | should update team details | Edit name, submit | DB: updated |
| 6 | should delete team | Delete, confirm | DB: team and memberships removed |
| 7 | should associate team with clerkship | Select clerkship | DB: association saved |
| 8 | should filter teams by clerkship | Select filter | List filtered |

---

### 10. Elective Management (`entities/electives.ui.test.ts`)

**Purpose**: Elective CRUD and configuration

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display electives list | Navigate to electives | List displayed |
| 2 | should create elective | Fill form, submit | DB: elective created |
| 3 | should link elective to clerkship | Select clerkship | DB: linked |
| 4 | should set elective requirements | Configure requirements | DB: saved |
| 5 | should set available preceptors | Select preceptors | DB: associations saved |
| 6 | should update elective | Edit, submit | DB: updated |
| 7 | should delete elective | Delete, confirm | DB: removed |
| 8 | should toggle elective availability | Toggle active status | DB: status changed |

---

### 11. Capacity Rules (`configuration/capacity-rules.ui.test.ts`)

**Purpose**: Configure preceptor capacity constraints

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display capacity rules page | Navigate to config | Rules list displayed |
| 2 | should create capacity rule | Fill form, submit | DB: rule created |
| 3 | should set daily capacity limit | Enter limit | DB: saved |
| 4 | should set weekly capacity limit | Enter limit | DB: saved |
| 5 | should apply rule to specific preceptor | Select preceptor | DB: association saved |
| 6 | should apply rule to preceptor group | Select criteria | DB: saved |
| 7 | should update capacity rule | Edit, submit | DB: updated |
| 8 | should delete capacity rule | Delete, confirm | DB: removed |

---

### 12. Requirements Configuration (`configuration/requirements.ui.test.ts`)

**Purpose**: Configure clerkship scheduling requirements

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display requirements page | Navigate | Requirements displayed |
| 2 | should create requirement | Fill form, submit | DB: created |
| 3 | should set minimum days required | Enter days | DB: saved |
| 4 | should set maximum days allowed | Enter days | DB: saved |
| 5 | should set required health systems | Select systems | DB: saved |
| 6 | should configure site requirements | Select sites | DB: saved |
| 7 | should set team requirements | Select teams | DB: saved |
| 8 | should allow cross-system assignments | Toggle setting | DB: saved |
| 9 | should update requirement | Edit, submit | DB: updated |
| 10 | should delete requirement | Delete, confirm | DB: removed |

---

### 13. Blackout Dates (`configuration/blackout-dates.ui.test.ts`)

**Purpose**: Manage scheduling blackout dates

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display blackout dates page | Navigate | List displayed |
| 2 | should create blackout date | Select date, submit | DB: created |
| 3 | should create date range blackout | Select range | DB: multiple created |
| 4 | should apply blackout to all preceptors | Select scope | DB: global flag set |
| 5 | should apply blackout to specific preceptor | Select preceptor | DB: preceptor-specific |
| 6 | should show blackout on calendar | View calendar | Dates marked |
| 7 | should update blackout date | Edit, submit | DB: updated |
| 8 | should delete blackout date | Delete, confirm | DB: removed |

---

### 14. Preceptor Availability (`configuration/availability.ui.test.ts`)

**Purpose**: Configure preceptor availability patterns

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display availability calendar | Navigate to preceptor availability | Calendar displayed |
| 2 | should toggle single day availability | Click day | DB: record toggled |
| 3 | should bulk select date range | Shift+click range | Multiple days selected |
| 4 | should set all selected as available | Click set available | DB: all marked available |
| 5 | should set all selected as unavailable | Click set unavailable | DB: all marked unavailable |
| 6 | should create recurring pattern | Set weekly pattern | DB: pattern saved |
| 7 | should apply pattern to date range | Generate from pattern | DB: dates populated |
| 8 | should show availability summary | View summary | Statistics displayed |
| 9 | should filter by site | Select site | Availability for site shown |
| 10 | should copy availability from another preceptor | Copy function | DB: matching records created |

---

### 15. Student Onboarding (`configuration/student-onboarding.ui.test.ts`)

**Purpose**: Track student health system onboarding status

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display onboarding status page | Navigate | Status matrix displayed |
| 2 | should show students vs health systems matrix | View page | Matrix with checkboxes |
| 3 | should mark student as onboarded | Check box | DB: onboarding record created |
| 4 | should unmark onboarding status | Uncheck box | DB: record updated |
| 5 | should set completion date | Enter date | DB: date saved |
| 6 | should add onboarding notes | Enter notes | DB: notes saved |
| 7 | should filter by student | Select student | Row filtered |
| 8 | should filter by health system | Select system | Column filtered |
| 9 | should bulk onboard multiple students | Select multiple, confirm | DB: multiple records |
| 10 | should show onboarding requirement warning | View unonboarded student | Warning displayed |

---

### 16. Schedule Generation (`scheduling/schedule-generation.ui.test.ts`)

**Purpose**: Generate schedules via UI and verify results

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display generate schedule page | Navigate | Generate options displayed |
| 2 | should show pre-generation summary | View page | Entity counts, date range shown |
| 3 | should validate before generation | Click generate with issues | Validation warnings displayed |
| 4 | should generate schedule successfully | Click generate | DB: assignments created; UI: progress shown |
| 5 | should display generation progress | During generation | Progress indicator updates |
| 6 | should show generation results | After generation | Summary of assignments displayed |
| 7 | should navigate to calendar after generation | Click view | Calendar with assignments displayed |
| 8 | should show unassigned students | After generation | Unassigned list if any |
| 9 | should respect onboarding constraints | Generate with unonboarded | Those students not assigned to that health system |
| 10 | should respect capacity constraints | Generate | No preceptor over capacity |

---

### 17. Schedule Regeneration (`scheduling/schedule-regeneration.ui.test.ts`)

**Purpose**: Regenerate schedules with changes

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should show regenerate option | View existing schedule | Regenerate button visible |
| 2 | should warn about existing assignments | Click regenerate | Warning displayed |
| 3 | should allow selective regeneration | Select date range | Only that range regenerated |
| 4 | should preserve locked assignments | Lock some, regenerate | Locked unchanged |
| 5 | should regenerate successfully | Confirm regenerate | DB: new assignments; UI: updated calendar |
| 6 | should show what changed | After regeneration | Diff/changelog displayed |
| 7 | should allow undo regeneration | Click undo | Previous assignments restored |
| 8 | should regenerate specific student | Select student, regenerate | Only that student's assignments change |

---

### 18. Multi-Schedule Management (`scheduling/schedule-management.ui.test.ts`)

**Purpose**: Manage multiple scheduling periods

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display schedules list | Navigate to /schedules | All user's schedules listed |
| 2 | should show active schedule indicator | View list | Active marked |
| 3 | should switch active schedule | Click activate | DB: user.active_schedule_id updated; UI: calendar changes |
| 4 | should create new schedule | Click new, complete wizard | DB: schedule created |
| 5 | should duplicate schedule | Click duplicate | DB: new schedule with copied entities |
| 6 | should rename schedule | Edit name, save | DB: name updated |
| 7 | should delete schedule | Delete, confirm | DB: schedule and assignments removed |
| 8 | should prevent deleting active schedule | Try delete active | Warning/block |
| 9 | should archive schedule | Click archive | DB: archived flag set |
| 10 | should filter schedules by year | Select year | List filtered |

---

### 19. Calendar Views (`calendar/calendar-views.ui.test.ts`)

**Purpose**: Calendar navigation and display verification

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display calendar page | Navigate to /calendar | Calendar grid displayed |
| 2 | should show current month by default | Load page | Current month visible |
| 3 | should navigate to previous month | Click prev | Previous month displayed |
| 4 | should navigate to next month | Click next | Next month displayed |
| 5 | should jump to specific date | Use date picker | That date visible |
| 6 | should display assignments on calendar | View with assignments | Assignments shown on correct dates |
| 7 | should color-code by clerkship | View assignments | Different colors per clerkship |
| 8 | should show assignment details on hover | Hover assignment | Tooltip with details |
| 9 | should filter by student | Select student filter | Only their assignments shown |
| 10 | should filter by preceptor | Select preceptor filter | Only their assignments shown |

---

### 20. Assignment Editing (`calendar/assignment-editing.ui.test.ts`)

**Purpose**: Edit assignments from calendar

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should click assignment to open details | Click assignment | Modal/panel opens |
| 2 | should display assignment details | View modal | Student, preceptor, date, clerkship shown |
| 3 | should edit assignment date | Change date, save | DB: date updated; UI: moved on calendar |
| 4 | should change assigned preceptor | Select new preceptor, save | DB: preceptor_id updated |
| 5 | should validate preceptor availability | Try assign to unavailable | Warning displayed |
| 6 | should validate capacity | Try exceed capacity | Warning displayed |
| 7 | should add assignment notes | Enter notes, save | DB: notes saved |
| 8 | should lock assignment | Click lock | DB: locked flag set |
| 9 | should unlock assignment | Click unlock | DB: locked flag cleared |
| 10 | should close modal without saving | Click cancel | No changes persisted |

---

### 21. Assignment Operations (`calendar/assignment-operations.ui.test.ts`)

**Purpose**: Reassign, swap, delete operations

#### Tests (10 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should reassign student to different preceptor | Open assignment, reassign | DB: preceptor changed |
| 2 | should show available preceptors for reassign | Open reassign | List of available preceptors |
| 3 | should swap two students' assignments | Select two, swap | DB: both assignments swapped |
| 4 | should validate swap compatibility | Try incompatible swap | Warning displayed |
| 5 | should delete single assignment | Delete, confirm | DB: assignment removed |
| 6 | should bulk delete assignments | Select multiple, delete | DB: all removed |
| 7 | should drag assignment to new date | Drag and drop | DB: date updated |
| 8 | should copy assignment to another date | Copy action | DB: new assignment created |
| 9 | should show assignment history | View history | Changes listed |
| 10 | should undo last change | Click undo | Previous state restored |

---

### 22. Schedule Export (`export/schedule-export.ui.test.ts`)

**Purpose**: Export schedules to various formats

#### Tests (8 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should display export options | Click export | Export menu displayed |
| 2 | should export to Excel | Select Excel | File downloaded, valid xlsx |
| 3 | should export to PDF | Select PDF | File downloaded, valid PDF |
| 4 | should export filtered view | Apply filter, export | Export matches filter |
| 5 | should export date range | Select range, export | Only that range in export |
| 6 | should export student schedule | From student page, export | Student's schedule exported |
| 7 | should export preceptor schedule | From preceptor page, export | Preceptor's schedule exported |
| 8 | should include all assignment details | Export | All fields present in export |

---

### 23. Complete Scheduling Workflow (`workflows/complete-scheduling-flow.ui.test.ts`)

**Purpose**: End-to-end scheduling from setup to export

#### Tests (5 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should complete full scheduling workflow | Register → Setup entities → Configure → Generate → View → Export | DB: all data created correctly; UI: each step works |
| 2 | should handle workflow with minimal data | Create minimum required entities | Schedule generates successfully |
| 3 | should handle workflow with complex data | Many students, preceptors, constraints | All assignments valid |
| 4 | should recover from generation failure | Cause failure, fix, retry | Eventually succeeds |
| 5 | should support multi-user scenario | Two users with separate schedules | Data isolated correctly |

---

### 24. Student Lifecycle (`workflows/student-lifecycle.ui.test.ts`)

**Purpose**: Track student through entire system

#### Tests (5 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should track student from creation to scheduling | Create → Onboard → Assign | All stages work |
| 2 | should show student progress across clerkships | View student schedule | All clerkship rotations visible |
| 3 | should update student and reflect in assignments | Update student info | Assignments show updated info |
| 4 | should handle student removal gracefully | Delete student with assignments | Assignments handled appropriately |
| 5 | should export individual student schedule | Export from student page | Complete schedule exported |

---

### 25. Preceptor Management Flow (`workflows/preceptor-management-flow.ui.test.ts`)

**Purpose**: Preceptor setup through assignment

#### Tests (5 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should setup preceptor completely | Create → Set availability → Add to team | All configured correctly |
| 2 | should show preceptor workload | After assignments | Workload stats accurate |
| 3 | should handle availability changes | Change availability after assignment | Conflict warnings shown |
| 4 | should reassign when preceptor unavailable | Mark unavailable, reassign | Students reassigned |
| 5 | should deactivate preceptor | Deactivate with assignments | Handled gracefully |

---

### 26. Schedule Adjustment Flow (`workflows/schedule-adjustment-flow.ui.test.ts`)

**Purpose**: Make changes to live schedules

#### Tests (5 total)

| # | Test Name | Actions | Verifications |
|---|-----------|---------|---------------|
| 1 | should adjust schedule after generation | Make edits | Changes saved correctly |
| 2 | should handle conflicting changes | Create conflict, resolve | Conflict resolution works |
| 3 | should track all changes | Make multiple edits | History accurate |
| 4 | should regenerate portion of schedule | Select range, regenerate | Only that portion changes |
| 5 | should export adjusted schedule | Make changes, export | Export reflects changes |

---

## Test Execution Strategy

### Phase 1: Foundation (Week 1)
1. Authentication tests (12 tests)
2. First-time user journey (8 tests)
3. Schedule wizard (22 tests)

### Phase 2: Entity Management (Week 2)
4. Students (15 tests)
5. Preceptors (18 tests)
6. Health Systems (10 tests)
7. Sites (10 tests)
8. Clerkships (12 tests)
9. Teams (8 tests)
10. Electives (8 tests)

### Phase 3: Configuration (Week 3)
11. Capacity Rules (8 tests)
12. Requirements (10 tests)
13. Blackout Dates (8 tests)
14. Availability (10 tests)
15. Student Onboarding (10 tests)

### Phase 4: Scheduling (Week 4)
16. Schedule Generation (10 tests)
17. Schedule Regeneration (8 tests)
18. Schedule Management (10 tests)

### Phase 5: Calendar & Export (Week 5)
19. Calendar Views (10 tests)
20. Assignment Editing (10 tests)
21. Assignment Operations (10 tests)
22. Schedule Export (8 tests)

### Phase 6: Workflows (Week 6)
23. Complete Scheduling Flow (5 tests)
24. Student Lifecycle (5 tests)
25. Preceptor Management Flow (5 tests)
26. Schedule Adjustment Flow (5 tests)

---

## Test Implementation Guidelines

### File Template

```typescript
import { test, expect } from '@playwright/test';
import { getTestDb, executeWithRetry } from '../utils/db-helpers';

test.describe('Feature Name', () => {
  let db: ReturnType<typeof getTestDb>;

  test.beforeAll(async () => {
    db = getTestDb();
  });

  test.beforeEach(async ({ page }) => {
    // Login with real auth
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test.afterEach(async () => {
    // Cleanup test data
  });

  test('should do something', async ({ page }) => {
    // 1. Perform action via UI
    await page.goto('/some-page');
    await page.fill('[name="field"]', 'value');
    await page.click('button[type="submit"]');

    // 2. Verify UI feedback
    await expect(page.getByText('Success')).toBeVisible();
    await expect(page).toHaveURL('/expected-url');

    // 3. Verify database state
    const record = await executeWithRetry(() =>
      db.selectFrom('table').selectAll().where('field', '=', 'value').executeTakeFirst()
    );
    expect(record).toBeDefined();
    expect(record?.field).toBe('value');

    // 4. Verify UI displays persisted data
    await page.reload();
    await expect(page.getByText('value')).toBeVisible();
  });
});
```

### Auth Helper

```typescript
// e2e/utils/auth-helpers.ts
export async function registerUser(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/register');
  await page.fill('[name="name"]', user.name);
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.fill('[name="confirmPassword"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^\/(schedules\/new)?$/);
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^\/(?!login|register)/);
}

export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout"]');
  await page.waitForURL('/login');
}
```

### Database Verification Helper

```typescript
// e2e/utils/db-helpers.ts
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/server/db/types';

export function getTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({
      database: new Database(process.env.DATABASE_URL || 'test.db'),
    }),
  });
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 100
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('executeWithRetry failed');
}
```

---

## Total Test Count

| Category | Tests |
|----------|-------|
| Authentication | 12 |
| Onboarding | 30 |
| Entity Management | 81 |
| Configuration | 46 |
| Scheduling | 28 |
| Calendar & Export | 38 |
| Workflows | 20 |
| **Total** | **255** |

---

## Success Criteria

A test is considered complete when:

1. Test passes consistently (no flaky failures)
2. Database state verified after each mutation
3. UI state verified (correct display, toasts, navigation)
4. Validation errors tested where applicable
5. Test is isolated (doesn't depend on other test state)
6. Test cleans up after itself
7. Code reviewed and follows project conventions

---

## Notes

- Tests should be implemented one at a time and validated before proceeding
- If a test reveals a bug in the application, document it and proceed (or fix if minor)
- Keep test execution time reasonable (under 30 seconds per test ideally)
- Use meaningful test data that reflects real usage
- Prefer data-testid attributes over CSS selectors where possible
