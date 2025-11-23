# E2E API Test Suite

This directory contains comprehensive end-to-end (e2e) API tests for the LIC Scheduling application.

## Overview

These tests validate API endpoints and complete user workflows using Playwright's request context, providing fast and reliable testing without browser overhead.

## Test Structure

```
e2e/api/
├── helpers/                          # Shared test utilities
│   ├── api-client.ts                 # API request wrapper
│   ├── fixtures.ts                   # Test data factories
│   └── assertions.ts                 # Common assertions and helpers
│
├── students.api.test.ts              # Student CRUD operations
├── preceptors.api.test.ts            # Preceptor CRUD operations
├── clerkships.api.test.ts            # Clerkship CRUD operations
├── sites.api.test.ts                 # Sites and health systems
├── availability-patterns.api.test.ts # Availability and pattern management
├── scheduling-config.api.test.ts     # Configuration endpoints
├── schedules.api.test.ts             # Schedule generation and management
├── calendar.api.test.ts              # Calendar and scheduling periods
│
└── workflows/                        # Complete user journey tests
    ├── complete-scheduling.workflow.test.ts
    └── constraint-validation.workflow.test.ts
```

## Test Categories

### 1. Core Entity Tests
- **students.api.test.ts**: Student creation, retrieval, updates, deletion
- **preceptors.api.test.ts**: Preceptor management with health system/site associations
- **clerkships.api.test.ts**: Clerkship CRUD and configuration
- **sites.api.test.ts**: Site management and clerkship-site associations

### 2. Availability & Patterns Tests
- **availability-patterns.api.test.ts**:
  - Bulk availability updates
  - Pattern creation (weekly, monthly, interval)
  - Pattern generation to availability
  - Saving availability as patterns

### 3. Scheduling Configuration Tests
- **scheduling-config.api.test.ts**:
  - Health systems management
  - Clerkship requirements (inpatient/outpatient/elective)
  - Team creation with priority ordering
  - Capacity rules (per-day, per-year)
  - Fallback chains
  - Electives configuration
  - Global defaults

### 4. Schedule Operations Tests
- **schedules.api.test.ts**:
  - Schedule generation (basic, dry-run, with constraints)
  - Assignment management (CRUD)
  - Reassignment to different preceptors
  - Assignment swapping
  - Schedule clearing (all or from date)
  - Excel export with filters

### 5. Calendar & Periods Tests
- **calendar.api.test.ts**:
  - Calendar event retrieval with filters
  - Calendar summary statistics
  - Scheduling periods management
  - Period activation

### 6. Workflow Tests
Complete end-to-end user journeys:

- **complete-scheduling.workflow.test.ts**:
  - Full setup: health systems → sites → preceptors → students → clerkships
  - Configuration: requirements, capacity rules, availability patterns
  - Schedule generation and verification
  - Schedule editing and export
  - Multi-student scheduling with teams
  - Schedule regeneration from specific dates

- **constraint-validation.workflow.test.ts**:
  - Capacity constraint enforcement
  - Double-booking prevention
  - Health system constraints
  - Site-specific requirements
  - Fallback preceptor usage
  - Team constraint validation

## Helper Utilities

### API Client (`helpers/api-client.ts`)
Wrapper around Playwright's request context providing:
- Simplified HTTP methods (get, post, put, patch, delete)
- Query parameter handling
- Response assertions (expectJson, expectSuccess, expectError)

Example:
```typescript
const api = createApiClient(request);
const response = await api.post('/api/students', studentData);
const student = await api.expectJson(response, 201);
```

### Fixtures (`helpers/fixtures.ts`)
Factory functions for generating test data with unique IDs:
- `fixtures.student()` - Student data
- `fixtures.preceptor()` - Preceptor data
- `fixtures.clerkship()` - Clerkship data
- `fixtures.site()` - Site data
- `fixtures.pattern()` - Availability pattern
- And more...

Example:
```typescript
const studentData = fixtures.student({
  first_name: 'John',
  cohort_year: 2025
});
```

### Assertions (`helpers/assertions.ts`)
Common validation helpers:
- `assertions.hasFields()` - Verify required fields exist
- `assertions.hasId()` - Extract and validate ID field
- `assertions.matchesShape()` - Partial object matching
- `assertions.crud.*` - CRUD operation validation
- `assertions.validationError()` - Error response validation
- `dateHelpers.*` - Date manipulation utilities

Example:
```typescript
assertions.crud.created(student, {
  first_name: 'John',
  email: 'john@test.com'
});
```

## Running Tests

### Run all API tests:
```bash
npm run test:e2e -- e2e/api
```

### Run specific test file:
```bash
npm run test:e2e -- e2e/api/students.api.test.ts
```

### Run workflow tests only:
```bash
npm run test:e2e -- e2e/api/workflows
```

### Run with UI mode for debugging:
```bash
npx playwright test --ui e2e/api
```

## Test Coverage

The test suite provides comprehensive coverage of:

1. **CRUD Operations** (Create, Read, Update, Delete)
   - All major entities
   - Error handling (404, 400, 409)
   - Validation errors

2. **Query Parameters**
   - Filtering by various criteria
   - Date ranges
   - Specialty/type filters

3. **Business Logic**
   - Capacity constraints
   - Health system constraints
   - Site-specific requirements
   - Team configurations
   - Fallback chains

4. **Complex Workflows**
   - Complete scheduling setup
   - Multi-student assignments
   - Schedule regeneration
   - Constraint validation

5. **Edge Cases**
   - Empty results
   - Invalid inputs
   - Duplicate prevention
   - Boundary conditions

## Best Practices

1. **Use helpers**: Leverage api-client, fixtures, and assertions for cleaner tests
2. **Isolate tests**: Each test should create its own data
3. **Clean assertions**: Use semantic assertion helpers instead of raw expect()
4. **Descriptive names**: Test names should clearly describe what is being tested
5. **Arrange-Act-Assert**: Follow AAA pattern for test structure
6. **Async/await**: Always await API calls and assertions

## Notes

- Tests run against the preview server (localhost:4173)
- Database is reset between test files (via Playwright workers)
- Tests are designed to be independent and can run in parallel
- Response validation includes both structure and business logic
- Error cases are tested alongside happy paths

## Maintenance

When adding new API endpoints:
1. Add test data factory to `fixtures.ts` if needed
2. Create or update relevant test file
3. Add workflow tests for complex interactions
4. Update this README with coverage details
