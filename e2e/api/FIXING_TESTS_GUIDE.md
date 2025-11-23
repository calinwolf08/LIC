# Guide: Fixing E2E API Tests

This guide shows the pattern for updating test files to work with the actual API structure.

## ✅ Working Example

**File**: `students.api.test.ts` - All 14 tests passing!

## 🔧 Changes Required

### 1. Update Response Handling

**Before** (❌ Doesn't work):
```typescript
const response = await api.post('/api/students', studentData);
const student = await api.expectJson(response, 201);
```

**After** (✅ Works):
```typescript
const response = await api.post('/api/students', studentData);
const student = await api.expectData(response, 201);  // Auto-unwraps {success, data} format
```

### 2. Update Field Names to Match Actual Schema

**Before** (❌ Old assumptions):
```typescript
const studentData = fixtures.student({
  first_name: 'John',
  last_name: 'Doe',
  cohort_year: 2025
});

assertions.crud.created(student, {
  first_name: studentData.first_name,
  last_name: studentData.last_name
});
```

**After** (✅ Actual schema):
```typescript
const studentData = fixtures.student({
  name: 'John Doe'
});

assertions.crud.created(student, {
  name: studentData.name,
  email: studentData.email
});
```

### 3. Use UUIDs for Non-Existent IDs

**Before** (❌ Assumes numeric IDs):
```typescript
const response = await api.get('/api/students/999999');
```

**After** (✅ Uses UUID format):
```typescript
const response = await api.get('/api/students/00000000-0000-0000-0000-000000000000');
```

### 4. Update Field Expectations

**Before** (❌ Wrong fields):
```typescript
assertions.hasFields(student, ['id', 'first_name', 'last_name', 'email', 'cohort_year']);
```

**After** (✅ Actual fields):
```typescript
assertions.hasFields(student, ['id', 'name', 'email']);
```

### 5. Handle List Responses Flexibly

**Before** (❌ Assumes specific format):
```typescript
const students = await api.expectJson<any[]>(response);
const items = assertions.hasItems(students);
```

**After** (✅ Handles both formats):
```typescript
const result = await api.expectData<any[]>(response);
const students = Array.isArray(result) ? result : (result as any).items || result;
```

## 📋 Helper Updates Made

### Updated Helpers (Already Fixed)

1. **`api-client.ts`**:
   - Added `expectData()` method to auto-unwrap `{success, data}` responses
   - `expectJson()` still available for raw responses

2. **`assertions.ts`**:
   - `hasId()` - Now supports both string UUIDs and numeric IDs
   - `hasErrorMessage()` - Handles nested error format: `{success: false, error: {message: string}}`
   - `validationError()` - Updated for nested error format
   - `notFoundError()` - Updated for nested error format
   - `crud.created()` - Supports string or number IDs

3. **`fixtures.ts`**:
   - Already updated to match actual schemas
   - `student()` generates `{name, email}`
   - `preceptor()` generates `{name, email, specialty, health_system_id, max_students}`
   - `clerkship()` generates `{name, specialty, clerkship_type, required_days}`

## 🎯 Step-by-Step Fix Process

### For Each Test File:

1. **Find all `expectJson()` calls** → Change to `expectData()`
2. **Update fixture usage** → Remove non-existent fields
3. **Fix assertions** → Use actual field names
4. **Update hasFields()** → Only check fields that exist
5. **Fix 404 tests** → Use UUID format for non-existent IDs
6. **Run tests** → `npm run test:e2e -- e2e/api/filename.test.ts`
7. **Iterate until passing**

## 📝 Quick Reference: Actual Schemas

### Student
```typescript
{
  name: string;
  email: string;
}
```

### Preceptor
```typescript
{
  name: string;
  email: string;
  specialty: string;
  health_system_id: string;  // UUID, required
  max_students: number;
}
```

### Clerkship
```typescript
{
  name: string;
  specialty: string;
  clerkship_type: string;     // 'required' | 'elective' | etc.
  required_days: number;
  description?: string;
}
```

### Health System
```typescript
{
  name: string;
  abbreviation: string;
}
```

### Site
```typescript
{
  name: string;
  health_system_id: string;  // UUID, required
  site_type: 'clinic' | 'hospital' | 'mixed';
  address?: string;
}
```

## 🚦 Test Status

| File | Status | Notes |
|------|--------|-------|
| `students.api.test.ts` | ✅ **PASSING (14/14)** | Template for others |
| `simple-crud.api.test.ts` | ⚠️ Needs update | Update to use `expectData()` |
| `preceptors.api.test.ts` | ⚠️ Needs update | Fix field names, ensure health_system_id |
| `clerkships.api.test.ts` | ⚠️ Needs update | Update schema fields |
| `sites.api.test.ts` | ⚠️ Needs update | Verify all fields |
| Others | ⚠️ Needs review | May reference non-existent endpoints |

## 💡 Pro Tips

1. **Start simple**: Fix `simple-crud.api.test.ts` next (it's already close)
2. **One file at a time**: Get each file fully passing before moving to the next
3. **Check actual API**: When in doubt, look at `src/routes/api/*/+server.ts`
4. **Use working test as reference**: `students.api.test.ts` is your template
5. **Test frequently**: Run tests after each small change

## 🎬 Next Files to Fix

Recommended order:
1. ✅ `students.api.test.ts` - DONE!
2. `simple-crud.api.test.ts` - Just needs `expectData()` updates
3. `preceptors.api.test.ts` - Similar to students, just ensure health_system_id
4. `clerkships.api.test.ts` - Update schema fields
5. `sites.api.test.ts` - Should be straightforward

## 🔍 Finding Actual Schemas

```bash
# Find API endpoints
find src/routes/api -name "+server.ts"

# Check schema file
cat src/lib/features/students/schemas.ts
cat src/lib/features/preceptors/schemas.ts
cat src/lib/features/clerkships/schemas.ts
```

## ✨ Success Pattern

```typescript
// 1. Create test data using fixtures
const data = fixtures.student();

// 2. Make API call
const response = await api.post('/api/students', data);

// 3. Unwrap response with expectData()
const result = await api.expectData(response, 201);

// 4. Assert using actual fields
assertions.crud.created(result, {
  name: data.name,
  email: data.email
});

// 5. Win! 🎉
```
