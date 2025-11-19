# Sample School Configurations

This document describes the sample configurations created to demonstrate the configurable scheduling framework.

## Overview

The sample data represents a realistic medical education scenario with:
- Multiple health systems and sites
- Different clerkships with varied scheduling requirements
- Hierarchical capacity rules
- Preceptor teams
- Fallback chains for coverage

## Running the Seed Script

```bash
tsx scripts/seed-scheduling-config.ts
```

**Prerequisites:**
- Existing clerkships in the database
- Existing preceptors in the database
- Database schema migrations applied

## Sample Data Structure

### 1. Health Systems & Sites

**University Medical Center**
- Main Campus
- Downtown Clinic

**Community Health Network**
- Eastside Medical Center

### 2. Clerkship Requirements

#### Family Medicine
- **Type**: Outpatient
- **Duration**: 20 days
- **Strategy**: Continuous Single
  - Students assigned to one preceptor for entire rotation
- **Health System Rule**: Prefer Same System
- **Capacity**: Max 2 students/day, 8 students/year

**Use Case**: Traditional outpatient family medicine where continuity with one preceptor is valued.

#### Internal Medicine
- **Inpatient Component**:
  - Duration: 28 days
  - Strategy: Block-Based (14-day blocks)
  - Health System Rule: Enforce Same System
  - Capacity: Max 3 students/day

- **Outpatient Component**:
  - Duration: 14 days
  - Strategy: Continuous Single
  - Capacity: Max 2 students/day

**Use Case**: Split rotation with structured inpatient blocks and continuous outpatient experience.

#### Surgery
- **Type**: Inpatient
- **Duration**: 42 days
- **Strategy**: Daily Rotation
  - Students rotate through different surgical services daily
- **Health System Rule**: Enforce Same System
- **Capacity**: Max 4 students/day

**Use Case**: Exposure to multiple surgical subspecialties with high student capacity.

#### Pediatrics
- **Type**: Elective
- **Duration**: 10 days
- **Strategy**: Inherit from global defaults
- **Elective Options**:
  1. Pediatric Cardiology (5-day minimum)
  2. General Pediatrics (10-day minimum)

**Use Case**: Student choice among pediatric subspecialties.

### 3. Capacity Rules (Hierarchical)

The sample data demonstrates the 5-level capacity rule hierarchy:

1. **General Rule** (Preceptor 1)
   - Applies to all assignments for this preceptor
   - 3 students/day, 12 students/year

2. **Clerkship-Specific Rule** (Preceptor 2, Family Medicine)
   - Overrides general rule for Family Medicine
   - 2 students/day, 8 students/year

3. **Requirement-Type Rule** (Preceptor 3, Inpatient)
   - Applies to all inpatient assignments
   - 4 students/day, 16 students/year

4. **Most Specific Rule** (Preceptor 4, Internal Medicine Inpatient)
   - Highest priority, most specific match
   - 3 students/day, 12 students/year

5. **Default Rule** (from preceptors table)
   - Used when no custom rules exist
   - From `max_students` column

### 4. Preceptor Teams

**Surgery Teaching Team A**
- 3 team members with priorities
- Lead Surgeon + Team Members
- Formation Rules:
  - ✓ Require same health system
  - ✗ Same site not required
  - ✓ Require same specialty
  - ✗ No admin approval needed

**Use Case**: Coordinated surgical teaching team where students see multiple attendings but stay within one system.

### 5. Fallback Chains

**Chain 1: Simple Cascade**
```
Preceptor 1 → Preceptor 2 → Preceptor 3
```
If P1 is unavailable, try P2. If P2 is unavailable, try P3.

**Chain 2: Multiple Options**
```
Preceptor 4 → Preceptor 2 (Priority 1)
           → Preceptor 5 (Priority 2)
```
If P4 is unavailable, try P2 first, then P5.

**Use Case**: Ensures coverage when primary preceptors are unavailable (vacation, conference, clinical demands).

## Testing the Framework

