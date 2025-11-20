# Constraint Factory Pattern Design

## Executive Summary

This document describes the design for a **Constraint Factory Pattern** that bridges the gap between database-stored clerkship requirements and the constraint-based scheduling engine. This allows arbitrary new requirements to be added without modifying the core scheduling algorithm.

**Goal:** Enable configuration-driven constraints so that new requirement types can be added by:
1. Creating a new constraint class
2. Adding configuration to the database
3. Registering the constraint in the factory
4. **NO changes to the scheduling algorithm itself**

---

## Current Architecture

### Scheduling Engine (Already Excellent!)

**File:** `src/lib/features/scheduling/services/scheduling-engine.ts`

The engine uses a **constraint-based plugin architecture**:

```typescript
class SchedulingEngine {
  constructor(constraints: Constraint[]) {
    this.constraints = constraints.sort((a, b) =>
      (a.priority || 99) - (b.priority || 99)
    );
  }

  generateSchedule(...) {
    // For each potential assignment:
    for (const constraint of this.constraints) {
      if (!constraint.validate(assignment, context, tracker)) {
        return false; // Constraint violated
      }
    }
  }
}
```

**Key Benefits:**
- ✅ Pluggable - any constraint implementing the interface works
- ✅ Priority-based - cheap constraints checked first
- ✅ Bypassable - some constraints can be optionally ignored
- ✅ No hardcoded logic - fully extensible

### Constraint Interface

**File:** `src/lib/features/scheduling/types/constraint.ts`

```typescript
interface Constraint {
  name: string;
  priority?: number;      // Lower = checked first
  bypassable?: boolean;   // Can user ignore this?

  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean;

  getViolationMessage(
    assignment: Assignment,
    context: SchedulingContext
  ): string;
}
```

### Existing Constraints

**Directory:** `src/lib/features/scheduling/constraints/`

Currently implemented (hardcoded):
- `BlackoutDateConstraint` - No assignments on blackout dates
- `NoDoubleBookingConstraint` - Student can't be in two places at once
- `PreceptorAvailabilityConstraint` - Preceptor must be available
- `PreceptorCapacityConstraint` - Max students per preceptor per day
- `SpecialtyMatchConstraint` - Preceptor specialty must match clerkship

**Problem:** These are hardcoded classes with no connection to database configuration.

---

## The Gap: Requirements → Constraints

### Database: `clerkship_requirements` Table

```sql
CREATE TABLE clerkship_requirements (
  id TEXT PRIMARY KEY,
  clerkship_id TEXT,
  requirement_type TEXT, -- 'elective', future: 'exam', 'onboarding', etc.
  name TEXT,
  required_days INTEGER,

  -- Configuration fields
  allow_cross_system BOOLEAN,
  override_assignment_strategy TEXT,
  override_health_system_rule TEXT,
  override_max_students_per_day INTEGER,
  -- ... more override fields
);
```

### Current Problem

**Configuration exists in database**, but:
- ❌ No automatic instantiation of constraints from requirements
- ❌ Adding new requirement type requires hardcoding
- ❌ No way to make school-specific constraints without code changes
- ❌ Constraint parameters are hardcoded, not from DB

**Example:** To enforce "electives can't go cross-system", you need to:
1. Add `allow_cross_system` field to database ✅
2. Manually create `ElectiveCrossSystemConstraint` class ❌
3. Manually instantiate it in engine initialization ❌
4. Hardcode the logic to read from database ❌

---

## Proposed Solution: Constraint Factory

### Overview

