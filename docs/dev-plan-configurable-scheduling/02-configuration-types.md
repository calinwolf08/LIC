# Step 02: Configuration Types and Domain Models

## Objective

Create TypeScript types, interfaces, and domain models that represent the configuration system. These types will provide type safety across the application and serve as the contract between the database layer, service layer, and UI.

## Scope

### Type Categories to Create

1. **Enum Types** - Assignment strategies, requirement types, health system rules
2. **Database Record Types** - Direct representations of database tables
3. **Domain Model Types** - Rich objects with computed properties and validation
4. **Configuration DTOs** - Data transfer objects for API requests/responses
5. **Validation Schemas** - Zod schemas for runtime validation

## Type Definitions Needed

### 1. Enumerations

**Assignment Strategy Enums**
- Define all possible assignment strategies
- Include descriptions for UI display
- Map to database enum values

**Requirement Type Enums**
- Outpatient, Inpatient, Elective
- Include display labels

**Health System Continuity Enums**
- Enforce, Prefer, No Preference
- Include violation behavior descriptions

**Team Formation Rule Enums**
- Rule types for team validation
- Include constraint descriptions

### 2. Core Configuration Types

**ClerkshipConfiguration**
- Represents complete configuration for a clerkship
- Includes assignment strategy, health system rules, block settings
- References to child configurations (requirements, electives)

**ClerkshipRequirement**
- Represents split requirement (inpatient/outpatient/elective)
- Includes required days, assignment mode, setting type
- Links to parent clerkship configuration

**ClerkshipElective**
- Represents elective option within clerkship
- Includes minimum days, available preceptors, specialty requirements
- Links to parent clerkship configuration

**PreceptorTeam**
- Represents team of preceptors working together
- Includes team formation rules, member list
- Links to clerkship and health system

**PreceptorTeamMember**
- Represents individual preceptor in team
- Includes role, priority, preceptor reference

**PreceptorFallback**
- Represents fallback chain for unavailable preceptors
- Includes priority order, approval requirements, override rules
- Links to primary and fallback preceptor

**PreceptorCapacityRule**
- Represents capacity constraints for preceptor
- Includes per-day, per-year, per-block limits
- Can be general or clerkship-specific

**HealthSystem**
- Represents health system entity
- Includes name, location, metadata

**Site**
- Represents physical site within health system
- Links to health system

### 3. Aggregate Types

**CompleteClerkshipConfiguration**
- Combines clerkship with all its configurations
- Includes requirements array, electives array
- Denormalized for easy consumption by scheduling engine

**PreceptorWithDetails**
- Combines preceptor with health system, site, capacity rules
- Includes teams they belong to, fallback chains
- Denormalized for scheduling engine

### 4. Validation Types

**ClerkshipConfigurationInput**
- DTO for creating/updating clerkship configuration
- Used by API endpoints
- Validated by Zod schema

**RequirementInput**
- DTO for creating/updating requirements
- Validates total days match clerkship requirement
- Validates assignment modes are valid for strategy

**ElectiveInput**
- DTO for creating/updating electives
- Validates minimum days, preceptor availability

**TeamFormationInput**
- DTO for creating teams
- Validates team size, rules consistency

**CapacityRuleInput**
- DTO for creating capacity rules
- Validates limits are positive, block limits make sense

## Type Organization

### Directory Structure
```
src/lib/features/scheduling-config/
├── types/
│   ├── index.ts (exports all types)
│   ├── enums.ts
│   ├── configuration.ts
│   ├── requirements.ts
│   ├── teams.ts
│   ├── capacity.ts
│   ├── health-systems.ts
│   └── aggregates.ts
├── schemas/
│   ├── index.ts (exports all schemas)
│   ├── configuration.schemas.ts
│   ├── requirements.schemas.ts
│   ├── teams.schemas.ts
│   ├── capacity.schemas.ts
│   └── health-systems.schemas.ts
```

## Implementation Tasks

### 1. Create Enum Types
- Define all enumeration types with TypeScript enums or const objects
- Include helper functions to convert between enum values and display labels
- Create type guards for runtime type checking

### 2. Create Base Types
- Define types for each database table (leverage Kysely generated types)
- Add computed properties where needed
- Include JSDoc comments for documentation

### 3. Create Aggregate Types
- Combine related types into denormalized structures
- Design for optimal scheduling engine consumption
- Balance between completeness and performance

### 4. Create Validation Schemas
- Define Zod schemas for all input types
- Include cross-field validations
- Create type-safe validators with error messages

### 5. Create Type Utilities
- Helper functions for type transformations
- Type guards for runtime checking
- Factory functions for creating default configurations

## Testing Requirements

