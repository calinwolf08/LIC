# Step 06: New Configurable Scheduling Engine

## Objective

Build the new scheduling engine that orchestrates all components (strategies, team formation, fallback resolution, capacity checking, constraint validation) to generate complete schedules based on per-clerkship configurations. This replaces the existing greedy scheduling engine with a configuration-driven approach.

## Scope

### Engine Architecture

The new engine coordinates multiple subsystems:
1. **Configuration Loader** - Loads all clerkship configurations
2. **Strategy Executor** - Delegates to appropriate scheduling strategy
3. **Constraint Validator** - Validates proposed assignments against constraints
4. **Assignment Optimizer** - Optimizes assignment quality
5. **Conflict Resolver** - Handles conflicts and retries
6. **Result Reporter** - Generates comprehensive scheduling results

### Key Differences from Old Engine

**Old Engine (greedy day-by-day)**
- Iterate through dates
- Assign first available preceptor per day
- One strategy for all clerkships
- Limited configuration

**New Engine (configuration-driven)**
- Load configuration per clerkship
- Select strategy based on configuration
- Generate assignment plan for entire clerkship
- Validate plan against all constraints
- Support multiple strategies concurrently
- Rich configuration options

## Engine Workflow

### Phase 1: Initialization

**Load Data**
- Load all students needing assignments
- Load all clerkships with configurations
- Load all preceptors with availability, capacity, health systems
- Load all teams and fallback chains
- Build scheduling context

**Prepare Structures**
- Build requirement tracking per student
- Build availability maps per preceptor
- Index teams by clerkship
- Index fallbacks by preceptor + clerkship
- Create assignment tracking structures

### Phase 2: Student Prioritization

**Determine Order**
- Sort students by priority criteria
- Prioritize students with fewer remaining days
- Prioritize students with more constraints
- Prioritize students approaching deadlines
- Stable sort for deterministic results

**Why Prioritization Matters**
- High-constraint students scheduled first get better chances
- Prevents situations where low-constraint students fill all capacity
- More fair distribution of limited resources

### Phase 3: Clerkship Assignment Loop

For each student (in priority order):

**1. Select Next Clerkship**
- Determine which clerkship student needs most
- Consider requirement gaps (largest gap first)
- Consider dependency rules (must complete X before Y)
- Handle electives last (most flexible)

**2. Load Clerkship Configuration**
- Fetch complete clerkship configuration from database
- Parse requirements, electives, team rules
- Identify assignment strategy from configuration

