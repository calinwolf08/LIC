# Elective Scheduling Implementation Guide

## Summary
This document outlines the implementation of elective scheduling support in the ConfigurableSchedulingEngine. This work was started but not completed due to technical constraints.

## Current Status

### ✅ Completed
1. **Added `electivesByRequirement` Map to ConfigurableSchedulingEngine** (src/lib/features/scheduling/engine/configurable-scheduling-engine.ts:72)
   - Stores electives grouped by requirement ID

2. **Added `electivesByRequirement.clear()` in schedule() method** (line 105)
   - Ensures Map is reset for each scheduling run

3. **Added `electiveId` field to ProposedAssignment interface** (src/lib/features/scheduling/strategies/base-strategy.ts:20)
   - Allows assignments to track which elective they belong to

### 🚧 Remaining Work

#### 1. Load Electives in `loadClerkshipConfigurations()` method
**Location**: After line 200 (after loading clerkship_requirements)

**Code to add**:
```typescript
// Load electives for elective-type requirements
const electiveRequirements = requirements.filter(r => r.requirement_type === 'elective');
if (electiveRequirements.length > 0) {
  const requirementIds = electiveRequirements.map(r => r.id).filter((id): id is string => id !== null);

  // Load all electives with their associated sites and preceptors
  const electives = await this.db
    .selectFrom('clerkship_electives')
    .selectAll()
    .where('requirement_id', 'in', requirementIds)
    .execute();

  // Load site associations
  const electiveIds = electives.map(e => e.id).filter((id): id is string => id !== null);
  const siteAssociations = electiveIds.length > 0 ? await this.db
    .selectFrom('elective_sites')
    .selectAll()
    .where('elective_id', 'in', electiveIds)
    .execute() : [];

  // Load preceptor associations
  const preceptorAssociations = electiveIds.length > 0 ? await this.db
    .selectFrom('elective_preceptors')
    .selectAll()
    .where('elective_id', 'in', electiveIds)
    .execute() : [];

  // Group by requirement_id
  for (const requirement of electiveRequirements) {
    const requirementElectives = electives
      .filter(e => e.requirement_id === requirement.id)
      .map(elective => ({
        ...elective,
        siteIds: siteAssociations
          .filter(sa => sa.elective_id === elective.id)
          .map(sa => sa.site_id),
        preceptorIds: preceptorAssociations
          .filter(pa => pa.elective_id === elective.id)
          .map(pa => pa.preceptor_id),
      }));

    if (requirement.id) {
      this.electivesByRequirement.set(requirement.id, requirementElectives);
    }
  }
}
```

#### 2. Add `requirementId` to ResolvedRequirementConfiguration interface
**Location**: src/lib/features/scheduling-config/types/resolved-config.ts:23

**Change**:
```typescript
export interface ResolvedRequirementConfiguration {
  // Identifies which requirement this is for
  clerkshipId: string;
  requirementId?: string; // ADD THIS LINE
  requirementType: RequirementType;
  requiredDays: number;
  // ... rest of interface
}
```

#### 3. Populate `requirementId` in `resolveConfiguration()` method
**Location**: src/lib/features/scheduling/engine/configurable-scheduling-engine.ts:306

**Change** (in baseConfig object):
```typescript
const baseConfig: ResolvedRequirementConfiguration = {
  clerkshipId: clerkship.id!,
  requirementId: requirement?.id || undefined, // ADD THIS LINE
  requirementType: (requirement?.requirement_type || clerkship.clerkship_type || 'outpatient') as any,
  // ... rest of config
};
```

#### 4. Add Elective Handling in `scheduleStudentToClerkship()` method
**Location**: After line 464 (after getting config, before building context)

**Code to add**:
```typescript
// Handle elective requirements - schedule each required elective separately
if (config.requirementType === 'elective' && config.requirementId) {
  const electives = this.electivesByRequirement.get(config.requirementId) || [];
  const requiredElectives = electives.filter(e => e.is_required);

  if (requiredElectives.length === 0) {
    console.log(`[Engine] No required electives found for ${clerkship.name}, skipping`);
    return;
  }

  console.log(`[Engine] Scheduling ${requiredElectives.length} required electives for ${student.name} in ${clerkship.name}`);

  for (const elective of requiredElectives) {
    await this.scheduleStudentToElective(
      student,
      clerkship,
      elective,
      config,
      options
    );
  }
  return; // Elective scheduling handled separately
}
```

#### 5. Add `scheduleStudentToElective()` method
**Location**: After `scheduleStudentToClerkship()` method (around line 585)

