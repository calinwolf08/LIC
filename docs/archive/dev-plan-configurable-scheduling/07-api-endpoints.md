# Step 07: API Endpoints for Configuration Management

## Objective

Create RESTful API endpoints that expose configuration management functionality to the frontend. These endpoints will allow administrators to create, read, update, and delete all configuration entities through a consistent API interface.

## Scope

### Endpoint Categories

1. **Clerkship Configuration Endpoints** - Manage clerkship-level settings
2. **Requirement Endpoints** - Manage requirement splits
3. **Elective Endpoints** - Manage elective options
4. **Team Endpoints** - Manage preceptor teams
5. **Fallback Endpoints** - Manage fallback chains
6. **Capacity Rule Endpoints** - Manage capacity constraints
7. **Health System Endpoints** - Manage health systems and sites
8. **Scheduling Endpoints** - Trigger scheduling with configurations

## API Design Principles

### RESTful Design
- Use standard HTTP methods (GET, POST, PUT, DELETE)
- Use appropriate status codes (200, 201, 400, 404, 500)
- Return JSON responses
- Include pagination for list endpoints
- Support filtering and sorting

### Request/Response Format
- Request: JSON body validated by Zod schemas
- Response: Consistent structure with data/error fields
- Errors: Detailed error messages with field-level validation errors
- Success: Return created/updated entity with generated fields

### Authentication & Authorization
- Require authentication for all endpoints
- Require admin role for configuration management
- Regular users can read configurations
- Audit log all configuration changes

## Endpoint Specifications

### 1. Clerkship Configuration Endpoints

**GET /api/clerkships/:clerkshipId/configuration**
- Get complete configuration for clerkship
- Includes requirements, electives, teams, fallbacks
- Response: CompleteClerkshipConfiguration object
- 404 if clerkship not found
- 200 with default config if no custom config exists

**POST /api/clerkships/:clerkshipId/configuration**
- Create new configuration for clerkship
- Request body: ClerkshipConfigurationInput
- Validates input with Zod schema
- Returns created configuration
- 400 if validation fails
- 409 if configuration already exists
- 201 on success

**PUT /api/clerkships/:clerkshipId/configuration**
- Update existing configuration
- Request body: Partial<ClerkshipConfigurationInput>
- Validates input with Zod schema
- Returns updated configuration
- 400 if validation fails
- 404 if clerkship or configuration not found
- 200 on success

**DELETE /api/clerkships/:clerkshipId/configuration**
- Delete configuration for clerkship
- Cascades to requirements, electives
- Checks for active assignments (prevents if exist)
- 409 if active assignments exist
- 404 if configuration not found
- 204 on success

**POST /api/clerkships/:clerkshipId/configuration/validate**
- Validate configuration completeness
- Returns validation errors without saving
- Response: { valid: boolean, errors: string[] }
- 200 always (validation result in body)

**POST /api/clerkships/:clerkshipId/configuration/clone**
- Clone configuration from another clerkship
- Request body: { sourceClerkshipId: string }
- Copies all configuration to target clerkship
- Returns created configuration
- 400 if source doesn't have configuration
- 201 on success

### 2. Requirement Endpoints

**GET /api/clerkships/:clerkshipId/requirements**
- List all requirements for clerkship
- Response: Array of ClerkshipRequirement
- 200 with array (empty if none)

**POST /api/clerkships/:clerkshipId/requirements**
- Create new requirement for clerkship
- Request body: RequirementInput
- Validates total days don't exceed clerkship.required_days
- Returns created requirement
- 400 if validation fails
- 201 on success

**GET /api/requirements/:requirementId**
- Get single requirement
- Response: ClerkshipRequirement
- 404 if not found
- 200 on success

**PUT /api/requirements/:requirementId**
- Update requirement
- Request body: Partial<RequirementInput>
- Validates changes maintain total days constraint
- Returns updated requirement
- 400 if validation fails
- 200 on success

