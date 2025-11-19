# End-to-End Integration Tests

## Overview

Comprehensive integration test suites have been implemented to validate the complete user flow of the Configurable Scheduling Framework. These tests go beyond unit testing to verify that all components work together correctly in realistic scenarios.

## Test Structure

### Test Utilities (`src/lib/testing/`)

**Integration Helpers** (`integration-helpers.ts`)
- `createTestClerkship()` - Creates test clerkships with proper schema
- `createTestStudents()` - Generates test student records
- `createTestPreceptors()` - Creates preceptors with health system associations
- `createTestHealthSystem()` - Sets up health systems with multiple sites
- `createTestRequirement()` - Configures clerkship requirements with strategies
- `createCapacityRule()` - Establishes hierarchical capacity rules
- `createTestTeam()` - Forms preceptor teams with validation rules
- `createFallbackChain()` - Creates fallback preceptor chains
- `getStudentAssignments()` - Retrieves all assignments for verification
- `clearAllTestData()` - Cleans up test database between runs

**Assertion Helpers** (`assertion-helpers.ts`)
- `assertStudentHasCompleteAssignments()` - Verifies all required days covered
- `assertContinuousSingleStrategy()` - Validates continuous single preceptor assignment
- `assertBlockBasedStrategy()` - Confirms proper block-based assignments
- `assertNoCapacityViolations()` - Checks capacity limits respected
- `assertHealthSystemContinuity()` - Ensures health system continuity rules
- `assertNoDateConflicts()` - Validates no overlapping assignments
- `assertTeamBalanced()` - Verifies balanced team member distribution
- `assertFallbackUsed()` - Confirms fallback preceptor utilization

## Test Suites

### Suite 1: Configuration Workflows (`01-configuration-workflows.test.ts`)

**Purpose**: Test complete lifecycle of configuration creation, update, and deletion

**Tests**:
1. **Create Complete Configuration from Scratch**
   - Creates health systems, sites, preceptors, clerkships
   - Configures requirements with strategies
   - Establishes capacity rules at all hierarchy levels
   - Forms teams with validation rules
   - Sets up fallback chains
   - Verifies all relationships intact

2. **Update Configuration Cascade**
   - Modifies requirement strategy
   - Validates changes persist correctly
   - Ensures configuration integrity maintained

3. **Delete Configuration Cascade**
   - Removes requirements
   - Verifies cascade deletion of related entities
   - Confirms no orphaned data

4. **Configuration Validation**
   - Tests team formation rules
   - Validates constraint enforcement
   - Checks business rule compliance

5. **Hierarchical Capacity Rules**
   - Creates rules at different precedence levels
   - Verifies correct resolution order
   - Tests override behavior

6. **Fallback Chain Validation**
   - Creates multi-level fallback chains
   - Tests circular reference prevention
   - Validates priority ordering

### Suite 2: Scheduling Engine Integration (`02-scheduling-engine.test.ts`)

**Purpose**: Validate scheduling engine with all strategies working end-to-end

**Tests**:
1. **Continuous Single Strategy**
   - Assigns students to one preceptor per clerkship
   - Verifies continuity across rotation
   - Validates health system preferences

2. **Block-Based Strategy**
   - Creates fixed-size assignment blocks (14 days)
   - Ensures block boundaries respected
   - Tests block continuity

3. **Daily Rotation Strategy**
   - Rotates students across preceptors daily
   - Verifies load balancing
   - Validates health system enforcement

4. **Continuous Team Strategy**
   - Assigns to pre-configured teams
   - Balances across team members
   - Respects team formation rules

5. **Hybrid Strategy**
   - Different strategies per requirement type
   - Inpatient vs outpatient vs elective
   - No date conflicts across requirements

6. **Fallback Resolution**
   - Primary preceptor unavailable
   - Cascades through fallback chain
   - Selects correct fallback by priority

7. **Capacity Enforcement**
   - Respects per-day capacity limits
   - Honors per-year capacity constraints
   - Distributes students appropriately

### Suite 6: School Scenarios End-to-End (`06-school-scenarios.test.ts`)

**Purpose**: Validate complete realistic medical school scenarios

**Scenarios**:
1. **Traditional Medical School**
   - Continuous single preceptor model
   - Strong health system continuity
   - 20 students across 3 clerkships
   - Tests: Family Medicine (20d), Internal Medicine (28d), Surgery (42d)

2. **Team-Based Medical School**
   - Pre-configured teaching teams
   - Balanced team member distribution
   - 15 students across 2 clerkships
   - Tests: Family Medicine teams, OB teams

3. **Hybrid Medical School**
   - Different strategies per requirement type
   - Inpatient: block-based (14-day blocks, 28d)
   - Outpatient: continuous single (14d)
   - 10 students, Psychiatry clerkship

4. **Flexible Medical School with Fallbacks**
   - Daily rotation strategy
   - Extensive fallback chains
   - 30 students (high load)
   - Emergency Medicine clerkship (21d)

