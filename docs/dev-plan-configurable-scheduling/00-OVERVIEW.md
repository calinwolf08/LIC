# Configurable Scheduling Framework - Development Plan

## Overview

This development plan outlines the complete refactor of the scheduling system to support configurable, per-clerkship scheduling rules. The goal is to allow any medical school to use the system with their specific scheduling requirements without code changes.

## Project Scope

### Included Features (8 Configuration Areas)

1. **Assignment Strategy** - How assignments are made (continuous, block-based, daily, hybrid)
2. **Grouping Rules** - Team formation and preceptor grouping requirements
3. **Requirement Structure** - How clerkship requirements are split (inpatient/outpatient/electives)
4. **Capacity Limits** - Per-preceptor capacity rules (daily, yearly, per-block)
5. **Health System Continuity** - Rules about health system consistency
6. **Electives** - Sub-requirement configuration and allocation
7. **Fallback System** - Backup preceptor configuration and auto-assignment rules
8. **Block Size** - Block duration and scheduling preferences for block-based assignments

### Excluded Features

- Exam scheduling (deferred to future phase)

## Technical Approach

- **Database**: SQLite with Kysely (relational schema, no JSON storage)
- **Migration Strategy**: Complete refactor (no backward compatibility required)
- **UI Strategy**: Build UI components but no UI tests
- **Configuration Scope**: Per-clerkship settings
- **Test Coverage**: Comprehensive unit and integration tests for all business logic
- **Validation**: Sample configurations for 4 different school types (A, B, C, D)

## Development Phases

The implementation is broken into 10 sequential steps:

### Phase 1: Foundation (Steps 1-3)
- **Step 01**: Database schema design and migration
- **Step 02**: Configuration types and domain models
- **Step 03**: Configuration service layer (CRUD operations)

### Phase 2: Core Scheduling Engine (Steps 4-6)
- **Step 04**: Scheduling strategy system (continuous, block, daily, hybrid)
- **Step 05**: Team and fallback preceptor logic
- **Step 06**: New configurable scheduling engine

### Phase 3: Integration (Steps 7-8)
- **Step 07**: API endpoints for configuration management
- **Step 08**: UI components for admin configuration

### Phase 4: Validation (Steps 9-10)
- **Step 09**: Sample school configurations (A, B, C, D)
- **Step 10**: End-to-end integration testing

## Success Criteria

1. All 8 configuration areas fully implemented and testable
2. 4 sample school configurations demonstrate flexibility
3. Complete unit test coverage for all services and strategies
4. Integration tests validate scheduling engine with different configurations
5. Admin UI allows full configuration of all 8 areas (no code changes needed)
6. System can schedule students for Schools A, B, C, and D using only configuration changes

## Development Timeline Estimate

- **Phase 1 (Foundation)**: 3-4 steps × 1-2 days = 3-8 days
- **Phase 2 (Core Engine)**: 3 steps × 2-3 days = 6-9 days
- **Phase 3 (Integration)**: 2 steps × 1-2 days = 2-4 days
- **Phase 4 (Validation)**: 2 steps × 1-2 days = 2-4 days

**Total Estimated Duration**: 13-25 days (varies based on complexity and testing rigor)

## Implementation Order

Each step builds on the previous, so they must be completed in sequence:

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10
```

## Testing Strategy

### Unit Tests
- All configuration models and validators
- All service methods (CRUD operations)
- All scheduling strategies in isolation
- Constraint validation logic
- Team formation algorithms
- Fallback assignment logic

### Integration Tests
- Configuration + Scheduling engine interaction
- Multi-strategy scheduling scenarios
- School A, B, C, D complete scheduling workflows
- API endpoint integration tests
- Database transaction integrity

### UI Testing
- Manual testing only (no automated UI tests per requirements)

## Next Steps

1. Review and approve this overview
2. Proceed to Step 01: Database Schema Design
3. Complete each step sequentially, validating with tests before moving forward