**3. Execute Strategy**
- Select appropriate strategy based on configuration
- Invoke strategy to generate proposed assignments
- Strategy returns array of proposed assignments (not yet validated)
- If strategy returns empty array (couldn't find solution), try fallback

**4. Try Team Fallback (if configured)**
- If continuous single strategy fails and team allowed
- Invoke team formation engine
- If valid team found, invoke continuous team strategy
- Generate proposed assignments with team

**5. Try Individual Fallback**
- If primary preceptor unavailable for some dates
- Invoke fallback resolver for those dates
- Generate proposed assignments with fallback preceptors
- May result in mixed preceptor assignments

**6. Validate Proposed Assignments**
- For each proposed assignment in plan
- Validate against all active constraints
- Track violations for analysis
- If any assignment fails validation, mark plan as invalid

**7. Handle Validation Failures**
- If plan invalid, attempt to fix
- Try alternative preceptors/dates suggested by constraints
- Try relaxing soft constraints if configured
- If unfixable, mark clerkship as unschedulable for this student

**8. Commit Valid Assignments**
- If plan valid, commit all assignments to context
- Update requirement tracking
- Update availability tracking
- Update capacity tracking
- Move to next clerkship for this student

**9. Check Student Completion**
- If student has met all requirements, mark complete
- Move to next student

### Phase 4: Elective Allocation

After all required assignments complete:

**1. Identify Students with Elective Days**
- Filter students with remaining elective requirement
- Load elective options for each clerkship

**2. Allocate Elective Days**
- Respect minimum days per elective option
- Balance across available electives
- Use daily rotation strategy for flexibility
- Assign to available preceptors with matching specialty

**3. Validate Elective Assignments**
- Check capacity, availability, specialty match
- Allow health system changes if configured
- Commit valid elective assignments

### Phase 5: Conflict Resolution

**Identify Conflicts**
- Double-booking (student or preceptor)
- Capacity violations
- Constraint violations not caught earlier

**Resolution Strategies**
- Retry failed assignments with alternative preceptors
- Shift assignments to different dates within same clerkship
- Request admin intervention for irresolvable conflicts
- Mark assignments as provisional pending resolution

### Phase 6: Optimization (optional)

**Quality Metrics**
- Minimize preceptor transitions per student
- Balance load across preceptors
- Maximize health system continuity
- Minimize violations of soft constraints

**Optimization Techniques**
- Local search (swap assignments to improve quality)
- Reassign flexible assignments to better dates
- Consolidate team member assignments
- Respect hard constraints while optimizing soft ones

**Termination**
- Run for fixed iteration count or time limit
- Stop when no further improvement found
- Return best solution found

### Phase 7: Result Generation

**Build Result Object**
- All successful assignments
- All unmet requirements (student + clerkship + remaining days)
- All violations encountered (by constraint, by student, by preceptor)
- Summary statistics (completion rate, violation counts, preceptor utilization)
- Assignments pending approval (for fallbacks requiring approval)

**Success Criteria**
- All students have all requirements met
- No constraint violations (or only soft constraint violations if allowed)
- All assignments valid

**Partial Success Handling**
- Some students may have unmet requirements
- Report which students, which clerkships, how many days short
- Provide actionable feedback (e.g., "Need 2 more Surgery preceptors")

## Constraint Integration

### Constraint Phases

**Pre-validation Constraints** (before strategy execution)
- Specialty match (don't even try mismatched preceptors)
- Blackout dates (remove from available dates)
- Basic availability (preceptor marked unavailable)

**Post-validation Constraints** (after strategy generates plan)
- Capacity constraints (per-day, per-year, per-block)
- Team formation rules
- Health system continuity rules
- Custom admin-defined constraints (future)

### Constraint Priorities

- Execute high-priority constraints first (fail fast)
- Cache constraint results where possible
- Skip constraints marked as bypassed

### Soft vs Hard Constraints

**Hard Constraints** (cannot violate)
- Specialty match
- Blackout dates
- Double-booking
- Capacity limits

**Soft Constraints** (prefer not to violate, but can if needed)
- Health system continuity (if set to "prefer")
- Minimize preceptor transitions
- Load balancing across preceptors

## Error Handling and Retry Logic

### Retry Scenarios

1. **Strategy Fails to Find Solution**
   - Try next fallback strategy
   - Try relaxing soft constraints
   - Try different date range
   - Report failure if all retries exhausted

2. **Validation Fails**
   - Identify which constraint failed
   - Try alternative preceptor
   - Try alternative dates
   - Report failure if no alternatives

3. **Capacity Exhausted**
   - Try team formation
   - Try fallback preceptors
   - Try different dates
   - Report capacity shortage

### Failure Reporting

- Detailed error messages (which student, which clerkship, which constraint)
- Suggestions for resolution (add preceptor, adjust dates, etc.)
- Violation statistics for analysis
- Exportable report for admins

## Testing Requirements

### Unit Tests

1. **Engine Initialization Tests**
   - Test data loading from database
   - Test context building
   - Test student prioritization
   - Test configuration parsing

2. **Strategy Execution Tests**
   - Test strategy selection based on configuration
   - Test strategy invocation with correct parameters
   - Test strategy failure handling
   - Test fallback strategy selection

3. **Validation Tests**
   - Test constraint validation integration
   - Test validation failure handling
   - Test soft constraint relaxation
   - Test bypassed constraint handling

4. **Team and Fallback Tests**
   - Test team formation trigger conditions
   - Test fallback resolution integration
   - Test approval requirement handling
   - Test team validation integration

5. **Elective Allocation Tests**
   - Test elective identification
   - Test elective day allocation algorithm
   - Test minimum days per elective enforcement
   - Test elective assignment validation

6. **Optimization Tests**
   - Test quality metric calculation
   - Test optimization termination conditions
   - Test improvement detection
   - Test hard constraint preservation during optimization

7. **Result Generation Tests**
   - Test result object construction
   - Test success criteria evaluation
   - Test unmet requirement identification
   - Test violation summary generation

### Integration Tests

1. **Full Scheduling Workflows**
   - Test complete schedule generation for small dataset (3 students, 2 clerkships)
   - Test with various configurations (continuous, block, daily, hybrid)
   - Test with teams enabled
   - Test with fallbacks enabled
   - Test with capacity constraints

2. **School Scenario Tests**
   - **School A**: Continuous single preceptor, 60 days per clerkship
   - **School B**: Rotating through 3-4 preceptors, team-based
   - **School C**: Hybrid (block inpatient + continuous outpatient)
   - **School D**: Daily rotation, maximum flexibility
   - Each scenario should successfully schedule all students

3. **Constraint Integration Tests**
   - Test scheduling with all constraints enabled
   - Test scheduling with bypassed constraints
   - Test scheduling with soft constraint relaxation
   - Test scheduling with custom constraints

4. **Edge Case Tests**
   - Test with minimal preceptor availability
   - Test with high student count (capacity pressure)
   - Test with conflicting constraints
   - Test with partial failures (some students succeed, some fail)

5. **Performance Tests**
   - Test scheduling time for 100 students, 10 clerkships
   - Test memory usage for large datasets
   - Test optimization performance
   - Verify acceptable performance (< 1 minute for typical school size)

## Acceptance Criteria

- [ ] New scheduling engine fully implemented
- [ ] Engine loads and uses per-clerkship configurations
- [ ] Engine selects correct strategy per clerkship
- [ ] Engine integrates team formation logic
- [ ] Engine integrates fallback resolution logic
- [ ] Engine validates all assignments against constraints
- [ ] Engine generates comprehensive result reports
- [ ] Engine handles all failure scenarios gracefully
- [ ] 100% unit test coverage for all engine components
- [ ] Integration tests validate all 4 school scenarios work
- [ ] Performance meets requirements (< 1 min for typical dataset)
- [ ] Engine replaces old scheduling engine completely
- [ ] All existing functionality preserved or improved
- [ ] Detailed logging for debugging scheduling issues

## Files to Create

### Engine Files
```
src/lib/features/scheduling/engine/index.ts
src/lib/features/scheduling/engine/configurable-scheduling-engine.ts
src/lib/features/scheduling/engine/configuration-loader.ts
src/lib/features/scheduling/engine/student-prioritizer.ts
src/lib/features/scheduling/engine/assignment-validator.ts
src/lib/features/scheduling/engine/conflict-resolver.ts
src/lib/features/scheduling/engine/elective-allocator.ts
src/lib/features/scheduling/engine/optimizer.ts
src/lib/features/scheduling/engine/result-builder.ts
```

### Test Files
```
src/lib/features/scheduling/engine/configurable-scheduling-engine.test.ts
src/lib/features/scheduling/engine/configuration-loader.test.ts
src/lib/features/scheduling/engine/student-prioritizer.test.ts
src/lib/features/scheduling/engine/assignment-validator.test.ts
src/lib/features/scheduling/engine/conflict-resolver.test.ts
src/lib/features/scheduling/engine/elective-allocator.test.ts
src/lib/features/scheduling/engine/optimizer.test.ts
src/lib/features/scheduling/engine/result-builder.test.ts

src/lib/features/scheduling/engine/integration/full-workflow.test.ts
src/lib/features/scheduling/engine/integration/school-scenarios.test.ts
src/lib/features/scheduling/engine/integration/constraint-integration.test.ts
src/lib/features/scheduling/engine/integration/edge-cases.test.ts
src/lib/features/scheduling/engine/integration/performance.test.ts
```

## Migration from Old Engine

### Backward Compatibility

**For clerkships without configuration:**
- Default to continuous single strategy
- Use existing constraints
- Maintain existing behavior

**For clerkships with configuration:**
- Use new engine with configuration
- Apply configured strategies
- Respect all configuration rules

### Migration Path

1. Deploy new engine alongside old engine
2. Add feature flag to switch between engines
3. Run new engine in shadow mode (compare results)
4. Gradually enable for clerkships with configurations
5. Eventually replace old engine completely

### Data Migration

- No data migration needed (new tables for configurations)
- Existing assignments remain valid
- Existing clerkships work with default configuration

## Notes

- Engine should be stateless (can run multiple times with same inputs)
- Use dependency injection for testability
- Log all major decisions for debugging
- Consider streaming results for large datasets
- Build with extensibility in mind (new strategies, new constraints)
- Optimize critical paths (strategy execution, validation)
- Consider parallel processing for independent students/clerkships
- Document performance characteristics
- Include telemetry for monitoring production usage