A factory that:
1. Reads all `clerkship_requirements` from database
2. Reads `global_*_defaults` configuration
3. **Automatically instantiates** the correct constraint classes
4. Passes configuration parameters to constraints
5. Returns array of constraints ready for scheduling engine

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│          Database (Configuration)               │
│  ┌───────────────────────────────────────────┐  │
│  │ clerkship_requirements                    │  │
│  │ - requirement_type: 'elective'            │  │
│  │ - allow_cross_system: false               │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ global_inpatient_defaults                 │  │
│  │ - assignment_strategy: 'block_based'      │  │
│  │ - health_system_rule: 'enforce_same'      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│         ConstraintFactory.build()               │
│  ┌───────────────────────────────────────────┐  │
│  │ 1. Load all requirements                  │  │
│  │ 2. Resolve configurations (inherit/override)│
│  │ 3. Instantiate constraint classes         │  │
│  │ 4. Pass parameters to constructors        │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│       Array<Constraint> (Ready for Engine)      │
│  ┌───────────────────────────────────────────┐  │
│  │ new HealthSystemContinuityConstraint(     │  │
│  │   requirementId: 'req-123',               │  │
│  │   enforceRule: 'enforce_same_system'      │  │
│  │ )                                         │  │
│  │                                           │  │
│  │ new ElectiveCrossSystemConstraint(        │  │
│  │   requirementId: 'req-456',               │  │
│  │   allowCrossSystem: false                 │  │
│  │ )                                         │  │
│  │                                           │  │
│  │ new CapacityConstraint(                   │  │
│  │   maxPerDay: 1,                           │  │
│  │   maxPerYear: 3                           │  │
│  │ )                                         │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│           SchedulingEngine                      │
│  Uses constraints automatically, no changes!    │
└─────────────────────────────────────────────────┘
```

---

## Implementation Design

### 1. Constraint Factory Service

**File:** `src/lib/features/scheduling/services/constraint-factory.ts`

```typescript
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Constraint } from '../types/constraint';
import { GlobalDefaultsService } from '../../scheduling-config/services/global-defaults.service';
import { RequirementService } from '../../scheduling-config/services/requirements.service';

// Import all constraint classes
import { BlackoutDateConstraint } from '../constraints/blackout-date.constraint';
import { NoDoubleBookingConstraint } from '../constraints/no-double-booking.constraint';
import { HealthSystemContinuityConstraint } from '../constraints/health-system-continuity.constraint';
import { ElectiveCrossSystemConstraint } from '../constraints/elective-cross-system.constraint';
import { StudentOnboardingConstraint } from '../constraints/student-onboarding.constraint';
import { PreceptorClerkshipAssociationConstraint } from '../constraints/preceptor-clerkship-association.constraint';
import { CapacityConstraint } from '../constraints/capacity.constraint';

/**
 * Constraint Factory
 *
 * Builds constraint instances from database configuration.
 * This bridges the gap between stored requirements and runtime constraints.
 */
export class ConstraintFactory {
  private globalDefaultsService: GlobalDefaultsService;
  private requirementService: RequirementService;

  constructor(private db: Kysely<DB>) {
    this.globalDefaultsService = new GlobalDefaultsService(db);
    this.requirementService = new RequirementService(db);
  }

  /**
   * Build all constraints for scheduling
   *
   * Reads clerkship requirements, resolves configurations, and instantiates
   * the appropriate constraint classes with parameters.
   */
  async buildConstraints(
    clerkshipIds: string[]
  ): Promise<Constraint[]> {
    const constraints: Constraint[] = [];

    // 1. Add universal constraints (always active)
    constraints.push(
      new BlackoutDateConstraint(),
      new NoDoubleBookingConstraint()
    );

    // 2. Load all global defaults
    const [outpatientDefaults, inpatientDefaults, electiveDefaults] = await Promise.all([
      this.globalDefaultsService.getOutpatientDefaults(),
      this.globalDefaultsService.getInpatientDefaults(),
      this.globalDefaultsService.getElectiveDefaults()
    ]);

    // 3. Load all requirements for specified clerkships
    const allRequirements = [];
    for (const clerkshipId of clerkshipIds) {
      const result = await this.requirementService.getRequirementsByClerkship(clerkshipId);
      if (result.success) {
        allRequirements.push(...result.data);
      }
    }

    // 4. Build requirement-specific constraints
    for (const requirement of allRequirements) {
      // Get resolved configuration (global defaults + overrides)
      const resolvedConfig = this.resolveConfiguration(
        requirement,
        outpatientDefaults.data,
        inpatientDefaults.data,
        electiveDefaults.data
      );

      // Add health system continuity constraint
      if (resolvedConfig.healthSystemRule === 'enforce_same_system') {
        constraints.push(
          new HealthSystemContinuityConstraint(
            requirement.id,
            requirement.clerkshipId,
            true // strict enforcement
          )
        );
      } else if (resolvedConfig.healthSystemRule === 'prefer_same_system') {
        constraints.push(
          new HealthSystemContinuityConstraint(
            requirement.id,
            requirement.clerkshipId,
            false // soft preference (bypassable)
          )
        );
      }

      // Add elective-specific constraints
      if (requirement.requirementType === 'elective') {
        if (!requirement.allowCrossSystem) {
          constraints.push(
            new ElectiveCrossSystemConstraint(
              requirement.id,
              requirement.clerkshipId
            )
          );
        }
      }

      // Add capacity constraints
      constraints.push(
        new CapacityConstraint(
          requirement.id,
          resolvedConfig.maxStudentsPerDay,
          resolvedConfig.maxStudentsPerYear,
          resolvedConfig.maxStudentsPerBlock
        )
      );

      // Add student onboarding constraint
      constraints.push(
        new StudentOnboardingConstraint(requirement.id)
      );

      // Add preceptor-clerkship association constraint
      constraints.push(
        new PreceptorClerkshipAssociationConstraint(
          requirement.clerkshipId,
          requirement.requirementType === 'elective' ? requirement.id : null
        )
      );
    }

    return constraints;
  }

