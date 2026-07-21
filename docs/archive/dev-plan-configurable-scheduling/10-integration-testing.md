# Step 10: End-to-End Integration Testing

## Objective

Create comprehensive end-to-end integration tests that validate the entire configurable scheduling system works correctly. These tests will cover all components working together, from configuration creation through schedule generation, ensuring the system meets all requirements.

## Scope

### Test Categories

1. **Full Workflow Tests** - Complete configuration to schedule generation
2. **Cross-Component Integration** - Services + Engine + Strategies working together
3. **Data Integrity Tests** - Database constraints and cascades
4. **Edge Case Tests** - Boundary conditions and error scenarios
5. **Performance Tests** - Scalability and response times
6. **Regression Tests** - Ensure existing functionality preserved
7. **School Scenario Validation** - All 4 schools work end-to-end

## Integration Test Suites

### Suite 1: Complete Configuration Workflows

**Purpose**: Validate full configuration lifecycle

**Tests**:

1. **Create Complete Configuration from Scratch**
   - Start with empty database (clean slate)
   - Create health systems via service
   - Create preceptors via service
   - Create clerkship configuration via service
   - Add requirements via service
   - Add electives via service
   - Create teams via service
   - Create fallback chains via service
   - Set capacity rules via service
   - Validate complete configuration
   - Verify all data persisted correctly
   - Verify all relationships intact

2. **Update Configuration Cascade**
   - Create initial configuration
   - Update parent configuration (change strategy)
   - Verify child configurations updated appropriately
   - Verify constraints maintained
   - Verify no orphaned data

3. **Delete Configuration Cascade**
   - Create complete configuration
   - Delete configuration
   - Verify all child entities deleted
   - Verify no orphaned records
   - Verify foreign key constraints enforced