**DELETE /api/requirements/:requirementId**
- Delete requirement
- Updates remaining requirements to maintain total
- 409 if cannot maintain total after delete
- 204 on success

### 3. Elective Endpoints

**GET /api/clerkships/:clerkshipId/electives**
- List all electives for clerkship
- Response: Array of ClerkshipElective
- 200 with array

**POST /api/clerkships/:clerkshipId/electives**
- Create new elective option
- Request body: ElectiveInput
- Validates preceptors exist
- Returns created elective
- 400 if validation fails
- 201 on success

**GET /api/electives/:electiveId**
- Get single elective
- Includes available preceptors
- Response: ClerkshipElective with preceptor details
- 404 if not found
- 200 on success

**PUT /api/electives/:electiveId**
- Update elective
- Request body: Partial<ElectiveInput>
- Returns updated elective
- 200 on success

**DELETE /api/electives/:electiveId**
- Delete elective
- Checks for students assigned to elective
- 409 if students assigned
- 204 on success

### 4. Team Endpoints

**GET /api/clerkships/:clerkshipId/teams**
- List all teams for clerkship
- Includes team members
- Response: Array of PreceptorTeam with members
- 200 with array

**POST /api/clerkships/:clerkshipId/teams**
- Create new team
- Request body: TeamFormationInput
- Validates team rules
- Returns created team with members
- 400 if validation fails
- 201 on success

**GET /api/teams/:teamId**
- Get single team with members
- Response: PreceptorTeam with member details
- 404 if not found
- 200 on success

**PUT /api/teams/:teamId**
- Update team settings
- Request body: Partial<TeamFormationInput>
- Re-validates team rules
- Returns updated team
- 400 if validation fails
- 200 on success

**DELETE /api/teams/:teamId**
- Delete team
- Checks for students assigned to team
- 409 if students assigned
- 204 on success

**POST /api/teams/:teamId/members**
- Add member to team
- Request body: { preceptorId: string, role?: string }
- Validates team size and rules
- Returns updated team
- 400 if validation fails
- 200 on success

**DELETE /api/teams/:teamId/members/:preceptorId**
- Remove member from team
- Validates team still valid after removal
- 400 if removal would invalidate team
- 204 on success

### 5. Fallback Endpoints

**GET /api/preceptors/:preceptorId/fallbacks**
- List fallback chains for preceptor
- Query param: ?clerkshipId=xxx (optional filter)
- Response: Array of PreceptorFallback ordered by priority
- 200 with array

**POST /api/preceptors/:preceptorId/fallbacks**
- Create fallback for preceptor
- Request body: { fallbackPreceptorId, clerkshipId, priority, ...settings }
- Validates no circular references
- Returns created fallback
- 400 if validation fails (e.g., circular reference)
- 201 on success

**GET /api/fallbacks/:fallbackId**
- Get single fallback
- Response: PreceptorFallback
- 404 if not found
- 200 on success

**PUT /api/fallbacks/:fallbackId**
- Update fallback settings
- Request body: Partial fallback input
- Returns updated fallback
- 200 on success

**DELETE /api/fallbacks/:fallbackId**
- Delete fallback
- Removes from chain, doesn't affect other fallbacks
- 204 on success

**GET /api/preceptors/:preceptorId/fallbacks/chain**
- Get complete resolved fallback chain
- Query param: ?clerkshipId=xxx (required)
- Response: Ordered array with resolution details
- Shows which fallbacks are available, unavailable
- 200 with array

### 6. Capacity Rule Endpoints

**GET /api/preceptors/:preceptorId/capacity-rules**
- List capacity rules for preceptor
- Response: Array of PreceptorCapacityRule
- 200 with array

**POST /api/preceptors/:preceptorId/capacity-rules**
- Create capacity rule for preceptor
- Request body: CapacityRuleInput
- Can be general or clerkship-specific
- Returns created rule
- 400 if validation fails
- 201 on success

**GET /api/capacity-rules/:ruleId**
- Get single capacity rule
- Response: PreceptorCapacityRule
- 404 if not found
- 200 on success

