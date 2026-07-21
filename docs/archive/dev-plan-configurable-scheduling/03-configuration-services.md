# Step 03: Configuration Service Layer

## Objective

Implement service classes that provide CRUD (Create, Read, Update, Delete) operations for all configuration entities. These services will handle data validation, database transactions, and business logic related to configuration management.

## Scope

### Services to Create

1. **ClerkshipConfigurationService** - Manage clerkship configurations
2. **RequirementService** - Manage clerkship requirements (inpatient/outpatient/elective splits)
3. **ElectiveService** - Manage elective options
4. **TeamService** - Manage preceptor teams
5. **FallbackService** - Manage preceptor fallback chains
6. **CapacityRuleService** - Manage preceptor capacity rules
7. **HealthSystemService** - Manage health systems and sites

### Service Pattern

Each service will follow consistent patterns:
- Constructor accepts database connection
- Methods return Result types (success/error) for predictable error handling
- Transaction support for operations affecting multiple tables
- Input validation using Zod schemas from Step 02
- Business rule validation before database operations
- Comprehensive error messages

## Service Method Categories

### 1. Basic CRUD Operations

**Create**
- Validate input against schema
- Check business rules
- Insert into database
- Return created entity with generated ID

**Read (Get by ID)**
- Query database by ID
- Return entity or null if not found
- Optionally include related entities (joins)

**Read (List/Query)**
- Support filtering, sorting, pagination
- Return array of entities
- Include total count for pagination

**Update**
- Validate input against schema
- Check business rules
- Verify entity exists
- Update database
- Return updated entity

**Delete**
- Verify entity exists
- Check for dependencies (prevent orphans)
- Delete from database
- Return success/failure

### 2. Aggregate Operations

**Get Complete Configuration**
- Fetch clerkship configuration with all related entities
- Include requirements, electives, teams, fallbacks
- Denormalized structure for scheduling engine

**Bulk Operations**
- Create multiple related entities in single transaction
- Update multiple entities atomically
- Delete cascades with validation

### 3. Validation Operations

**Validate Configuration**
- Check configuration completeness
- Validate business rules across entities
- Return validation errors without saving

**Check Conflicts**
- Verify no scheduling conflicts exist with new configuration
- Check team member availability
- Validate capacity rules don't conflict

## Implementation Tasks

### 1. ClerkshipConfigurationService

**Methods**
- `createConfiguration(clerkshipId, input)` - Create new configuration for clerkship
- `getConfiguration(clerkshipId)` - Get configuration by clerkship ID
- `updateConfiguration(clerkshipId, input)` - Update existing configuration
- `deleteConfiguration(clerkshipId)` - Remove configuration
- `getCompleteConfiguration(clerkshipId)` - Get config with all related entities
- `validateConfiguration(clerkshipId)` - Check if configuration is complete and valid
- `cloneConfiguration(sourceClerkshipId, targetClerkshipId)` - Copy config to another clerkship

**Business Rules**
- Clerkship can only have one configuration
- Assignment strategy must be valid for clerkship type
- Block size required if using block-based strategy
- Cannot delete configuration if active assignments exist

### 2. RequirementService

**Methods**
- `createRequirement(clerkshipId, input)` - Add requirement to clerkship
- `getRequirement(requirementId)` - Get single requirement
- `getRequirementsByClerkship(clerkshipId)` - Get all requirements for clerkship
- `updateRequirement(requirementId, input)` - Update requirement
- `deleteRequirement(requirementId)` - Remove requirement
- `validateRequirementSplit(clerkshipId)` - Ensure requirements sum to total

**Business Rules**
- Total required days must equal clerkship.required_days
- Cannot have duplicate requirement types for same clerkship
- Assignment mode must be compatible with clerkship configuration strategy
- Must have at least one requirement if clerkship requires days

### 3. ElectiveService

**Methods**
- `createElective(clerkshipId, input)` - Add elective option
- `getElective(electiveId)` - Get single elective
- `getElectivesByClerkship(clerkshipId)` - Get all electives for clerkship
- `updateElective(electiveId, input)` - Update elective
- `deleteElective(electiveId)` - Remove elective
- `getAvailablePreceptors(electiveId)` - Get preceptors qualified for elective

**Business Rules**
- Electives only valid if clerkship has elective requirement type
- Minimum days must be less than total elective days
- Preceptors must have matching specialty
- Cannot delete elective if students currently assigned to it

### 4. TeamService

**Methods**
- `createTeam(clerkshipId, input)` - Create preceptor team
- `getTeam(teamId)` - Get team with members
- `getTeamsByClerkship(clerkshipId)` - Get all teams for clerkship
- `updateTeam(teamId, input)` - Update team settings
- `deleteTeam(teamId)` - Remove team
- `addTeamMember(teamId, preceptorId, role)` - Add preceptor to team
- `removeTeamMember(teamId, preceptorId)` - Remove preceptor from team
- `validateTeamRules(teamId)` - Check if team members satisfy formation rules

**Business Rules**
- Team must have 2+ members
- If require_same_health_system, all members must share system
- If require_same_specialty, all members must match
- Team members must be available for same clerkship
- Cannot delete team if currently assigned to students

### 5. FallbackService

**Methods**
- `createFallback(primaryPreceptorId, fallbackPreceptorId, clerkshipId, input)` - Add fallback
- `getFallback(fallbackId)` - Get single fallback
- `getFallbackChain(primaryPreceptorId, clerkshipId)` - Get ordered fallback list
- `updateFallback(fallbackId, input)` - Update fallback settings
- `deleteFallback(fallbackId)` - Remove fallback
- `validateFallbackChain(primaryPreceptorId, clerkshipId)` - Check for circular references

