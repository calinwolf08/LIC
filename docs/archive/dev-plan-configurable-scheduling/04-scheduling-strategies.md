# Step 04: Scheduling Strategy System

## Objective

Implement the strategy pattern for different assignment approaches. Each strategy encapsulates the logic for how to assign students to preceptors based on the clerkship configuration. This replaces the single greedy day-by-day approach with multiple configurable strategies.

## Scope

### Strategies to Implement

1. **ContinuousSingleStrategy** - Assign one preceptor for all required days
2. **ContinuousTeamStrategy** - Assign team of 2-3 preceptors for all required days
3. **BlockBasedStrategy** - Schedule in fixed-size blocks with one preceptor per block
4. **DailyRotationStrategy** - Assign day-by-day, preceptor can change daily
5. **HybridStrategy** - Delegate to different strategies for different requirement types

## Strategy Pattern Architecture

### Base Strategy Interface

All strategies implement common interface:
- Input: Student, clerkship configuration, available dates, scheduling context
- Output: Array of proposed assignments (not yet validated)
- Behavior: Deterministic (same inputs produce same outputs for testing)

### Strategy Selection

Strategy selector chooses appropriate strategy based on clerkship configuration:
- Reads clerkship_configurations.assignment_strategy
- Instantiates correct strategy class
- Delegates assignment generation to strategy
- Returns to scheduling engine for validation

## Implementation Tasks

### 1. Base Strategy Interface

**Define Interface**
- `generateAssignments(student, clerkship, config, context)` - Main entry point
- `getName()` - Strategy name for logging/debugging
- `canHandle(config)` - Check if strategy can handle this configuration
- `estimateAssignments(student, clerkship, config)` - Estimate number of assignments

**Context Requirements**
- Available dates (excluding blackouts)
- Preceptor availability by date
- Current assignments (for conflict checking)
- Health system information
- Team and fallback configurations

### 2. ContinuousSingleStrategy

**Algorithm**
- Find single preceptor available for ALL required days
- Check preceptor has capacity for all days
- Check specialty match
- If health system continuity required, filter by system
- Generate assignments for all days with same preceptor
- Return proposed assignments

**Prioritization Logic**
- Prefer preceptors with fewer existing assignments (load balancing)
- Prefer preceptors in student's preferred health system (if configured)
- Prefer preceptors marked as "preferred" in configuration
- Use stable sort for deterministic results

**Failure Handling**
- If no single preceptor available for all days, return empty array
- Scheduling engine can fall back to team strategy or fail gracefully

### 3. ContinuousTeamStrategy

**Algorithm**
- Find team of 2-3 preceptors collectively available for ALL required days
- Check team formation rules (same health system, same specialty, etc.)
- Distribute days across team members
- Aim for balanced distribution (each member gets similar number of days)
- Minimize transitions between team members
- Generate assignments across team

**Team Selection Logic**
- If pre-configured teams exist for this clerkship, prefer those
- Otherwise, dynamically form teams from available preceptors
- Check team formation rules during dynamic team creation
- Validate team capacity before assigning

**Distribution Algorithm**
- Split days into chunks to minimize switching
- Prefer continuous blocks per team member
- Balance total days across team members
- Consider preceptor availability when distributing

**Failure Handling**
- If no valid team can be formed, return empty array
- Log reason for failure (insufficient capacity, rule violations, etc.)

### 4. BlockBasedStrategy

**Algorithm**
- Divide required days into blocks of configured size (e.g., 14-day blocks)
- For each block, find one preceptor available for entire block
- Prefer consistent preceptor across blocks (fewer transitions)
- Handle partial blocks at end if total days not divisible by block size
- Generate assignments per block

**Block Configuration**
- Read block_size from clerkship configuration
- Read allow_partial_blocks flag
- Read prefer_continuous_blocks flag

**Preceptor Selection Per Block**
- Find preceptors available for full block
- If prefer_continuous_blocks, try to keep same preceptor across blocks
- Check capacity per block (some preceptors have max_blocks_per_year)
- Respect health system continuity rules

**Partial Block Handling**
- If allow_partial_blocks is false, fail if days not divisible by block_size
- If true, create smaller block at end with available preceptor
- Prefer same preceptor from previous block for continuity

**Failure Handling**
- If any block cannot be filled, return empty array
- Provide detailed error about which block failed and why

### 5. DailyRotationStrategy

**Algorithm**
- For each required day, find any available preceptor
- No continuity requirement (can change daily)
- Check specialty match and capacity per day
- Generate one assignment per day

**Preceptor Selection Per Day**
- Find all preceptors available on this date
- Filter by specialty, health system rules if applicable
- Check daily capacity not exceeded
- Prefer preceptors with fewer assignments (load balancing)
- Select best match for this day

**Optimization**
- Try to minimize preceptor changes where possible (soft preference)
- Balance assignments across available preceptors
- Avoid assigning same student to same preceptor on consecutive days (if configured)

**Failure Handling**
- If any day cannot be filled, return empty array
- Specify which date(s) had no available preceptors

### 6. HybridStrategy

**Algorithm**
- Read requirement split from clerkship configuration
- For each requirement type (inpatient, outpatient, elective):
  - Determine which strategy to use for this requirement type
  - Delegate to appropriate sub-strategy
  - Collect proposed assignments
- Combine assignments from all requirement types
- Ensure no date conflicts across requirement types

**Sub-Strategy Selection**
- Read assignment_mode from clerkship_requirements table
- Map assignment_mode to strategy class
- Instantiate and invoke sub-strategy