**PUT /api/capacity-rules/:ruleId**
- Update capacity rule
- Request body: Partial<CapacityRuleInput>
- Validates new capacity doesn't conflict with existing assignments
- 409 if conflict with existing assignments
- 200 on success

**DELETE /api/capacity-rules/:ruleId**
- Delete capacity rule
- Falls back to general rule or default
- 204 on success

**GET /api/preceptors/:preceptorId/capacity/check**
- Check capacity for preceptor
- Query params: ?clerkshipId=xxx&date=YYYY-MM-DD
- Response: { hasCapacity: boolean, current: number, max: number }
- 200 with capacity info

### 7. Health System Endpoints

**GET /api/health-systems**
- List all health systems
- Response: Array of HealthSystem
- 200 with array

**POST /api/health-systems**
- Create health system
- Request body: { name, location, ... }
- Returns created system
- 201 on success

**GET /api/health-systems/:systemId**
- Get single health system
- Includes sites
- Response: HealthSystem with sites array
- 404 if not found
- 200 on success

**PUT /api/health-systems/:systemId**
- Update health system
- Request body: Partial system input
- Returns updated system
- 200 on success

**DELETE /api/health-systems/:systemId**
- Delete health system
- Checks for preceptors assigned to system
- 409 if preceptors assigned
- 204 on success

**GET /api/health-systems/:systemId/sites**
- List sites in health system
- Response: Array of Site
- 200 with array

**POST /api/health-systems/:systemId/sites**
- Create site in health system
- Request body: { name, address, ... }
- Returns created site
- 201 on success

**PUT /api/sites/:siteId**
- Update site
- Request body: Partial site input
- Returns updated site
- 200 on success

**DELETE /api/sites/:siteId**
- Delete site
- Checks for preceptors assigned to site
- 409 if preceptors assigned
- 204 on success

### 8. Enhanced Scheduling Endpoints

**POST /api/schedules/generate**
- Generate schedule using configurations
- Request body: { startDate, endDate, bypassedConstraints?: string[] }
- Loads all clerkship configurations
- Runs new scheduling engine
- Returns schedule result
- 200 with result (may include partial success)
- 500 if engine fails

**POST /api/schedules/validate**
- Validate schedule against configurations
- Request body: Array of assignments
- Checks all constraints and configurations
- Returns validation result
- 200 with validation details

**GET /api/schedules/preview**
- Preview schedule result without saving
- Query params: ?startDate=xxx&endDate=xxx
- Returns proposed assignments
- Does not save to database
- 200 with preview

## Error Response Format

