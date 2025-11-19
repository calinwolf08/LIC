# Configurable Scheduling Framework - Development Plan

## Overview

This directory contains the complete step-by-step development plan for implementing a configurable scheduling framework that allows medical schools to customize scheduling behavior without code changes.

## Quick Reference

### Project Scope

**Included** (8 Configuration Areas):
1. Assignment Strategy (how to schedule)
2. Grouping Rules (team formation)
3. Requirement Structure (requirement splits)
4. Capacity Limits (preceptor constraints)
5. Health System Continuity (system consistency)
6. Electives (sub-requirements)
7. Fallback System (backup preceptors)
8. Block Size (block scheduling)

**Excluded**: Exam scheduling (future phase)

### Key Design Decisions

- **Database**: SQLite with Kysely, relational schema (no JSON storage)
- **Approach**: Complete refactor (no backward compatibility required)
- **Configuration Scope**: Per-clerkship settings
- **Testing**: Comprehensive unit + integration tests for all business logic
- **UI Testing**: Manual only (no automated UI tests)
- **Validation**: 4 sample school configurations (A, B, C, D)

## Development Steps

### Phase 1: Foundation (Days 1-8)

**Step 01: Database Schema Design** (1-2 days)
- Design relational schema for all configuration tables
- Create migration SQL
- Generate TypeScript types
- **Deliverable**: 9 new tables, migration file, updated types

**Step 02: Configuration Types and Models** (1-2 days)
- Define TypeScript types and interfaces
- Create Zod validation schemas
- Build domain models
- **Deliverable**: Complete type system with 100% validation coverage

**Step 03: Configuration Services** (2-4 days)
- Implement CRUD services for all configuration entities
- Add business rule validation
- Create service result types
- **Deliverable**: 7 services with full CRUD + business logic

### Phase 2: Core Scheduling Engine (Days 9-17)

**Step 04: Scheduling Strategies** (2-3 days)
- Implement strategy pattern
- Build 5 scheduling strategies
- Create strategy selector
- **Deliverable**: Continuous Single, Continuous Team, Block, Daily, Hybrid strategies

**Step 05: Team and Fallback Logic** (2-3 days)
- Build team formation engine
- Implement fallback resolver
- Create capacity checker
- **Deliverable**: Team formation, validation, fallback resolution, capacity checking

**Step 06: New Scheduling Engine** (2-3 days)
- Build configurable scheduling engine
- Integrate all strategies
- Add conflict resolution
- **Deliverable**: Complete scheduling engine using configurations

### Phase 3: Integration (Days 18-21)

**Step 07: API Endpoints** (1-2 days)
- Create RESTful API for configuration management
- Integrate with services
- Add authentication/authorization
- **Deliverable**: 30+ API endpoints for all configuration entities

**Step 08: UI Components** (1-2 days)
- Build admin configuration UI
- Create forms and wizards
- Add validation feedback
- **Deliverable**: Complete admin UI (no automated tests)

### Phase 4: Validation (Days 22-25)

**Step 09: Sample School Configurations** (1-2 days)
- Create School A (traditional)
- Create School B (team-based)
- Create School C (hybrid)
- Create School D (flexible)
- **Deliverable**: 4 working school configurations with seed data

**Step 10: Integration Testing** (1-2 days)
- Write end-to-end tests
- Test all school scenarios
- Performance testing
- **Deliverable**: Comprehensive integration test suite

## File Organization

```
docs/dev-plan-configurable-scheduling/
├── README.md (this file)
├── 00-OVERVIEW.md
├── 01-database-schema.md
├── 02-configuration-types.md
├── 03-configuration-services.md
├── 04-scheduling-strategies.md
├── 05-team-fallback-logic.md
├── 06-new-scheduling-engine.md
├── 07-api-endpoints.md
├── 08-ui-components.md
├── 09-sample-school-configs.md
└── 10-integration-testing.md
```

## How to Use This Plan

### For Implementation