### 1. View Configurations

Navigate to `/scheduling-config` to see all configured clerkships.

### 2. Inspect Clerkship Details

Click "Configure" on any clerkship to see:
- Requirements with resolved strategies
- Configured teams
- Capacity rules

### 3. Execute Scheduling

1. Navigate to `/scheduling-config/execute`
2. Select students and clerkships
3. Configure options:
   - Enable fallbacks to test fallback chains
   - Enable dry run to preview without saving
4. Click "Preview Scheduling"
5. Review results:
   - Assignment statistics
   - Unmet requirements
   - Violations

### 4. Test Different Scenarios

**Scenario 1: Capacity Limits**
- Select many students for Family Medicine
- Max 2 students/day should create multiple assignments across different days

**Scenario 2: Block-Based Strategy**
- Execute for Internal Medicine
- Inpatient assignments should be in 14-day blocks

**Scenario 3: Fallback Resolution**
- Mark Preceptor 1 as unavailable (via blackout dates)
- Execute scheduling
- Should automatically assign to Preceptor 2 (fallback)

**Scenario 4: Team Assignments**
- Enable team formation option
- Execute for Surgery
- Should use Surgery Teaching Team A

**Scenario 5: Elective Selection**
- Execute for Pediatrics elective requirement
- Should respect minimum days per elective option

## API Testing

### Get Complete Configuration
```bash
curl http://localhost:5173/api/scheduling-config/clerkships/{clerkship_id}
```

### Execute Scheduling Engine
```bash
curl -X POST http://localhost:5173/api/scheduling/execute \
  -H "Content-Type: application/json" \
  -d '{
    "studentIds": ["student-1", "student-2"],
    "clerkshipIds": ["clerkship-1"],
    "options": {
      "enableFallbacks": true,
      "dryRun": true
    }
  }'
```

### Get Capacity Rules for Preceptor
```bash
curl http://localhost:5173/api/scheduling-config/capacity-rules?preceptorId={preceptor_id}
```

### Get Teams for Clerkship
```bash
curl http://localhost:5173/api/scheduling-config/teams?clerkshipId={clerkship_id}
```

## Expected Behavior

With these sample configurations, the scheduling engine should:

1. ✓ Assign Family Medicine students to single preceptors for 20 continuous days
2. ✓ Create 14-day blocks for Internal Medicine inpatient
3. ✓ Rotate Surgery students daily across multiple preceptors
4. ✓ Respect capacity limits at all hierarchy levels
5. ✓ Use fallback preceptors when primary is unavailable
6. ✓ Form teams when team strategy is selected
7. ✓ Generate detailed statistics and unmet requirement reports

## Troubleshooting

### No Clerkships Found
- Run the base seeding script first to create clerkships
- Ensure migrations are applied

### No Preceptors Found
- Create preceptors via UI or API
- Import preceptor data from CSV

### Capacity Rules Not Applied
- Check that preceptor IDs match between rules and preceptors table
- Verify clerkship IDs are correct
- Use API to inspect resolved rules: `/api/scheduling-config/capacity-rules?preceptorId=X`

### Teams Not Forming
- Verify team members exist
- Check formation rules are satisfied
- Enable `enableTeamFormation` option when executing

### Fallbacks Not Working
- Ensure fallback chain is properly created
- Enable `enableFallbacks` option when executing
- Check for circular references (system prevents infinite loops)

## Next Steps

After exploring the sample configurations:

1. Create your own configurations via the UI
2. Adjust capacity rules to match your institution's policies
3. Set up teams for collaborative teaching models
4. Configure fallback chains for comprehensive coverage
5. Run integration tests to verify all scenarios
6. Deploy to production with your real data

## Related Documentation

- [Configurable Scheduling Framework Overview](./configurable-scheduling.md)
- [API Documentation](./api-reference.md)
- [Strategy Guide](./scheduling-strategies.md)
- [Capacity Rules Hierarchy](./capacity-rules.md)