Consistent error response structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "field": "required_days",
      "issue": "must be positive"
    }
  }
}
```

## Implementation Tasks

### 1. Create Route Handlers
- Implement all endpoint handlers in SvelteKit
- Use `+server.ts` files for API routes
- Follow existing pattern from current API routes

### 2. Request Validation
- Use Zod schemas from Step 02
- Validate all request bodies
- Return detailed validation errors
- Handle query parameter validation

### 3. Service Integration
- Call appropriate services from Step 03
- Handle service errors gracefully
- Transform service results to API responses
- Use consistent error handling

### 4. Response Formatting
- Transform database entities to API DTOs
- Include related entities where appropriate
- Support pagination for list endpoints
- Include metadata (total count, page info)

### 5. Authentication Integration
- Check user authentication on all endpoints
- Verify admin role for write operations
- Allow read access for authenticated users
- Return 401/403 for unauthorized requests

### 6. Audit Logging
- Log all configuration changes
- Include user, timestamp, before/after values
- Use existing audit log system or create new one

## Testing Requirements

### Integration Tests

1. **Endpoint Integration Tests (per endpoint group)**
   - Test successful request/response flow
   - Test validation errors (400)
   - Test not found errors (404)
   - Test conflict errors (409)
   - Test authentication (401/403)
   - Test database integration

2. **Configuration Workflow Tests**
   - Test creating complete clerkship configuration via API
   - Test updating configuration cascade
   - Test deleting configuration cascade
   - Test validation endpoint catches errors
   - Test clone endpoint copies correctly

3. **School Scenario Tests via API**
   - Create School A configuration via API
   - Create School B configuration via API
   - Create School C configuration via API
   - Create School D configuration via API
   - Verify each configuration is valid and complete

4. **Scheduling Integration Tests**
   - Test schedule generation with configurations
   - Test schedule validation
   - Test schedule preview
   - Verify schedule uses configurations correctly

5. **Error Handling Tests**
   - Test malformed JSON returns 400
   - Test invalid IDs return 404
   - Test constraint violations return 409
   - Test server errors return 500
   - Test error responses include helpful messages

Note: No UI component tests per requirements

## Acceptance Criteria

- [ ] All endpoint groups implemented (8 groups)
- [ ] All endpoints validated with Zod schemas
- [ ] All endpoints integrate with services from Step 03
- [ ] All endpoints return consistent response format
- [ ] All endpoints handle errors gracefully
- [ ] Authentication integrated on all endpoints
- [ ] Integration tests for all endpoints pass
- [ ] School scenario configurations can be created via API
- [ ] Scheduling endpoints work with new engine
- [ ] API documentation complete (OpenAPI/Swagger optional)
- [ ] All endpoints follow RESTful conventions
- [ ] Pagination implemented for list endpoints
- [ ] Audit logging implemented for changes

## Files to Create

### API Route Files
```
src/routes/api/clerkships/[clerkshipId]/configuration/+server.ts
src/routes/api/clerkships/[clerkshipId]/configuration/validate/+server.ts
src/routes/api/clerkships/[clerkshipId]/configuration/clone/+server.ts
src/routes/api/clerkships/[clerkshipId]/requirements/+server.ts
src/routes/api/requirements/[requirementId]/+server.ts
src/routes/api/clerkships/[clerkshipId]/electives/+server.ts
src/routes/api/electives/[electiveId]/+server.ts
src/routes/api/clerkships/[clerkshipId]/teams/+server.ts
src/routes/api/teams/[teamId]/+server.ts
src/routes/api/teams/[teamId]/members/+server.ts
src/routes/api/teams/[teamId]/members/[preceptorId]/+server.ts
src/routes/api/preceptors/[preceptorId]/fallbacks/+server.ts
src/routes/api/preceptors/[preceptorId]/fallbacks/chain/+server.ts
src/routes/api/fallbacks/[fallbackId]/+server.ts
src/routes/api/preceptors/[preceptorId]/capacity-rules/+server.ts
src/routes/api/capacity-rules/[ruleId]/+server.ts
src/routes/api/preceptors/[preceptorId]/capacity/check/+server.ts
src/routes/api/health-systems/+server.ts
src/routes/api/health-systems/[systemId]/+server.ts
src/routes/api/health-systems/[systemId]/sites/+server.ts
src/routes/api/sites/[siteId]/+server.ts
src/routes/api/schedules/generate/+server.ts (update existing)
src/routes/api/schedules/validate/+server.ts
src/routes/api/schedules/preview/+server.ts
```

### Test Files
```
src/routes/api/clerkships/[clerkshipId]/configuration/+server.test.ts
src/routes/api/requirements/+server.test.ts
src/routes/api/electives/+server.test.ts
src/routes/api/teams/+server.test.ts
src/routes/api/fallbacks/+server.test.ts
src/routes/api/capacity-rules/+server.test.ts
src/routes/api/health-systems/+server.test.ts
src/routes/api/schedules/configuration-integration.test.ts
```

## Notes

- Follow existing API patterns in codebase
- Use consistent naming conventions
- Include JSDoc comments for endpoint documentation
- Consider rate limiting for expensive operations (scheduling)
- Consider caching for frequently accessed configurations
- Log all API errors for monitoring
- Return appropriate HTTP status codes
- Support CORS if needed for external access
- Consider API versioning for future changes
- Document breaking changes clearly