**Example Configuration**
- Outpatient: 30 days using ContinuousSingleStrategy
- Inpatient: 30 days using BlockBasedStrategy (14-day blocks)
- Elective: 10 days using DailyRotationStrategy

**Coordination**
- Ensure total days across requirements equals clerkship.required_days
- Ensure date ranges don't overlap
- Respect sequential ordering if configured (must complete X before starting Y)

**Failure Handling**
- If any sub-strategy fails, entire hybrid assignment fails
- Report which requirement type failed

## Strategy Context Builder

### Context Assembly
- Fetch clerkship configuration from database
- Load requirements, electives, team configurations
- Build available date ranges
- Load preceptor availability
- Load current assignments for conflict checking
- Load health system and site information
- Package into StrategyContext object

### Context Optimization
- Pre-filter preceptors by specialty before passing to strategy
- Pre-compute available dates per preceptor
- Index current assignments by date for fast lookup
- Cache health system information

## Testing Requirements

### Unit Tests

1. **Strategy Interface Tests**
   - Test all strategies implement interface correctly
   - Test strategy selection based on configuration
   - Test canHandle method for each strategy

2. **ContinuousSingleStrategy Tests**
   - Test successful assignment with available preceptor
   - Test failure when no preceptor available for all days
   - Test prioritization logic (prefer less loaded preceptors)
   - Test health system filtering
   - Test capacity checking
   - Test specialty matching

3. **ContinuousTeamStrategy Tests**
   - Test team formation from pre-configured teams
   - Test dynamic team formation
   - Test team rule validation (same health system, etc.)
   - Test balanced distribution across team members
   - Test transition minimization
   - Test failure scenarios (no valid team)

4. **BlockBasedStrategy Tests**
   - Test block division for evenly divisible days
   - Test partial block handling
   - Test preceptor continuity across blocks
   - Test block capacity rules
   - Test failure scenarios (block cannot be filled)

5. **DailyRotationStrategy Tests**
   - Test day-by-day assignment
   - Test load balancing across preceptors
   - Test optimization (minimize changes)
   - Test failure scenarios (no preceptor for specific day)

6. **HybridStrategy Tests**
   - Test delegation to sub-strategies
   - Test combining assignments from multiple requirements
   - Test date conflict detection
   - Test sequential ordering
   - Test partial failure handling

### Integration Tests

1. **Strategy + Configuration Integration**
   - Test each strategy with real clerkship configurations
   - Test strategy switching based on configuration changes
   - Test strategies respect all configuration constraints

2. **School Scenario Tests**
   - **School A**: Test ContinuousSingleStrategy meets requirements
   - **School B**: Test ContinuousTeamStrategy with 3-4 preceptor rotation
   - **School C**: Test HybridStrategy with block-based inpatient + continuous outpatient
   - **School D**: Test DailyRotationStrategy for full flexibility

3. **Edge Case Tests**
   - Test with minimal preceptor availability
   - Test with high student demand (capacity constraints)
   - Test with fragmented availability (gaps in preceptor schedules)
   - Test with conflicting configuration constraints

## Acceptance Criteria

- [ ] Base strategy interface defined
- [ ] All 5 strategies implemented (Continuous Single, Continuous Team, Block, Daily, Hybrid)
- [ ] Strategy selector implemented
- [ ] All strategies have comprehensive unit tests
- [ ] All strategies handle failure cases gracefully
- [ ] Integration tests validate strategies work with real configurations
- [ ] Strategies are deterministic (same input = same output)
- [ ] Strategies respect all configuration constraints
- [ ] School A, B, C, D scenarios can be implemented with these strategies
- [ ] Performance is acceptable (strategies complete in reasonable time)
- [ ] All strategies include logging for debugging
- [ ] Documentation explains when to use each strategy

## Files to Create

### Strategy Files
```
src/lib/features/scheduling/strategies/index.ts
src/lib/features/scheduling/strategies/base-strategy.ts
src/lib/features/scheduling/strategies/continuous-single.strategy.ts
src/lib/features/scheduling/strategies/continuous-team.strategy.ts
src/lib/features/scheduling/strategies/block-based.strategy.ts
src/lib/features/scheduling/strategies/daily-rotation.strategy.ts
src/lib/features/scheduling/strategies/hybrid.strategy.ts
src/lib/features/scheduling/strategies/strategy-selector.ts
src/lib/features/scheduling/strategies/strategy-context.ts
```

### Test Files
```
src/lib/features/scheduling/strategies/continuous-single.strategy.test.ts
src/lib/features/scheduling/strategies/continuous-team.strategy.test.ts
src/lib/features/scheduling/strategies/block-based.strategy.test.ts
src/lib/features/scheduling/strategies/daily-rotation.strategy.test.ts
src/lib/features/scheduling/strategies/hybrid.strategy.test.ts
src/lib/features/scheduling/strategies/strategy-selector.test.ts
src/lib/features/scheduling/strategies/integration.test.ts
```

## Notes

- Strategies should be pure functions where possible (easier to test)
- Avoid direct database access in strategies (use context object)
- Log strategy decisions for debugging scheduling issues
- Consider using generator functions for lazy assignment generation
- Optimize for common case (most clerkships use continuous single)
- Keep strategies decoupled from constraint validation (that's engine's job)
- Consider caching strategy instances for performance
- Use TypeScript strict mode for type safety
- Document algorithm complexity (time/space) for each strategy