**Code to add**:
```typescript
/**
 * Schedule single student to single elective
 */
private async scheduleStudentToElective(
  student: Student,
  clerkship: Clerkship,
  elective: any,
  config: ResolvedRequirementConfiguration,
  options: {
    startDate: string;
    endDate: string;
    enableTeamFormation: boolean;
    enableFallbacks: boolean;
    maxRetries: number;
    bypassedConstraints: Set<string>;
  }
): Promise<void> {
  if (!student.id || !clerkship.id || !elective.id) {
    console.error('[Engine] Student, clerkship, or elective missing valid ID');
    return;
  }

  try {
    console.log(`[Engine] Scheduling elective "${elective.name}" (${elective.minimum_days} days) for ${student.name}`);

    // Create modified config with elective's minimum_days
    const electiveConfig = {
      ...config,
      requiredDays: elective.minimum_days,
    };

    // Build strategy context
    const context = await this.contextBuilder.buildContext(student, clerkship, electiveConfig as any, {
      startDate: options.startDate,
      endDate: options.endDate,
      requirementType: 'elective',
      pendingAssignments: this.pendingAssignments,
    });

    // Filter preceptors to only those associated with this elective
    if (elective.preceptorIds && elective.preceptorIds.length > 0) {
      context.availablePreceptors = context.availablePreceptors.filter(p =>
        elective.preceptorIds.includes(p.id)
      );
    }

    if (context.availablePreceptors.length === 0) {
      console.warn(`[Engine] No available preceptors for elective "${elective.name}"`);
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: `${clerkship.name} - ${elective.name}`,
        requirementType: 'elective',
        requiredDays: elective.minimum_days,
        assignedDays: 0,
        remainingDays: elective.minimum_days,
        reason: `No available preceptors for elective "${elective.name}"`,
      });
      return;
    }

    // Select and execute strategy
    const strategy = this.strategySelector.selectStrategy(config);
    if (!strategy) {
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: `${clerkship.name} - ${elective.name}`,
        requirementType: 'elective',
        requiredDays: elective.minimum_days,
        assignedDays: 0,
        remainingDays: elective.minimum_days,
        reason: `No suitable strategy found for ${config.assignmentStrategy}`,
      });
      return;
    }

    const result = await strategy.generateAssignments(context);

    if (!result.success) {
      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: `${clerkship.name} - ${elective.name}`,
        requirementType: 'elective',
        requiredDays: elective.minimum_days,
        assignedDays: 0,
        remainingDays: elective.minimum_days,
        reason: result.error || 'Strategy execution failed',
      });
      return;
    }

    // Add elective_id to all assignments
    const electiveAssignments = result.assignments.map(assignment => ({
      ...assignment,
      electiveId: elective.id,
      requirementType: 'elective' as const,
    }));

    // Validate assignments
    const validationResult = await this.validateAssignments(
      electiveAssignments,
      options.bypassedConstraints
    );

    if (validationResult.isValid) {
      electiveAssignments.forEach(assignment => {
        this.resultBuilder.addAssignment(assignment);
        this.pendingAssignments.push({
          studentId: assignment.studentId,
          preceptorId: assignment.preceptorId,
          clerkshipId: assignment.clerkshipId,
          date: assignment.date,
        });
      });
      console.log(`[Engine] Successfully assigned ${electiveAssignments.length} days for "${elective.name}" to ${student.name}`);
    } else {
      validationResult.violations.forEach(violation => {
        this.resultBuilder.addViolation(violation);
      });

      this.resultBuilder.addUnmetRequirement({
        studentId: student.id,
        studentName: student.name,
        clerkshipId: clerkship.id,
        clerkshipName: `${clerkship.name} - ${elective.name}`,
        requirementType: 'elective',
        requiredDays: elective.minimum_days,
        assignedDays: 0,
        remainingDays: elective.minimum_days,
        reason: `Validation failed: ${validationResult.violations.map(v => v.message).join(', ')}`,
      });
    }
  } catch (error) {
    console.error(`[Engine] Error scheduling ${student.name} to elective "${elective.name}":`, error);
    this.resultBuilder.addUnmetRequirement({
      studentId: student.id,
      studentName: student.name,
      clerkshipId: clerkship.id,
      clerkshipName: `${clerkship.name} - ${elective.name}`,
      requirementType: 'elective',
      requiredDays: elective.minimum_days,
      assignedDays: 0,
      remainingDays: elective.minimum_days,
      reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
```

#### 6. Update `commitAssignments()` method
**Location**: src/lib/features/scheduling/engine/configurable-scheduling-engine.ts (around line 845)

**Change**:
```typescript
const values = assignments.map(assignment => ({
  id: nanoid(),
  student_id: assignment.studentId,
  preceptor_id: assignment.preceptorId,
  clerkshipId: assignment.clerkshipId,
  elective_id: assignment.electiveId || null, // ADD THIS LINE
  date: assignment.date,
  status: 'scheduled',
  created_at: timestamp,
}));
```

## Testing

After implementing the above changes, run:

```bash
npm test -- src/lib/features/scheduling/integration/12-elective-scheduling.test.ts
```

Tests 10 and 11 should pass, verifying that:
- Required electives are scheduled with correct minimum_days
- Assignments have elective_id populated
- Only preceptors associated with the elective are used
- Multiple electives for the same requirement are handled correctly

## Key Concepts

1. **Elective Requirements**: A clerkship_requirement with `requirement_type='elective'`
2. **Electives**: Individual elective options under a requirement (stored in `clerkship_electives`)
3. **Required vs Optional**: Electives with `is_required=true` must be scheduled for all students
4. **Associations**: Electives have specific sites (`elective_sites`) and preceptors (`elective_preceptors`)
5. **Minimum Days**: Each elective specifies its own `minimum_days` requirement

## Database Schema
- `clerkship_requirements`: Has `requirement_type` field (can be 'elective')
- `clerkship_electives`: Defines individual electives with `requirement_id`, `name`, `minimum_days`, `is_required`
- `elective_sites`: Links electives to sites via `elective_id` and `site_id`
- `elective_preceptors`: Links electives to preceptors via `elective_id` and `preceptor_id`
- `schedule_assignments`: Has `elective_id` field to track which elective was scheduled