1. **Read Overview First**: Start with `00-OVERVIEW.md` to understand scope and approach
2. **Follow Sequential Order**: Complete steps 01-10 in order (each builds on previous)
3. **Check Acceptance Criteria**: Each step has clear acceptance criteria - don't move forward until met
4. **Run Tests Continuously**: Write tests as you implement (don't defer testing)

### For Review

1. **Read Specific Steps**: Jump to relevant step for detailed specifications
2. **Review Acceptance Criteria**: Check if implementation meets criteria
3. **Validate Test Coverage**: Ensure all required tests exist and pass

### For Documentation

Each step includes:
- **Objective**: What this step accomplishes
- **Scope**: What's included/excluded
- **Implementation Tasks**: Detailed task breakdown
- **Testing Requirements**: Required unit and integration tests
- **Acceptance Criteria**: Definition of done
- **Files to Create**: Complete file list
- **Notes**: Important considerations and best practices

## Sample School Configurations

### School A: Traditional Conservative
- **Strategy**: Continuous single preceptor
- **Philosophy**: One preceptor per clerkship, maximum continuity
- **Key Feature**: Strict health system consistency

### School B: Collaborative Team-Based
- **Strategy**: Continuous team (3-4 preceptors)
- **Philosophy**: Rotating through team for diverse experience
- **Key Feature**: Pre-configured teams with balanced distribution

### School C: Hybrid Flexible
- **Strategy**: Hybrid (different per requirement type)
- **Philosophy**: Blocks for inpatient, continuous for outpatient, daily for electives
- **Key Feature**: Maximum customization per setting

### School D: Modern Maximally Flexible
- **Strategy**: Daily rotation
- **Philosophy**: Day-by-day assignment, optimize for availability
- **Key Feature**: Cross-system assignments, extensive fallbacks

## Success Metrics

### Technical Success
- [ ] All 8 configuration areas implemented
- [ ] All unit tests pass (>90% coverage)
- [ ] All integration tests pass
- [ ] Performance < 1 minute for 500 students
- [ ] No data integrity issues

### Functional Success
- [ ] All 4 school scenarios work end-to-end
- [ ] Admin can configure without code changes
- [ ] Scheduling engine respects all configurations
- [ ] Validation catches all configuration errors
- [ ] UI provides intuitive configuration experience

### Business Success
- [ ] System supports any medical school's rules
- [ ] Configuration changes don't require deployments
- [ ] System scales to real-world school sizes
- [ ] Documentation enables self-service configuration
- [ ] No regressions in existing functionality

## Dependencies

### External Dependencies
- SQLite (database)
- Kysely (query builder)
- Zod (validation)
- SvelteKit 5 (framework)
- TypeScript 5+ (language)

### Internal Dependencies
- Existing database migration system
- Existing authentication system
- Existing UI component library
- Existing API patterns
- Existing test infrastructure

## Risk Mitigation

### Technical Risks

**Risk**: Schema changes break existing data
- **Mitigation**: Careful migration design, test on copy of production data

**Risk**: Performance issues with complex configurations
- **Mitigation**: Performance testing in Step 10, optimization if needed

**Risk**: Configuration combinations create edge cases
- **Mitigation**: Comprehensive validation, extensive integration tests

### Process Risks

**Risk**: Scope creep
- **Mitigation**: Clear exclusions documented, defer exam scheduling

**Risk**: Under-estimated complexity
- **Mitigation**: Sequential approach allows re-estimation after each step

**Risk**: Testing gaps
- **Mitigation**: Acceptance criteria include test requirements

## Getting Started

1. **Review and Approve Plan**: Read through all steps, ask questions, clarify ambiguities
2. **Set Up Development Environment**: Ensure all dependencies installed
3. **Create Feature Branch**: Work on dedicated branch
4. **Start with Step 01**: Begin database schema design
5. **Checkpoint After Each Step**: Review progress, adjust timeline if needed

## Questions Before Starting?

Before implementing, please confirm:
- [ ] All clarifying questions answered
- [ ] Approach approved
- [ ] Timeline acceptable
- [ ] Resource allocation confirmed
- [ ] Priorities clear (if need to cut scope, what goes first?)

## Contact

For questions about this plan, refer back to the conversation where it was created or consult the individual step documents for detailed specifications.

---

**Last Updated**: 2025-11-19
**Status**: Ready for Review and Implementation
**Estimated Duration**: 13-25 days (depends on complexity and testing rigor)