### Unit Tests

1. **Enum Tests**
   - Test enum value conversions
   - Test display label mappings
   - Test type guards work correctly

2. **Validation Schema Tests**
   - Test valid inputs pass validation
   - Test invalid inputs fail with correct error messages
   - Test cross-field validations work
   - Test edge cases (null, undefined, empty strings, negative numbers)

3. **Type Transformation Tests**
   - Test database type to domain model conversions
   - Test domain model to DTO conversions
   - Test aggregate type construction

4. **Factory Function Tests**
   - Test default configuration factories create valid objects
   - Test factory functions with partial inputs
   - Test factory functions handle edge cases

### Integration Tests

1. **Schema Integration Tests**
   - Test schemas work with actual database queries
   - Test validation catches real-world invalid data
   - Test type safety across service boundaries

2. **Type Safety Tests**
   - Compile-time tests (TypeScript compiler checks)
   - Runtime type guard tests with real data
   - Test type compatibility with Kysely queries

## Validation Rules to Implement

### ClerkshipConfiguration Validation
- Assignment strategy must be valid enum value
- Block size required if strategy is block_based
- Health system rule must be valid enum value
- If hybrid mode, must have requirements with different modes

### ClerkshipRequirement Validation
- Total required days across all requirements must equal clerkship.required_days
- Requirement type must be valid enum
- Assignment mode must be compatible with parent configuration strategy
- Cannot have duplicate requirement types for same clerkship

### ClerkshipElective Validation
- Minimum days must be positive
- Minimum days must be less than total elective days available
- Referenced preceptors must exist and have matching specialty

### PreceptorTeam Validation
- Team must have 2+ members
- All members must exist as preceptors
- If require_same_health_system flag set, all members must share health system
- If require_same_specialty flag set, all members must share specialty
- Team size must not exceed configured maximum

### PreceptorCapacityRule Validation
- All capacity limits must be non-negative
- max_students_per_day must be greater than 0
- max_students_per_year must be >= max_students_per_day * typical_days_per_year
- max_students_per_block only valid for block-based clerkships

### PreceptorFallback Validation
- Cannot have circular fallback chains (A → B → A)
- Fallback preceptor must have compatible specialty
- Priority values must be unique within chain
- If health system override not allowed, fallback must be in same system

## Acceptance Criteria

- [ ] All enumeration types defined with proper values
- [ ] All base types defined matching database schema
- [ ] All aggregate types defined for scheduling engine consumption
- [ ] All validation schemas defined with Zod
- [ ] All type utilities and helpers implemented
- [ ] 100% unit test coverage for validation schemas
- [ ] 100% unit test coverage for type transformations
- [ ] All validation rules implemented and tested
- [ ] Type safety verified (no 'any' types except where necessary)
- [ ] JSDoc comments added to all public types and functions
- [ ] Type exports properly organized in index files

## Files to Create

### New Files
```
src/lib/features/scheduling-config/types/index.ts
src/lib/features/scheduling-config/types/enums.ts
src/lib/features/scheduling-config/types/configuration.ts
src/lib/features/scheduling-config/types/requirements.ts
src/lib/features/scheduling-config/types/teams.ts
src/lib/features/scheduling-config/types/capacity.ts
src/lib/features/scheduling-config/types/health-systems.ts
src/lib/features/scheduling-config/types/aggregates.ts

src/lib/features/scheduling-config/schemas/index.ts
src/lib/features/scheduling-config/schemas/configuration.schemas.ts
src/lib/features/scheduling-config/schemas/requirements.schemas.ts
src/lib/features/scheduling-config/schemas/teams.schemas.ts
src/lib/features/scheduling-config/schemas/capacity.schemas.ts
src/lib/features/scheduling-config/schemas/health-systems.schemas.ts

src/lib/features/scheduling-config/types/enums.test.ts
src/lib/features/scheduling-config/schemas/configuration.schemas.test.ts
src/lib/features/scheduling-config/schemas/requirements.schemas.test.ts
src/lib/features/scheduling-config/schemas/teams.schemas.test.ts
src/lib/features/scheduling-config/schemas/capacity.schemas.test.ts
src/lib/features/scheduling-config/schemas/health-systems.schemas.test.ts
```

## Notes

- Leverage Kysely's Selectable, Insertable, Updateable types for database operations
- Use branded types for IDs to prevent mixing different entity IDs
- Consider using discriminated unions for polymorphic configurations
- Include helper types for common patterns (e.g., WithTimestamps, WithId)
- Use TypeScript 5.x features for better type inference
- Keep validation logic in Zod schemas, not in types themselves
- Consider using Zod's transform feature for automatic type conversions