  /**
   * Resolve configuration by merging global defaults with requirement overrides
   */
  private resolveConfiguration(
    requirement: any,
    outpatientDefaults: any,
    inpatientDefaults: any,
    electiveDefaults: any
  ): any {
    // Select appropriate global defaults
    let defaults;
    if (requirement.requirementType === 'outpatient' || requirement.clerkshipType === 'outpatient') {
      defaults = outpatientDefaults;
    } else if (requirement.requirementType === 'inpatient' || requirement.clerkshipType === 'inpatient') {
      defaults = inpatientDefaults;
    } else {
      defaults = electiveDefaults;
    }

    // Start with defaults
    const resolved = {
      healthSystemRule: defaults.healthSystemRule,
      maxStudentsPerDay: defaults.defaultMaxStudentsPerDay,
      maxStudentsPerYear: defaults.defaultMaxStudentsPerYear,
      maxStudentsPerBlock: defaults.defaultMaxStudentsPerBlock,
      assignmentStrategy: defaults.assignmentStrategy,
    };

    // Apply overrides if override_mode is not 'inherit'
    if (requirement.overrideMode !== 'inherit') {
      if (requirement.overrideHealthSystemRule) {
        resolved.healthSystemRule = requirement.overrideHealthSystemRule;
      }
      if (requirement.overrideMaxStudentsPerDay) {
        resolved.maxStudentsPerDay = requirement.overrideMaxStudentsPerDay;
      }
      if (requirement.overrideMaxStudentsPerYear) {
        resolved.maxStudentsPerYear = requirement.overrideMaxStudentsPerYear;
      }
      if (requirement.overrideMaxStudentsPerBlock) {
        resolved.maxStudentsPerBlock = requirement.overrideMaxStudentsPerBlock;
      }
      if (requirement.overrideAssignmentStrategy) {
        resolved.assignmentStrategy = requirement.overrideAssignmentStrategy;
      }
    }

    return resolved;
  }
}
```

### 2. New Constraint Classes

#### Health System Continuity Constraint

**File:** `src/lib/features/scheduling/constraints/health-system-continuity.constraint.ts`

```typescript
import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students stay within same health system for entire clerkship
 *
 * Configurable: can be strict (non-bypassable) or preference (bypassable)
 */
export class HealthSystemContinuityConstraint implements Constraint {
  name = 'HealthSystemContinuity';
  priority = 2;

  constructor(
    private requirementId: string,
    private clerkshipId: string,
    private strict: boolean // true = enforce, false = prefer
  ) {
    this.bypassable = !strict;
  }