**Business Rules**
- Cannot create circular fallback chains
- Fallback preceptor must have compatible specialty
- Priority values must be unique within chain
- If health system override disabled, fallback must be in same system
- Fallback must be available during same time periods as primary

### 6. CapacityRuleService

**Methods**
- `createCapacityRule(preceptorId, input)` - Add capacity rule
- `getCapacityRule(ruleId)` - Get single rule
- `getCapacityRulesByPreceptor(preceptorId)` - Get all rules for preceptor
- `getCapacityRule(preceptorId, clerkshipId)` - Get specific rule for preceptor + clerkship
- `updateCapacityRule(ruleId, input)` - Update rule
- `deleteCapacityRule(ruleId)` - Remove rule
- `checkCapacity(preceptorId, clerkshipId, date)` - Check if preceptor has capacity

**Business Rules**
- All limits must be non-negative
- max_students_per_day must be > 0
- max_students_per_block only valid for block-based clerkships
- Clerkship-specific rules override general rules
- Cannot reduce capacity below current assignments

### 7. HealthSystemService

**Methods**
- `createHealthSystem(input)` - Create new health system
- `getHealthSystem(systemId)` - Get health system
- `listHealthSystems()` - Get all systems
- `updateHealthSystem(systemId, input)` - Update system
- `deleteHealthSystem(systemId)` - Remove system
- `createSite(healthSystemId, input)` - Create site within system
- `getSite(siteId)` - Get site
- `getSitesBySystem(healthSystemId)` - Get all sites in system
- `updateSite(siteId, input)` - Update site
- `deleteSite(siteId)` - Remove site

**Business Rules**
- Cannot delete health system if preceptors assigned to it
- Cannot delete site if preceptors assigned to it
- Site must belong to valid health system

## Error Handling Strategy

### Service Response Pattern

Use Result type pattern for predictable error handling:

```typescript
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError }

type ServiceError = {
  code: string;
  message: string;
  details?: unknown;
}
```

### Error Categories
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Entity doesn't exist
- `CONFLICT` - Business rule violation
- `DATABASE_ERROR` - Database operation failed
- `DEPENDENCY_ERROR` - Cannot delete due to dependencies

## Testing Requirements

### Unit Tests

1. **CRUD Operation Tests (per service)**
   - Test successful create operations
   - Test successful read operations (by ID, list)
   - Test successful update operations
   - Test successful delete operations
   - Test operations with invalid IDs return appropriate errors
   - Test operations with missing data return validation errors

2. **Business Rule Tests (per service)**
   - Test each business rule is enforced
   - Test rule violations return appropriate errors
   - Test edge cases for each rule
   - Test rule interactions (multiple rules affecting same operation)

3. **Transaction Tests**
   - Test rollback on failure (multi-entity operations)
   - Test atomic operations complete fully or not at all
   - Test concurrent operations don't create invalid state

4. **Validation Tests**
   - Test schema validation catches invalid inputs
   - Test custom validators work correctly
   - Test error messages are helpful and specific

### Integration Tests

1. **Cross-Service Integration**
   - Test creating complete clerkship configuration (multiple services)
   - Test cascading deletes work correctly
   - Test service interactions maintain data integrity

2. **Database Integration**
   - Test services work with real database
   - Test foreign key constraints enforced
   - Test transactions commit/rollback correctly

3. **Complex Scenario Tests**
   - Test creating School A configuration (continuous single preceptor)
   - Test creating School B configuration (rotating preceptors)
   - Test creating School C configuration (hybrid block + continuous)
   - Test creating School D configuration (daily rotation)

## Acceptance Criteria

- [ ] All 7 services implemented with complete CRUD operations
- [ ] All business rules implemented and enforced
- [ ] All validation uses Zod schemas from Step 02
- [ ] All services use consistent Result type pattern
- [ ] All services support transactions where needed
- [ ] 100% unit test coverage for all service methods
- [ ] 100% unit test coverage for all business rules
- [ ] Integration tests verify cross-service operations
- [ ] Error messages are clear and actionable
- [ ] Services properly handle edge cases (null, undefined, invalid IDs)
- [ ] All services include JSDoc comments
- [ ] Services can create configurations for Schools A, B, C, D

## Files to Create

### Service Files
```
src/lib/features/scheduling-config/services/index.ts
src/lib/features/scheduling-config/services/configuration.service.ts
src/lib/features/scheduling-config/services/requirements.service.ts
src/lib/features/scheduling-config/services/electives.service.ts
src/lib/features/scheduling-config/services/teams.service.ts
src/lib/features/scheduling-config/services/fallbacks.service.ts
src/lib/features/scheduling-config/services/capacity.service.ts
src/lib/features/scheduling-config/services/health-systems.service.ts
```

### Test Files
```
src/lib/features/scheduling-config/services/configuration.service.test.ts
src/lib/features/scheduling-config/services/requirements.service.test.ts
src/lib/features/scheduling-config/services/electives.service.test.ts
src/lib/features/scheduling-config/services/teams.service.test.ts
src/lib/features/scheduling-config/services/fallbacks.service.test.ts
src/lib/features/scheduling-config/services/capacity.service.test.ts
src/lib/features/scheduling-config/services/health-systems.service.test.ts
src/lib/features/scheduling-config/services/integration.test.ts
```

### Supporting Files
```
src/lib/features/scheduling-config/services/service-result.ts
src/lib/features/scheduling-config/services/service-errors.ts
```

## Notes

- Use dependency injection for database connections (testability)
- Keep services focused (single responsibility)
- Avoid circular dependencies between services
- Use transactions for operations affecting multiple tables
- Log all database errors for debugging
- Consider using a query builder for complex queries
- Return immutable objects from service methods
- Use TypeScript strict mode for type safety
- Consider implementing soft deletes for audit trail
