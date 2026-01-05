# Logging Guide

This document explains the logging system in the LIC application and provides patterns for adding logging to new code.

## Table of Contents

- [Overview](#overview)
- [Log Levels](#log-levels)
- [Configuration](#configuration)
- [Usage Patterns](#usage-patterns)
  - [API Routes](#api-routes)
  - [Service Layer](#service-layer)
  - [Scheduling Engine](#scheduling-engine)
  - [Constraints](#constraints)
  - [Client-Side Code](#client-side-code)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

LIC uses a custom logging system with separate server and client implementations. The logger provides:

- **6 log levels** (OFF, ERROR, WARN, INFO, DEBUG, TRACE)
- **Hierarchical prefixes** for module identification
- **Structured context** objects for rich debugging data
- **Environment-based configuration** via `LOG_LEVEL` and `VITE_LOG_LEVEL`
- **Performance-optimized** for hot code paths

**Core Files:**
- `src/lib/utils/logger.ts` - Base Logger class
- `src/lib/utils/logger.server.ts` - Server-side logger
- `src/lib/utils/logger.client.ts` - Client-side logger

---

## Log Levels

Levels are hierarchical - setting a level enables that level and all lower levels:

| Level | Value | Usage | Example |
|-------|-------|-------|---------|
| **OFF** | 0 | No logging | Production silent mode |
| **ERROR** | 1 | Critical failures | Database errors, unhandled exceptions |
| **WARN** | 2 | Expected failures, warnings | Validation errors, deprecated code, conflicts |
| **INFO** | 3 | High-level operations | API requests, successful operations, phase completions |
| **DEBUG** | 4 | Detailed flow | Function entry/exit, parameter values, phase transitions |
| **TRACE** | 5 | Very verbose | Loop iterations, constraint details (disabled by default) |

**Default Level:** `INFO` (if not configured)

---

## Configuration

### Server-Side

Set in `.env`:
```bash
# Production
LOG_LEVEL=ERROR

# Development
LOG_LEVEL=INFO

# Debugging
LOG_LEVEL=DEBUG

# Very verbose debugging
LOG_LEVEL=TRACE
```

### Client-Side

Set in `.env` (must use `VITE_` prefix for Vite):
```bash
# Production
VITE_LOG_LEVEL=ERROR

# Development
VITE_LOG_LEVEL=INFO

# Debugging
VITE_LOG_LEVEL=DEBUG
```

### Accepted Values

- String names: `OFF`, `ERROR`, `WARN`, `WARNING`, `INFO`, `DEBUG`, `TRACE`, `VERBOSE`, `ALL`
- Numeric: `0` through `5`
- Case-insensitive

---

## Usage Patterns

### API Routes

**Pattern:** INFO for requests/responses, DEBUG for details, WARN for client errors, ERROR for server errors

```typescript
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:entity-name');

export const GET: RequestHandler = async ({ params }) => {
  log.debug('Fetching entity', { id: params.id });

  try {
    const entity = await getEntity(db, params.id);

    if (!entity) {
      log.warn('Entity not found', { id: params.id });
      return notFoundResponse('Entity');
    }

    log.info('Entity fetched', {
      id: params.id,
      name: entity.name
    });

    return successResponse(entity);
  } catch (error) {
    log.error('Failed to fetch entity', {
      id: params.id,
      error
    });
    return handleApiError(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  log.debug('Creating entity');

  try {
    const body = await request.json();
    const validated = schema.parse(body);

    const entity = await createEntity(db, validated);

    log.info('Entity created', {
      id: entity.id,
      name: entity.name
    });

    return successResponse(entity, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      log.warn('Entity validation failed', {
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
      return validationErrorResponse(error);
    }

    log.error('Failed to create entity', { error });
    return handleApiError(error);
  }
};
```

**Key Points:**
- Use DEBUG at start of handler
- Use INFO for successful operations with key metrics
- Use WARN for expected failures (validation, not found, conflicts)
- Use ERROR for unexpected failures with stack traces

---

### Service Layer

**Pattern:** DEBUG for operations, INFO for summaries, TRACE for queries

```typescript
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:entity-name');

export async function getEntityById(
  db: Kysely<DB>,
  id: string
): Promise<Entity | null> {
  log.trace('Querying entity', { id });

  try {
    const entity = await db
      .selectFrom('entities')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!entity) {
      log.debug('Entity not found', { id });
      return null;
    }

    log.debug('Entity retrieved', { id, name: entity.name });
    return entity;
  } catch (error) {
    log.error('Database query failed', { id, error });
    throw error;
  }
}

export async function complexOperation(
  db: Kysely<DB>,
  params: ComplexParams
): Promise<Result> {
  log.info('Starting complex operation', {
    paramKey: params.key,
    itemCount: params.items.length
  });

  try {
    log.debug('Phase 1: Validation');
    const validated = await validateInput(params);

    log.debug('Phase 2: Processing', {
      validatedCount: validated.length
    });
    const processed = await processItems(validated);

    log.debug('Phase 3: Saving results');
    const saved = await saveResults(db, processed);

    log.info('Complex operation completed', {
      inputCount: params.items.length,
      outputCount: saved.length,
      successRate: (saved.length / params.items.length) * 100
    });

    return { success: true, results: saved };
  } catch (error) {
    log.error('Complex operation failed', {
      params,
      error
    });
    throw error;
  }
}
```

**Key Points:**
- Use TRACE for low-level operations (usually disabled)
- Use DEBUG for function-level operations
- Use INFO for high-level summaries with metrics
- Log aggregates instead of individual items in loops

---

### Scheduling Engine

**Pattern:** INFO for phases, DEBUG for student-level, TRACE for details, NO logging in hot loops

```typescript
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('scheduling-engine');

async schedule(
  studentIds: string[],
  clerkshipIds: string[],
  options: EngineOptions
): Promise<SchedulingResult> {
  log.info('Starting scheduling', {
    studentCount: studentIds.length,
    clerkshipCount: clerkshipIds.length,
    dateRange: `${options.startDate} to ${options.endDate}`
  });

  // Phase 1: Load data
  log.debug('Phase 1: Loading data');
  const students = await this.loadStudents(studentIds);
  const clerkships = await this.loadClerkships(clerkshipIds);

  log.info('Data loaded', {
    studentCount: students.length,
    clerkshipCount: clerkships.length
  });

  // Phase 2: Schedule students
  log.debug('Phase 2: Scheduling students');

  // DO NOT log inside this loop (hot path)
  for (const student of students) {
    for (const clerkship of clerkships) {
      // No logging here
      await this.scheduleStudentToClerkship(student, clerkship, options);
    }
  }

  log.info('Scheduling complete', {
    totalAssignments: result.assignments.length,
    unmetRequirements: result.unmetRequirements.length,
    success: result.success
  });

  return result;
}
```

**Key Points:**
- Use INFO for phase boundaries and final results
- Use DEBUG for phase details
- **NEVER log inside loops** over students/clerkships/dates
- Log aggregates after loops complete

---

### Constraints

**Pattern:** TRACE only, with explicit level checks, ERROR for unexpected conditions

```typescript
import { createServerLogger, LogLevel } from '$lib/utils/logger.server';

const log = createServerLogger('constraint:preceptor-capacity');

export class PreceptorCapacityConstraint implements Constraint {
  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean {
    // NO DEBUG/INFO logging - constraints are called thousands of times

    const preceptor = context.preceptors.find(p => p.id === assignment.preceptorId);

    if (!preceptor) {
      // Only ERROR for unexpected conditions
      log.error('Preceptor not found in context', {
        preceptorId: assignment.preceptorId
      });
      return false;
    }

    const currentCapacity = getCurrentCapacity(assignment, context);
    const isValid = currentCapacity < Number(preceptor.max_students);

    if (!isValid) {
      // TRACE level ONLY, with explicit check
      if (log.isLevelEnabled(LogLevel.TRACE)) {
        log.trace('Capacity constraint violated', {
          preceptorId: preceptor.id,
          preceptorName: preceptor.name,
          date: assignment.date,
          currentCapacity,
          maxCapacity: preceptor.max_students
        });
      }

      violationTracker.recordViolation(
        this.name,
        assignment,
        this.getViolationMessage(assignment, context)
      );
    }

    return isValid;
  }
}
```

**Key Points:**
- **CRITICAL:** NO DEBUG/INFO logging in constraints
- Use TRACE only, with `isLevelEnabled()` check
- Only ERROR for truly exceptional conditions
- Constraints are the hottest path - must be performance-optimized

---

### Client-Side Code

**Pattern:** INFO for user actions, DEBUG for component lifecycle, WARN for user errors

```typescript
import { createClientLogger } from '$lib/utils/logger.client';

const log = createClientLogger('component:schedule-page');

// Component lifecycle
$effect(() => {
  log.info('Schedule page loaded', {
    scheduleId: data.schedule.id,
    assignmentCount: data.schedule.assignments.length
  });

  return () => {
    log.debug('Schedule page unmounting');
  };
});

// User interactions
function handleAssignmentClick(assignmentId: string) {
  log.debug('Assignment clicked', { assignmentId });
  // ... handle click
}

// Successful operations
async function handleSave() {
  log.debug('Saving schedule');

  try {
    const result = await saveSchedule(data.schedule);

    log.info('Schedule saved', {
      scheduleId: result.id,
      changeCount: result.changes.length
    });
  } catch (error) {
    log.error('Failed to save schedule', {
      scheduleId: data.schedule.id,
      error
    });
  }
}

// User errors
function handleInvalidAction() {
  log.warn('Invalid action attempted', {
    reason: 'No assignment selected'
  });
}
```

**Key Points:**
- Use INFO for user-visible operations
- Use DEBUG for internal state changes
- Use WARN for user errors
- Use ERROR for network/unexpected failures

---

## Performance Considerations

### Hot Paths - Critical Rules

**DO NOT LOG IN:**
1. ❌ Loops over dates (365+ iterations)
2. ❌ Loops over students × clerkships (100+ × 10+ iterations)
3. ❌ Constraint validation (called thousands of times)
4. ❌ Capacity checks (called for every assignment attempt)

**Instead:**
```typescript
// ❌ BAD - logs 365 times
for (const date of dates) {
  log.debug('Processing date', { date });
  processDate(date);
}

// ✅ GOOD - logs once before and after
log.debug('Processing dates', { count: dates.length });
for (const date of dates) {
  processDate(date);
}
log.info('Dates processed', {
  count: dates.length,
  successCount: results.length
});
```

### Level Checks for Expensive Operations

Use `isLevelEnabled()` for expensive serialization:

```typescript
if (log.isLevelEnabled(LogLevel.DEBUG)) {
  log.debug('Complex data', {
    expensive: JSON.stringify(largeObject)
  });
}
```

### Keep Context Objects Small

```typescript
// ❌ BAD - serializes entire object
log.info('Student created', { student });

// ✅ GOOD - just IDs and key fields
log.info('Student created', {
  id: student.id,
  name: student.name,
  email: student.email
});
```

---

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Correct usage
log.error('Database connection failed', { error });     // Unexpected failure
log.warn('Validation failed', { errors });              // Expected failure
log.info('Schedule generated', { assignmentCount });    // Successful operation
log.debug('Loading students', { filter });              // Detailed flow
log.trace('Query result', { rows });                    // Very verbose
```

### 2. Include Relevant Context

```typescript
// ❌ BAD - not enough context
log.error('Failed to create');

// ✅ GOOD - actionable context
log.error('Failed to create student', {
  name: data.name,
  email: data.email,
  error: error.message,
  stack: error.stack
});
```

### 3. Use Hierarchical Prefixes

```typescript
// API routes
const log = createServerLogger('api:students');
const log = createServerLogger('api:schedules-generate');

// Services
const log = createServerLogger('service:student');
const log = createServerLogger('service:scheduling-engine');

// Strategies
const log = createServerLogger('strategy:team-continuity');

// Constraints
const log = createServerLogger('constraint:preceptor-capacity');

// Components
const log = createClientLogger('component:schedule-page');
const log = createClientLogger('api-client:schedules');
```

### 4. Don't Log Sensitive Data

```typescript
// ❌ BAD - logs password
log.debug('User login', { email, password });

// ✅ GOOD - no sensitive data
log.debug('User login attempt', { email });
```

### 5. Use Structured Logging

```typescript
// ❌ BAD - string concatenation
log.info(`Student ${student.id} created with email ${student.email}`);

// ✅ GOOD - structured context
log.info('Student created', {
  id: student.id,
  email: student.email
});
```

---

## Examples

### Example: API Route with Full Logging

See `src/routes/api/students/+server.ts` for a complete example showing:
- DEBUG for incoming requests
- INFO for successful operations
- WARN for validation failures
- ERROR for unexpected failures

### Example: Complex Multi-Phase Operation

See `src/routes/api/schedules/generate/+server.ts` for a complex example showing:
- INFO for phase boundaries
- DEBUG for sub-operations
- Detailed metrics at each stage
- Comprehensive error handling

### Example: Service Layer

See `src/lib/features/students/services/student-service.ts` for service pattern (to be updated)

### Example: Client-Side

See `src/lib/features/schedules/clients/schedule-views-client.ts` for client-side pattern

---

## Troubleshooting

### "Too many logs in development"

Set `LOG_LEVEL=INFO` instead of `DEBUG`:
```bash
LOG_LEVEL=INFO
```

### "Scheduling is slow"

Check that:
1. `LOG_LEVEL=OFF` or `ERROR` in production
2. Constraints don't log at DEBUG/INFO
3. No logging inside hot loops

### "Can't find error in logs"

Temporarily increase level:
```bash
LOG_LEVEL=DEBUG  # or TRACE for very detailed
```

Filter by prefix:
```bash
# Server logs
grep "api:students" logs.txt
grep "scheduling-engine" logs.txt

# Client logs (browser console)
# Filter by "[client:schedule-views-client]"
```

---

## Migration Checklist

When adding logging to existing code:

- [ ] Import `createServerLogger` or `createClientLogger`
- [ ] Create logger with appropriate prefix
- [ ] Add DEBUG at function entry (if not hot path)
- [ ] Add INFO for successful operations with metrics
- [ ] Add WARN for expected failures
- [ ] Add ERROR for unexpected failures with stack traces
- [ ] Remove any `console.log/warn/error` statements
- [ ] Test with different log levels (OFF, ERROR, INFO, DEBUG)
- [ ] Verify no performance impact (especially constraints/loops)

---

## Summary

- **Use INFO** for operations users care about (API requests, successful operations)
- **Use DEBUG** for developer debugging (function flow, parameters)
- **Use TRACE** sparingly for very detailed debugging
- **Use WARN** for expected failures (validation, not found)
- **Use ERROR** for unexpected failures (with stack traces)
- **Never log in hot paths** (constraints, tight loops)
- **Keep context objects small** (IDs and key fields only)
- **Use level checks** for expensive operations

For questions or suggestions, see the logging system implementation in `src/lib/utils/logger.ts`.