  bypassable: boolean;

  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean {
    // Get student's existing assignments for this clerkship
    const studentAssignments = context.assignmentsByStudent.get(assignment.studentId) || [];
    const clerkshipAssignments = studentAssignments.filter(
      a => a.clerkshipId === this.clerkshipId
    );

    if (clerkshipAssignments.length === 0) {
      return true; // First assignment for this clerkship, any health system OK
    }

    // Get health system of first assignment
    const firstAssignment = clerkshipAssignments[0];
    const firstPreceptor = context.preceptors.find(p => p.id === firstAssignment.preceptorId);
    const firstHealthSystem = firstPreceptor?.health_system_id;

    // Get health system of proposed assignment
    const proposedPreceptor = context.preceptors.find(p => p.id === assignment.preceptorId);
    const proposedHealthSystem = proposedPreceptor?.health_system_id;

    const isValid = firstHealthSystem === proposedHealthSystem;

    if (!isValid) {
      const student = context.students.find(s => s.id === assignment.studentId);
      const clerkship = context.clerkships.find(c => c.id === assignment.clerkshipId);

      violationTracker.recordViolation(
        this.name,
        assignment,
        this.getViolationMessage(assignment, context),
        {
          studentName: student?.name,
          clerkshipName: clerkship?.name,
          establishedHealthSystem: firstHealthSystem,
          proposedHealthSystem: proposedHealthSystem,
          strict: this.strict
        }
      );
    }

    return isValid;
  }

  getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
    return this.strict
      ? `Student must stay in same health system for entire clerkship`
      : `Prefer student to stay in same health system for clerkship continuity`;
  }
}
```

#### Elective Cross-System Constraint

**File:** `src/lib/features/scheduling/constraints/elective-cross-system.constraint.ts`

```typescript
/**
 * Enforces whether electives can go outside student's main health system
 *
 * Configuration: allow_cross_system field on requirement
 */
export class ElectiveCrossSystemConstraint implements Constraint {
  name = 'ElectiveCrossSystem';
  priority = 3;
  bypassable = false;

  constructor(
    private requirementId: string,
    private clerkshipId: string
  ) {}

  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean {
    // This constraint only applies if this assignment is for the elective
    // requirement we're tracking

    // Get student's main health system from their core clerkship assignments
    const studentAssignments = context.assignmentsByStudent.get(assignment.studentId) || [];
    const coreAssignments = studentAssignments.filter(
      a => a.clerkshipId === this.clerkshipId && a.requirementId !== this.requirementId
    );

    if (coreAssignments.length === 0) {
      return true; // No core assignments yet, can't determine main health system
    }

    const corePreceptor = context.preceptors.find(
      p => p.id === coreAssignments[0].preceptorId
    );
    const mainHealthSystem = corePreceptor?.health_system_id;

    // Get proposed elective preceptor's health system
    const electivePreceptor = context.preceptors.find(
      p => p.id === assignment.preceptorId
    );
    const electiveHealthSystem = electivePreceptor?.health_system_id;

    const isValid = mainHealthSystem === electiveHealthSystem;

    if (!isValid) {
      violationTracker.recordViolation(
        this.name,
        assignment,
        this.getViolationMessage(assignment, context),
        {
          mainHealthSystem,
          electiveHealthSystem
        }
      );
    }

    return isValid;
  }

  getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
    return `Elective must be within student's main clerkship health system`;
  }
}
```

#### Student Onboarding Constraint

**File:** `src/lib/features/scheduling/constraints/student-onboarding.constraint.ts`

```typescript
/**
 * Ensures student has completed onboarding for health system before assignment
 */
export class StudentOnboardingConstraint implements Constraint {
  name = 'StudentOnboarding';
  priority = 1; // Check early
  bypassable = false;

  constructor(private requirementId: string) {}

  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean {
    const preceptor = context.preceptors.find(p => p.id === assignment.preceptorId);
    if (!preceptor) return false;

    const healthSystemId = preceptor.health_system_id;

    // Check if student has completed onboarding for this health system
    // This requires extending SchedulingContext to include onboarding data
    const studentOnboarding = context.studentOnboarding?.get(assignment.studentId);
    const isOnboarded = studentOnboarding?.has(healthSystemId);

    if (!isOnboarded) {
      const student = context.students.find(s => s.id === assignment.studentId);
      const healthSystem = context.healthSystems?.find(h => h.id === healthSystemId);

      violationTracker.recordViolation(
        this.name,
        assignment,
        this.getViolationMessage(assignment, context),
        {
          studentName: student?.name,
          healthSystemName: healthSystem?.name,
          healthSystemId
        }
      );
    }

    return isOnboarded || false;
  }

  getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
    const preceptor = context.preceptors.find(p => p.id === assignment.preceptorId);
    const healthSystem = context.healthSystems?.find(h => h.id === preceptor?.health_system_id);
    return `Student must complete onboarding for ${healthSystem?.name} before assignment`;
  }
}
```

#### Preceptor-Clerkship Association Constraint

**File:** `src/lib/features/scheduling/constraints/preceptor-clerkship-association.constraint.ts`

```typescript
/**
 * Ensures preceptor is associated with the clerkship/elective they're teaching
 */
