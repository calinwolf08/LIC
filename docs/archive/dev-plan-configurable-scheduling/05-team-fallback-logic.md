# Step 05: Team and Fallback Preceptor Logic

## Objective

Implement the business logic for team formation, team validation, and fallback preceptor assignment. This includes algorithms for dynamic team creation, team rule enforcement, and automatic fallback selection when primary preceptors are unavailable.

## Scope

### Components to Build

1. **TeamFormationEngine** - Creates and validates preceptor teams
2. **TeamValidator** - Validates team against configuration rules
3. **FallbackResolver** - Selects appropriate fallback preceptor
4. **CapacityChecker** - Validates preceptor capacity constraints

## Team Formation Logic

### Team Formation Modes

**Pre-configured Teams**
- Admin has manually created teams in advance
- Team stored in preceptor_teams table with members
- Scheduling engine uses pre-configured team as-is
- Validate team still meets rules before using

**Dynamic Team Formation**
- No pre-configured team exists
- Engine dynamically finds 2-3 compatible preceptors
- Build team on-the-fly based on formation rules
- Prefer stable team selection (deterministic)

### Team Formation Algorithm

**Input**
- Clerkship configuration with team rules
- Required dates for assignment
- Available preceptors (filtered by specialty)
- Health system constraints

**Steps**
1. Filter preceptors by specialty match
2. Filter by availability for required dates
3. If require_same_health_system, group by health system
4. If require_same_site, group by site
5. Find groups of 2-3 preceptors that collectively cover all dates
6. Score each potential team by quality metrics
7. Select highest scoring team
8. Return team or null if no valid team found

**Quality Scoring**
- Higher score for fewer preceptors (prefer 2 over 3)
- Higher score for balanced availability across members
- Higher score for fewer transitions
- Higher score if team has worked together before
- Higher score if all in same health system (even if not required)
- Higher score for preceptors with lower current load

### Team Member Assignment Distribution

**Goals**
- Balance days across team members
- Minimize transitions between members
- Respect individual member availability
- Consider individual member capacity

**Algorithm**
1. Calculate ideal days per member (total / team_size)
2. Sort members by availability overlap
3. Assign continuous blocks to each member where possible
4. Fill gaps with available members
5. Verify no member exceeds capacity
6. Optimize to minimize switching

**Example** (60 days, 3 members)
- Member A: Days 1-20
- Member B: Days 21-40
- Member C: Days 41-60
- Result: 3 transitions, balanced load

## Team Validation Logic

### Validation Rules to Check

**Team Size Validation**
- Team must have minimum number of members (typically 2)
- Team must not exceed maximum number of members (typically 3)
- All team members must exist as valid preceptors

**Health System Consistency**
- If require_same_health_system flag set, validate all members share health system
- If prefer_same_health_system, log warning but allow
- Track violations for reporting

**Site Consistency**
- If require_same_site flag set, validate all members at same site
- Handle null sites appropriately

**Specialty Consistency**
- If require_same_specialty flag set, validate all members have matching specialty
- Specialty must match clerkship specialty requirement

**Capacity Validation**
- Verify each team member has capacity for their assigned days
- Check daily capacity per member
- Check yearly capacity per member
- Check block capacity if applicable

**Availability Validation**
- Verify team collectively covers all required dates
- No date should be uncovered
- Handle gaps in availability

**Approval Requirements**
- If requires_admin_approval flag set, mark team for manual review
- Do not auto-assign if approval pending

### Validation Response

Return validation result with:
- Boolean success flag
- Array of validation errors
- Array of warnings (soft failures)
- Suggested fixes (if auto-fixable)

## Fallback Preceptor Logic

### Fallback Resolution Algorithm

**Input**
- Primary preceptor (unavailable)
- Clerkship
- Required dates
- Fallback chain configuration

**Steps**
1. Fetch fallback chain for primary preceptor + clerkship
2. Sort fallbacks by priority (ascending)
3. For each fallback in order:
   - Check specialty match
   - Check availability for required dates
   - Check capacity
   - Check health system rules (unless override allowed)
   - If all checks pass, select this fallback
   - If requires_approval, flag for admin review
4. If no fallback found, return null (manual assignment needed)

**Circular Reference Prevention**
- Validate fallback chains during creation (Step 03)
- Maintain seen set during resolution to detect cycles at runtime
- Fail fast if cycle detected

### Fallback Scenarios

**Scenario 1: Complete Unavailability**
- Primary preceptor unavailable for ALL required dates
- Use fallback for entire assignment
- Notify admin if requires_approval

**Scenario 2: Partial Unavailability**
- Primary available for some dates, unavailable for others
- Use primary for available dates
- Use fallback only for unavailable dates
- May result in multiple preceptors for one clerkship

**Scenario 3: Cascading Fallback**
- Primary unavailable
- First fallback also unavailable
- Continue down chain to second, third fallback, etc.
- Track fallback depth for reporting

**Scenario 4: No Valid Fallback**
- All fallbacks unavailable or violate rules
- Leave dates unscheduled
- Flag for manual admin assignment
- Report to user

### Health System Override Logic

**When Override Allowed**
- Configuration allows different health system for fallback
- Prioritize finding ANY qualified preceptor over maintaining system consistency
- Log override for reporting

**When Override Not Allowed**
- Fallback must be in same health system as primary
- Filter fallback candidates by health system
- Fail gracefully if no same-system fallback available

### Approval Workflow

**Automatic Assignment**
- If requires_approval is false, assign fallback immediately
- Scheduling engine proceeds without interruption

**Manual Approval Required**
- If requires_approval is true, create pending assignment
- Mark assignment status as 'pending_approval'
- Notify admin of pending approval
- Block student from being assigned elsewhere until resolved
- Admin can approve or reject and assign different preceptor