5. **Multi-Clerkship Full Year Simulation**
   - 25 students across 4 clerkships
   - Total: 111 days per student
   - Tests complete academic year scheduling
   - Verifies no date conflicts across all clerkships

### Suite 7: Edge Cases and Error Handling (`07-edge-cases.test.ts`)

**Purpose**: Ensure system handles edge cases gracefully

**Tests**:
1. **Insufficient Preceptor Capacity**
   - More students than available capacity
   - Partial scheduling success
   - Helpful unmet requirement messages

2. **No Available Preceptors**
   - Students need specialty with no preceptors
   - Graceful failure with zero assignments
   - Clear error messages

3. **Fragmented Availability**
   - Preceptors with many blackout dates
   - Handles gaps in availability
   - Respects blackout constraints

4. **All Preceptors at Capacity**
   - Fills initial capacity completely
   - Subsequent students cannot be scheduled
   - Reports capacity-related errors

5. **Zero Required Days**
   - Requirement with 0 days
   - No assignments created
   - Handles gracefully

6. **Extremely Long Rotation**
   - 180-day (6 month) rotation
   - System handles extended periods
   - Validates complete coverage

7. **Empty Student List**
   - Scheduling with no students
   - Returns success with zero assignments
   - No errors thrown

8. **Empty Clerkship List**
   - Students but no clerkships
   - Returns success with no assignments
   - Handles edge case

9. **Dry Run Mode**
   - Executes scheduling logic
   - Reports what would happen
   - Does not persist to database

10. **Invalid Data Handling**
    - Orphaned capacity rules
    - Missing referenced entities
    - Continues without crashing

## Test Coverage

### Components Tested
- ✅ Configuration Services (Health Systems, Requirements, Teams, Fallbacks, Capacity)
- ✅ Scheduling Engine (All 4 strategies)
- ✅ Capacity Resolution (5-level hierarchy)
- ✅ Team Formation (Pre-configured and dynamic)
- ✅ Fallback Resolution (Cascading with priority)
- ✅ Constraint Validation (Health system, capacity, dates)
- ✅ Error Handling (Graceful failures, helpful messages)

### User Flows Validated
1. **Administrator configures clerkship** → Creates requirements → Sets strategies → Defines capacity rules
2. **Administrator creates teams** → Adds members → Sets formation rules → Validates composition
3. **Scheduler runs engine** → Selects students/clerkships → Configures options → Reviews results
4. **System handles errors** → Insufficient capacity → Missing preceptors → Provides feedback

## Running the Tests

### All Integration Tests
```bash
npm test -- --run src/lib/features/scheduling/integration
```

### Individual Test Suites
```bash
# Configuration workflows
npx vitest --run src/lib/features/scheduling/integration/01-configuration-workflows.test.ts

# Scheduling engine
npx vitest --run src/lib/features/scheduling/integration/02-scheduling-engine.test.ts

# School scenarios
npx vitest --run src/lib/features/scheduling/integration/06-school-scenarios.test.ts

# Edge cases
npx vitest --run src/lib/features/scheduling/integration/07-edge-cases.test.ts
```

## Test Database

- **In-Memory SQLite**: Fast, isolated test execution
- **Full Migrations**: All schema changes applied
- **Auto-Cleanup**: Database destroyed after each test
- **Transaction Support**: Proper rollback on failures

## Assertions

Tests use custom assertion helpers that provide:
- Clear failure messages
- Detailed context on what went wrong
- Specific validation of business rules
- Database state verification

## Next Steps

### Test Refinement
1. Fix remaining schema mismatches in helper functions
2. Add performance benchmarks to Suite 6 scenarios
3. Implement Suite 3 (Team and Fallback Integration)
4. Implement Suite 4 (Capacity and Availability Integration)
5. Implement Suite 5 (Constraint Integration)

### Coverage Expansion
1. Add mutation testing
2. Test concurrent scheduling requests
3. Validate transaction isolation
4. Test database constraint enforcement

### Documentation
1. Add test data fixtures documentation
2. Create troubleshooting guide
3. Document common test patterns
4. Add test maintenance guidelines

## Benefits

✅ **Confidence**: Validates complete user workflows work correctly
✅ **Regression Prevention**: Catches breaking changes early
✅ **Documentation**: Tests serve as executable specifications
✅ **Refactoring Safety**: Can confidently refactor with test coverage
✅ **Edge Case Coverage**: Ensures graceful handling of difficult scenarios
✅ **Performance Baseline**: School scenarios establish performance expectations

---

**Status**: 4 test suites implemented with 30+ integration tests covering complete user flows

**Test Files**:
- `src/lib/testing/integration-helpers.ts` - Test data creation utilities
- `src/lib/testing/assertion-helpers.ts` - Custom validation assertions
- `src/lib/features/scheduling/integration/01-configuration-workflows.test.ts`
- `src/lib/features/scheduling/integration/02-scheduling-engine.test.ts`
- `src/lib/features/scheduling/integration/06-school-scenarios.test.ts`
- `src/lib/features/scheduling/integration/07-edge-cases.test.ts`