export class PreceptorClerkshipAssociationConstraint implements Constraint {
  name = 'PreceptorClerkshipAssociation';
  priority = 1;
  bypassable = false;

  constructor(
    private clerkshipId: string,
    private electiveRequirementId: string | null // null if core, ID if elective
  ) {}

  validate(
    assignment: Assignment,
    context: SchedulingContext,
    violationTracker: ViolationTracker
  ): boolean {
    // Check if preceptor is in the association list
    // This requires extending SchedulingContext to include associations
    const associations = this.electiveRequirementId
      ? context.preceptorElectiveAssociations?.get(this.electiveRequirementId)
      : context.preceptorClerkshipAssociations?.get(this.clerkshipId);

    const isAssociated = associations?.has(assignment.preceptorId) || false;

    if (!isAssociated) {
      const preceptor = context.preceptors.find(p => p.id === assignment.preceptorId);
      const clerkship = context.clerkships.find(c => c.id === this.clerkshipId);

      violationTracker.recordViolation(
        this.name,
        assignment,
        this.getViolationMessage(assignment, context),
        {
          preceptorName: preceptor?.name,
          clerkshipName: clerkship?.name,
          isElective: !!this.electiveRequirementId
        }
      );
    }

    return isAssociated;
  }

  getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
    const preceptor = context.preceptors.find(p => p.id === assignment.preceptorId);
    const clerkship = context.clerkships.find(c => c.id === this.clerkshipId);
    return `Preceptor ${preceptor?.name} is not authorized to teach ${clerkship?.name}`;
  }
}
```

### 3. Enhanced Scheduling Context

**File:** `src/lib/features/scheduling/types/scheduling-context.ts`

Add new fields to support new constraints:

```typescript
export interface SchedulingContext {
  // ... existing fields ...

  /**
   * Student onboarding completion by health system
   * Map: studentId -> Set of health system IDs they've completed onboarding for
   */
  studentOnboarding?: Map<string, Set<string>>;

  /**
   * Preceptor-clerkship associations
   * Map: clerkshipId -> Set of preceptor IDs authorized to teach it
   */
  preceptorClerkshipAssociations?: Map<string, Set<string>>;

  /**
   * Preceptor-elective associations
   * Map: electiveRequirementId -> Set of preceptor IDs authorized to teach it
   */
  preceptorElectiveAssociations?: Map<string, Set<string>>;

  /**
   * Health systems (for onboarding constraint)
   */
  healthSystems?: Array<{ id: string; name: string }>;
}
```

### 4. Usage in Scheduling Engine

**File:** `src/lib/features/scheduling/services/scheduling-engine.ts`

No changes needed! The engine already accepts constraints array.

**Initialization code** (where engine is created):

```typescript
import { ConstraintFactory } from './constraint-factory';
import { SchedulingEngine } from './scheduling-engine';

// In scheduling workflow/service
async function runScheduling(clerkshipIds: string[]) {
  const factory = new ConstraintFactory(db);

  // Build constraints from database configuration
  const constraints = await factory.buildConstraints(clerkshipIds);

  // Create engine with dynamically generated constraints
  const engine = new SchedulingEngine(constraints);

  // Run scheduling (no changes to this part)
  const result = await engine.generateSchedule(
    students,
    preceptors,
    clerkships,
    blackoutDates,
    availabilityRecords,
    startDate,
    endDate
  );

  return result;
}
```

---

## Adding New Requirements (Workflow)

### Example: Add "Block Scheduling Constraint"

**Step 1: Define the requirement in database**

Admin creates requirement via UI:
- requirement_type: 'block_scheduling'
- min_block_size: 7 days
- max_block_size: 14 days

**Step 2: Create constraint class**

```typescript
// src/lib/features/scheduling/constraints/block-scheduling.constraint.ts
export class BlockSchedulingConstraint implements Constraint {
  name = 'BlockScheduling';
  priority = 4;
  bypassable = false;

  constructor(
    private requirementId: string,
    private minBlockSize: number,
    private maxBlockSize: number
  ) {}