## Capacity Checking Logic

### Capacity Rule Hierarchy

1. **Clerkship-Specific Rules** (highest priority)
   - Check preceptor_capacity_rules where clerkship_id matches
   - Use these limits if they exist

2. **General Preceptor Rules** (fallback)
   - Check preceptor_capacity_rules where clerkship_id is null
   - Apply to all clerkships if no specific rule exists

3. **Default Rules** (last resort)
   - Use preceptors.max_students if no capacity rule exists
   - Legacy compatibility

### Capacity Check Algorithm

**Per-Day Capacity**
- Count current assignments for preceptor on given date
- Compare to max_students_per_day
- Return true if under limit, false if at/over limit

**Per-Year Capacity**
- Count total assignments for preceptor in academic year
- Compare to max_students_per_year
- Return true if under limit

**Per-Block Capacity** (for block-based clerkships only)
- Count how many blocks preceptor is assigned to in academic year
- Compare to max_students_per_block and max_blocks_per_year
- Return true if both under limits

**Combined Check**
- Assignment must pass all applicable checks
- Return false if any check fails
- Return details about which check failed

## Testing Requirements

### Unit Tests

1. **TeamFormationEngine Tests**
   - Test pre-configured team retrieval
   - Test dynamic team formation with various constraints
   - Test team scoring algorithm
   - Test team formation failure scenarios
   - Test deterministic team selection

2. **TeamValidator Tests**
   - Test team size validation
   - Test health system consistency check
   - Test site consistency check
   - Test specialty consistency check
   - Test capacity validation
   - Test availability validation
   - Test approval requirement flagging
   - Test validation with warnings vs errors

3. **FallbackResolver Tests**
   - Test fallback chain traversal
   - Test fallback selection based on availability
   - Test circular reference detection
   - Test health system override logic
   - Test approval requirement flagging
   - Test complete vs partial unavailability scenarios
   - Test cascading fallback selection
   - Test no valid fallback scenario

4. **CapacityChecker Tests**
   - Test per-day capacity checking
   - Test per-year capacity checking
   - Test per-block capacity checking
   - Test capacity rule hierarchy (clerkship-specific > general > default)
   - Test combined capacity checks
   - Test capacity check with edge cases (0 capacity, unlimited capacity)

### Integration Tests

1. **Team Formation Integration**
   - Test team formation with real clerkship configurations
   - Test team formation with real preceptor availability data
   - Test team validation with real database constraints
   - Test team member assignment distribution with real schedules

2. **Fallback Resolution Integration**
   - Test fallback resolution with real fallback chains
   - Test fallback with real availability data
   - Test approval workflow integration
   - Test cascading fallbacks with multiple levels

3. **School Scenario Tests**
   - **School A**: No teams, single preceptor only
   - **School B**: Teams of 3-4 preceptors with same health system requirement
   - **School C**: Hybrid with different team rules per requirement type
   - **School D**: No teams, daily rotation with fallbacks

## Acceptance Criteria

- [ ] TeamFormationEngine implemented with pre-configured and dynamic modes
- [ ] TeamValidator validates all team formation rules
- [ ] FallbackResolver implements complete fallback logic
- [ ] CapacityChecker implements all capacity checking rules
- [ ] All components have 100% unit test coverage
- [ ] Team formation is deterministic (same inputs produce same team)
- [ ] Fallback resolution handles all edge cases gracefully
- [ ] Circular reference detection prevents infinite loops
- [ ] Capacity checking respects rule hierarchy
- [ ] Integration tests validate real-world scenarios
- [ ] All components include comprehensive logging
- [ ] Performance is acceptable (team formation < 100ms, fallback resolution < 50ms)
- [ ] Documentation explains all algorithms clearly

## Files to Create

### Logic Files
```
src/lib/features/scheduling/team-formation/index.ts
src/lib/features/scheduling/team-formation/team-formation-engine.ts
src/lib/features/scheduling/team-formation/team-validator.ts
src/lib/features/scheduling/team-formation/team-scorer.ts
src/lib/features/scheduling/team-formation/member-distributor.ts

src/lib/features/scheduling/fallback/index.ts
src/lib/features/scheduling/fallback/fallback-resolver.ts
src/lib/features/scheduling/fallback/circular-detector.ts

src/lib/features/scheduling/capacity/index.ts
src/lib/features/scheduling/capacity/capacity-checker.ts
src/lib/features/scheduling/capacity/capacity-rule-resolver.ts
```

### Test Files
```
src/lib/features/scheduling/team-formation/team-formation-engine.test.ts
src/lib/features/scheduling/team-formation/team-validator.test.ts
src/lib/features/scheduling/team-formation/team-scorer.test.ts
src/lib/features/scheduling/team-formation/member-distributor.test.ts

src/lib/features/scheduling/fallback/fallback-resolver.test.ts
src/lib/features/scheduling/fallback/circular-detector.test.ts

src/lib/features/scheduling/capacity/capacity-checker.test.ts
src/lib/features/scheduling/capacity/capacity-rule-resolver.test.ts

src/lib/features/scheduling/team-formation/integration.test.ts
src/lib/features/scheduling/fallback/integration.test.ts
```

## Notes

- Team formation should prefer stability (same team for similar scenarios)
- Use caching for team formation results within a scheduling run
- Log all team formation decisions for debugging
- Fallback resolution should be fast (it's in critical path)
- Consider using memoization for capacity checks
- Circular reference detection is critical for data integrity
- Document performance characteristics for each algorithm
- Consider background jobs for approval notifications
- Team quality scoring may need tuning based on real-world usage
