# E2E API Test Implementation Status

## Summary

This directory contains a comprehensive e2e API test infrastructure for the LIC Scheduling application. The test helpers and structure are complete, but individual test files need refinement to match the actual API structure.

## What's Complete ✅

### Test Infrastructure
- ✅ **API Client** (`helpers/api-client.ts`) - Request wrapper with response assertions
  - `expectJson()` - Returns raw response
  - `expectData()` - Auto-unwraps `{success, data}` format
  - `expectSuccess()` - Validates 2xx responses
  - `expectError()` - Validates error responses

- ✅ **Fixtures** (`helpers/fixtures.ts`) - Test data factories
  - Updated to match actual API schemas (name instead of first_name/last_name, etc.)
  - Unique ID generation to avoid conflicts

- ✅ **Assertions** (`helpers/assertions.ts`) - Common validation helpers
  - Field validation
  - CRUD operation assertions
  - Error handling assertions
  - Date helpers

### Test Files Created
- `students.api.test.ts` - Student CRUD operations
- `preceptors.api.test.ts` - Preceptor management
- `clerkships.api.test.ts` - Clerkship operations
- `sites.api.test.ts` - Sites and associations
- `availability-patterns.api.test.ts` - Availability and pattern management
- `scheduling-config.api.test.ts` - Configuration endpoints
- `schedules.api.test.ts` - Schedule generation and management
- `calendar.api.test.ts` - Calendar and scheduling periods
- `workflows/complete-scheduling.workflow.test.ts` - End-to-end workflows
- `workflows/constraint-validation.workflow.test.ts` - Constraint testing

## What Needs Work 🔧

### API Response Format
The actual API wraps responses in this format:
```json
{
  "success": true,
  "data": { ...actual data... }
}
```

**Action Needed**: Update all test files to use `expectData()` instead of `expectJson()`, or manually unwrap the `.data` field.

### API Schema Differences

The actual API schemas differ from initial assumptions:

**Student**:
- ✅ Correct: `{ name, email }`
- ❌ Assumed: `{ first_name, last_name, email, cohort_year }`

**Preceptor**:
- ✅ Correct: `{ name, email, specialty, health_system_id, max_students }`
- ❌ Assumed: `{ first_name, last_name, email, specialty, health_system_id?, site_id? }`

**Clerkship**:
- ✅ Correct: `{ name, specialty, clerkship_type, required_days, description? }`
- ❌ Assumed: `{ name, specialty, duration_weeks, start_date, end_date, inpatient_days?, outpatient_days? }`

**Action Needed**: Review and update individual test files to match actual API schemas.

### Unknown Endpoints

Many endpoints referenced in tests haven't been verified:
- Availability patterns endpoints (`/api/preceptors/:id/patterns`)
- Scheduling periods (`/api/scheduling-periods`)
- Various scheduling configuration endpoints
- Assignment swap/reassign endpoints

**Action Needed**: Verify which endpoints actually exist and update tests accordingly.

## How to Fix Tests

### Step 1: Use the Correct Helper Method

Update from:
```typescript
const response = await api.post('/api/students', data);
const student = await api.expectJson(response, 201);
expect(student.name).toBe('...');  // ❌ Won't work
```

To:
```typescript
const response = await api.post('/api/students', data);
const student = await api.expectData(response, 201);
expect(student.name).toBe('...');  // ✅ Works
```

### Step 2: Use Correct Field Names

The fixtures have been updated, but assertions in tests need review:
```typescript
// ❌ Old (incorrect)
assertions.crud.created(student, {
  first_name: studentData.first_name,
  last_name: studentData.last_name
});

// ✅ New (correct)
assertions.crud.created(student, {
  name: studentData.name,
  email: studentData.email
});
```

### Step 3: Verify Endpoint Existence

Before relying on a test, verify the endpoint exists:
```bash
# Check if endpoint is defined
grep -r "export const POST" src/routes/api/students/+server.ts
```

## Running Tests

```bash
# Run all API tests (many will fail until updated)
npm run test:e2e -- e2e/api

# Run specific test file
npm run test:e2e -- e2e/api/students.api.test.ts

# Run with UI for debugging
npx playwright test --ui e2e/api/students.api.test.ts
```

## Next Steps

1. **Quick Win**: Create simple working examples for each major endpoint
2. **Systematic Fix**: Go through each test file and update to actual API structure
3. **Verify Coverage**: Run tests and verify they cover actual functionality
4. **Add Missing Tests**: Add tests for any endpoints not yet covered

## Notes

- The test infrastructure (helpers, client, assertions) is solid and ready to use
- The test structure and organization is good
- Main work needed is updating individual tests to match actual API
- This is normal - initial API assumptions often differ from implementation
- The comprehensive structure makes it easy to add/fix tests incrementally