  validate(assignment, context, tracker): boolean {
    // Logic to ensure assignments form blocks of min/max size
    // ...
  }
}
```

**Step 3: Register in factory**

```typescript
// In ConstraintFactory.buildConstraints()
if (requirement.requirementType === 'block_scheduling') {
  constraints.push(
    new BlockSchedulingConstraint(
      requirement.id,
      requirement.minBlockSize,
      requirement.maxBlockSize
    )
  );
}
```

**That's it!** No changes to:
- ❌ Scheduling algorithm
- ❌ Database schema (if using JSON config)
- ❌ Any other constraints
- ❌ UI (reads from same requirement config)

---

## Benefits of This Design

### 1. **Extensibility**
- Add new requirement types without touching core algorithm
- School-specific requirements = new constraint classes
- No risk of breaking existing functionality

### 2. **Configuration-Driven**
- All configuration lives in database
- Changes to requirements don't require code deployments
- Different schools can have different requirements

### 3. **Maintainability**
- Each constraint is isolated in its own file
- Clear separation of concerns
- Easy to test constraints independently

### 4. **Flexibility**
- Can enable/disable constraints per school
- Can adjust constraint parameters via admin UI
- Can bypass certain constraints if needed

### 5. **Transparency**
- Violation tracking shows which constraints blocked assignments
- Easy to debug scheduling failures
- Clear audit trail of why assignments were/weren't made

---

## Migration Path

### Phase 1: Infrastructure (This PR)
1. ✅ Create database migrations for new requirement structure
2. ✅ Update clerkship schemas and services
3. ⬜ Implement ConstraintFactory class
4. ⬜ Extend SchedulingContext with new fields
5. ⬜ Update context builder to load new data

### Phase 2: Core Constraints (Next PR)
1. ⬜ Implement HealthSystemContinuityConstraint
2. ⬜ Implement ElectiveCrossSystemConstraint
3. ⬜ Implement StudentOnboardingConstraint
4. ⬜ Implement PreceptorClerkshipAssociationConstraint
5. ⬜ Refactor existing CapacityConstraint to be parametrized

### Phase 3: Integration (Following PR)
1. ⬜ Wire up factory in scheduling workflow
2. ⬜ Update scheduling UI to use factory
3. ⬜ Add admin UI for managing requirement configurations
4. ⬜ Write integration tests

### Phase 4: Advanced Features (Future)
1. ⬜ Constraint dependency graph (some constraints depend on others)
2. ⬜ Dynamic constraint priority based on context
3. ⬜ Machine learning to optimize constraint parameters
4. ⬜ Constraint templates for common requirement patterns

---

## Testing Strategy

### Unit Tests
- Test each constraint class independently
- Mock SchedulingContext
- Verify violation messages
- Test priority ordering

### Integration Tests
- Test ConstraintFactory.buildConstraints()
- Verify constraints are instantiated correctly
- Test configuration resolution (inherit vs override)

### End-to-End Tests
- Create sample requirements in test database
- Run factory → generate constraints
- Run scheduling with generated constraints
- Verify schedules respect requirements

---

## Open Questions

1. **Constraint Conflicts:** What happens if two requirements have conflicting constraints?
   - Example: One says "enforce same health system", another says "allow cross system"
   - Proposal: Most restrictive wins (enforce > prefer > allow)

2. **Performance:** Loading all requirements for constraint building might be slow
   - Proposal: Cache constraint arrays per clerkship combination
   - Invalidate cache when requirements change

3. **Versioning:** What if constraint logic changes mid-year?
   - Proposal: Snapshot constraint configuration at schedule generation time
   - Store constraint versions with generated schedules

4. **UI for Constraint Configuration:** How do admins configure complex constraints?
   - Proposal: Start with simple toggles, add advanced JSON editor later
   - Provide templates for common requirement patterns

---

## Conclusion

The Constraint Factory pattern provides a **scalable, maintainable, and flexible** way to manage scheduling requirements. By bridging database configuration with runtime constraint validation, we enable:

- ✅ Arbitrary new requirements without algorithm changes
- ✅ School-specific customization
- ✅ Clear separation of concerns
- ✅ Easy testing and debugging
- ✅ Future-proof architecture

This design leverages the excellent existing constraint interface and scheduling engine, adding the missing piece: **automatic constraint instantiation from configuration**.