4. **Clone Configuration**
   - Create source configuration
   - Clone to target clerkship
   - Verify all aspects copied
   - Verify independent (changes to source don't affect target)
   - Verify validation still passes

### Suite 2: Scheduling Engine Integration

**Purpose**: Validate scheduling engine uses configurations correctly

**Tests**:

1. **Continuous Single Strategy End-to-End**
   - Create clerkship with continuous single strategy
   - Create students needing this clerkship
   - Run scheduling engine
   - Verify each student assigned to one preceptor
   - Verify all days covered
   - Verify no constraint violations
   - Verify health system continuity if configured

2. **Continuous Team Strategy End-to-End**
   - Create clerkship with team strategy
   - Create pre-configured teams
   - Create students
   - Run scheduling engine
   - Verify students assigned to teams
   - Verify days balanced across team members
   - Verify team formation rules respected
   - Verify all requirements met

3. **Block-Based Strategy End-to-End**
   - Create clerkship with block strategy (14-day blocks)
   - Create students
   - Run scheduling engine
   - Verify assignments in 14-day blocks
   - Verify block boundaries respected
   - Verify preceptor continuity across blocks (if configured)
   - Verify all requirements met

4. **Daily Rotation Strategy End-to-End**
   - Create clerkship with daily rotation strategy
   - Create students
   - Run scheduling engine
   - Verify day-by-day assignments
   - Verify load balancing across preceptors
   - Verify all requirements met

5. **Hybrid Strategy End-to-End**
   - Create clerkship with hybrid strategy
   - Configure different strategies per requirement type
   - Create students
   - Run scheduling engine
   - Verify each requirement type uses correct strategy
   - Verify no date conflicts across requirements
   - Verify all requirements met

### Suite 3: Team and Fallback Integration

**Purpose**: Validate team formation and fallback logic in real scenarios

**Tests**:

1. **Pre-configured Team Usage**
   - Create teams in database
   - Configure clerkship to use teams
   - Run scheduling
   - Verify pre-configured teams used
   - Verify no dynamic team formation

2. **Dynamic Team Formation**
   - Configure team strategy but no pre-configured teams
   - Run scheduling
   - Verify engine dynamically forms valid teams
   - Verify team formation rules respected
   - Verify teams are stable (deterministic)

3. **Fallback Resolution - Complete Unavailability**
   - Create primary preceptor unavailable for all days
   - Configure fallback chain
   - Run scheduling
   - Verify fallback used for entire assignment
   - Verify fallback priority order respected

4. **Fallback Resolution - Partial Unavailability**
   - Create primary preceptor unavailable for some days
   - Configure fallback chain
   - Run scheduling
   - Verify primary used for available days
   - Verify fallback used for unavailable days
   - Verify student has mixed assignment

5. **Cascading Fallbacks**
   - Create primary unavailable
   - Create first fallback unavailable
   - Create second fallback available
   - Run scheduling
   - Verify engine cascades through chain
   - Verify correct fallback selected

6. **Circular Reference Prevention**
   - Attempt to create circular fallback chain
   - Verify service rejects creation
   - Verify error message helpful

### Suite 4: Capacity and Availability Integration

**Purpose**: Validate capacity checking in real scheduling scenarios

**Tests**:

1. **Per-Day Capacity Enforcement**
   - Create preceptor with max 2 students per day
   - Create 5 students needing same clerkship
   - Run scheduling
   - Verify no day has more than 2 students assigned to preceptor
   - Verify students distributed across available preceptors

2. **Per-Year Capacity Enforcement**
   - Create preceptor with max 3 students per year
   - Create 10 students across multiple clerkships
   - Run scheduling
   - Verify preceptor assigned to max 3 students total
   - Verify remaining students assigned to other preceptors

3. **Per-Block Capacity Enforcement**
   - Create preceptor with max 2 blocks per year
   - Create block-based clerkship
   - Create multiple students
   - Run scheduling
   - Verify preceptor assigned to max 2 blocks
   - Verify blocks non-overlapping

4. **Capacity Rule Hierarchy**
   - Create general capacity rule for preceptor
   - Create clerkship-specific override
   - Run scheduling for both general and specific clerkships
   - Verify specific rule used for specific clerkship
   - Verify general rule used for others

### Suite 5: Constraint Integration

**Purpose**: Validate all constraints work with configuration system

**Tests**:

1. **Health System Continuity - Enforced**
   - Configure clerkship to enforce same health system
   - Create students with preceptors in multiple systems
   - Run scheduling
   - Verify each student stays in one health system
   - Verify no cross-system assignments

2. **Health System Continuity - Preferred**
   - Configure clerkship to prefer same health system
   - Create constrained scenario (limited availability)
   - Run scheduling
   - Verify preference honored when possible
   - Verify cross-system allowed when necessary

3. **Health System Continuity - No Preference**
   - Configure clerkship with no health system preference
   - Run scheduling
   - Verify cross-system assignments occur
   - Verify assignments still valid

4. **All Constraints Together**
   - Enable all constraints
   - Create realistic scenario
   - Run scheduling
   - Verify no constraint violations
   - Verify optimal schedule generated

### Suite 6: School Scenarios End-to-End

**Purpose**: Validate all 4 sample schools work completely

**Tests**:

1. **School A: Traditional - Full Year Simulation**
   - Load School A configuration
   - Create 20 students
   - Create realistic preceptor availability
   - Run scheduling for full academic year
   - Verify all students scheduled
   - Verify all use single preceptor per clerkship
   - Verify health system consistency
   - Verify no violations
   - Generate report

2. **School B: Team-Based - Full Year Simulation**
   - Load School B configuration
   - Create 25 students
   - Create team preceptor availability
   - Run scheduling for full academic year
   - Verify all students assigned to teams
   - Verify balanced distribution across team members
   - Verify all team rules respected
   - Verify no violations
   - Generate report

3. **School C: Hybrid - Full Year Simulation**
   - Load School C configuration
   - Create 15 students
   - Create preceptor availability for inpatient/outpatient/elective
   - Run scheduling for full academic year
   - Verify outpatient uses continuous single
   - Verify inpatient uses 14-day blocks
   - Verify electives use daily rotation
   - Verify all requirements met
   - Verify no violations
   - Generate report

4. **School D: Flexible - Full Year Simulation**
   - Load School D configuration
   - Create 30 students (high load)
   - Create varied preceptor availability
   - Configure extensive fallback chains
   - Run scheduling for full academic year
   - Verify day-by-day assignments
   - Verify load balanced across preceptors
   - Verify fallbacks used appropriately
   - Verify all requirements met
   - Verify no violations
   - Generate report

5. **Cross-School Comparison**
   - Run all 4 schools with identical student counts
   - Compare scheduling results:
     - Total assignments
     - Preceptor utilization rates
     - Health system distribution patterns
     - Number of preceptor transitions per student
     - Constraint violation counts (should be zero)
   - Generate comparison report
   - Verify each school achieves its goals

### Suite 7: Edge Cases and Error Handling

**Purpose**: Validate system handles edge cases gracefully

**Tests**:

1. **Insufficient Preceptor Capacity**
   - Create more students than available preceptor capacity
   - Run scheduling
   - Verify partial success (some students scheduled)
   - Verify unmet requirements reported accurately
   - Verify helpful error messages

2. **No Available Preceptors**
   - Create students needing specialty with no preceptors
   - Run scheduling
   - Verify graceful failure
   - Verify all students reported as unscheduled
   - Verify helpful error messages

3. **Conflicting Configuration Constraints**
   - Create configuration with impossible constraints
   - Run validation
   - Verify validation catches conflicts
   - Verify helpful error messages
   - Verify scheduling fails predictably

4. **Fragmented Availability**
   - Create preceptors with lots of gaps in availability
   - Run scheduling
   - Verify engine handles gaps correctly
   - Verify continuous strategies may fail gracefully
   - Verify daily rotation succeeds

5. **Edge Dates (Year Boundaries)**
   - Create scheduling period spanning year boundary
   - Run scheduling
   - Verify assignments span boundary correctly
   - Verify capacity tracking handles year change

6. **Concurrent Modifications**
   - Simulate concurrent configuration updates
   - Verify database transactions prevent conflicts
   - Verify data integrity maintained

### Suite 8: Performance and Scalability

**Purpose**: Validate system performs acceptably at scale

**Tests**:

1. **Small Scale Baseline** (10 students, 3 clerkships)
   - Measure scheduling time
   - Measure memory usage
   - Establish baseline
   - Should complete in < 1 second

2. **Medium Scale** (100 students, 10 clerkships)
   - Measure scheduling time
   - Measure memory usage
   - Verify acceptable performance (< 10 seconds)
   - Verify results correct

3. **Large Scale** (500 students, 15 clerkships)
   - Measure scheduling time
   - Measure memory usage
   - Verify acceptable performance (< 1 minute)
   - Verify results correct

4. **Configuration Complexity**
   - Create maximally complex configuration:
     - Hybrid strategy
     - Multiple requirement types
     - Teams configured
     - Extensive fallback chains
     - Many capacity rules
   - Run scheduling
   - Verify complexity doesn't cause failure
   - Measure performance impact

5. **Constraint Evaluation Performance**
   - Enable all constraints
   - Run large-scale scheduling
   - Measure constraint evaluation time
   - Verify constraint checks don't dominate runtime

### Suite 9: Data Integrity and Validation

**Purpose**: Ensure database integrity maintained

**Tests**:

1. **Foreign Key Constraints**
   - Attempt to create orphaned records
   - Verify database rejects
   - Verify application handles errors

2. **Cascade Deletes**
   - Create parent with children
   - Delete parent
   - Verify children deleted
   - Verify no orphans

3. **Unique Constraints**
   - Attempt to create duplicates
   - Verify database rejects
   - Verify application handles errors

4. **Check Constraints**
   - Attempt to insert invalid enum values
   - Attempt to insert negative numbers where positive required
   - Verify database rejects
   - Verify application handles errors

5. **Transaction Rollback**
   - Create multi-step operation
   - Force failure partway through
   - Verify transaction rolls back
   - Verify database state consistent

### Suite 10: Regression Tests

**Purpose**: Ensure new system doesn't break existing functionality

**Tests**:

1. **Legacy Clerkship Support**
   - Create clerkship without configuration
   - Run scheduling
   - Verify default behavior works
   - Verify backward compatibility

2. **Existing API Endpoints**
   - Test all existing schedule endpoints still work
   - Test all existing clerkship endpoints still work
   - Test all existing preceptor endpoints still work
   - Verify responses unchanged or improved

3. **Existing Constraints**
   - Verify all original constraints still enforced
   - Verify no regressions in constraint logic
   - Verify original test suite still passes

## Test Execution Strategy

### Test Organization
- Group tests by suite
- Run suites in logical order (unit → integration → e2e)
- Use test fixtures for consistent data
- Clean database between test suites

### Continuous Integration
- Run all tests on every commit
- Run performance tests nightly
- Run school scenarios weekly
- Report test failures immediately

### Test Data Management
- Use consistent seed data
- Reset database before each suite
- Use transactions for test isolation
- Document any shared state

## Acceptance Criteria

- [ ] All 10 test suites implemented
- [ ] All tests passing consistently
- [ ] All 4 school scenarios work end-to-end
- [ ] Performance meets requirements (< 1 min for 500 students)
- [ ] No data integrity issues found
- [ ] No regressions in existing functionality
- [ ] Test coverage > 90% for integration paths
- [ ] Edge cases handled gracefully
- [ ] Error messages helpful and actionable
- [ ] All constraints validated in integration context
- [ ] Configuration lifecycle fully tested
- [ ] Team and fallback logic validated
- [ ] Capacity enforcement validated
- [ ] All strategies validated in real scenarios

## Files to Create

### Test Suite Files
```
src/lib/features/scheduling/integration/01-configuration-workflows.test.ts
src/lib/features/scheduling/integration/02-scheduling-engine.test.ts
src/lib/features/scheduling/integration/03-team-fallback.test.ts
src/lib/features/scheduling/integration/04-capacity-availability.test.ts
src/lib/features/scheduling/integration/05-constraints.test.ts
src/lib/features/scheduling/integration/06-school-scenarios.test.ts
src/lib/features/scheduling/integration/07-edge-cases.test.ts
src/lib/features/scheduling/integration/08-performance.test.ts
src/lib/features/scheduling/integration/09-data-integrity.test.ts
src/lib/features/scheduling/integration/10-regression.test.ts
```

### Test Helpers
```
src/lib/testing/integration-helpers.ts
src/lib/testing/performance-helpers.ts
src/lib/testing/data-generators.ts
src/lib/testing/assertion-helpers.ts
```

### Test Reports
```
test-results/integration-summary.json
test-results/performance-benchmarks.json
test-results/school-scenario-reports/
```

### Documentation
```
docs/testing/integration-test-guide.md
docs/testing/performance-benchmarks.md
docs/testing/test-data-guide.md
```

## Test Reporting

### Required Reports

1. **Test Execution Summary**
   - Total tests run
   - Pass/fail counts
   - Execution time
   - Coverage metrics

2. **Performance Report**
   - Baseline metrics
   - Scale test results
   - Performance over time trends
   - Bottleneck identification

3. **School Scenario Report**
   - Each school's results
   - Comparison across schools
   - Success rates
   - Violation analysis

4. **Regression Report**
   - Any broken functionality
   - Performance regressions
   - API compatibility issues

## Notes

- Integration tests are slower than unit tests (acceptable)
- Use realistic data for accurate validation
- Test both happy paths and error paths
- Document any test assumptions
- Keep tests maintainable (avoid duplication)
- Use descriptive test names
- Add comments explaining complex test scenarios
- Monitor test execution time (watch for slow tests)
- Parallelize tests where possible (be careful with shared state)
- Consider using test containers for database isolation
- Log test execution for debugging failures
- Create test utilities to reduce boilerplate
- Ensure tests are deterministic (no flakiness)
- Include integration tests in CI/CD pipeline
