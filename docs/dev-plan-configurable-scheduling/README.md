# Configurable Scheduling Framework - Development Plan

## Overview

This directory contains the complete step-by-step development plan for implementing a configurable scheduling framework with **global defaults** and **per-requirement-type** configuration that allows medical schools to customize scheduling behavior without code changes.

## 🆕 Enhanced Design (Updated 2025-11-19)

The design now includes **global defaults** with **flexible override system**:
- Set school-wide defaults once for outpatient/inpatient/elective
- Each clerkship can inherit defaults or override specific settings
- Per-requirement-type configuration (different rules for outpatient vs inpatient vs elective)
- Flexible override granularity (inherit all, override fields, or override everything)

See **`ENHANCED-DESIGN-SUMMARY.md`** for complete details.

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

- **Database**: SQLite with Kysely, relational schema (13 new tables)
- **Configuration Levels**: 3-level hierarchy (global → clerkship → resolved)
- **Approach**: Complete refactor (no backward compatibility required)
- **Configuration Scope**: School-wide defaults + per-clerkship overrides
- **Override Granularity**: Field-level OR section-level (user choice)
- **Testing**: Comprehensive unit + integration tests for all business logic
- **UI Testing**: Manual only (no automated UI tests)
- **Validation**: 4 sample school configurations (A, B, C, D)

## Development Steps

### Phase 1: Foundation (Days 1-8)

**Step 01: Database Schema Design** ✅ UPDATED (1-2 days)
- Design relational schema with **global defaults** + **override tracking**
- Create migration SQL
- Generate TypeScript types
- **Deliverable**: **13 new tables** (was 9), migration file, updated types
- **Key Addition**: 3 global defaults tables, override tracking table

**Step 02: Configuration Types and Models** ✅ UPDATED (1-2 days)
- Define TypeScript types including **global defaults** and **resolved config**
- Create Zod validation schemas for defaults + overrides
- Build domain models with override support
- **Deliverable**: Complete type system with global defaults, override modes, resolved types
- **Key Addition**: GlobalDefaults types, OverrideMode enum, ResolvedConfiguration type

**Step 03: Configuration Services** 📋 NEEDS UPDATE (2-4 days)
- Implement CRUD services + **2 new services**
- Add business rule validation
- Create service result types
- **Deliverable**: **9 services** (was 7) with full CRUD + business logic
- **Key Addition**: GlobalDefaultsService, ConfigurationResolverService

### Phase 2: Core Scheduling Engine (Days 9-17)

**Step 04: Scheduling Strategies** 📋 NEEDS UPDATE (2-3 days)
- Implement strategy pattern
- Build **4 scheduling strategies** (removed hybrid)
- Create strategy selector
- **Deliverable**: Continuous Single, Continuous Team, Block, Daily strategies
- **Key Change**: Remove Hybrid (each requirement type has its own strategy now)

**Step 05: Team and Fallback Logic** ✓ NO CHANGES (2-3 days)
- Build team formation engine
- Implement fallback resolver
- Create capacity checker
- **Deliverable**: Team formation, validation, fallback resolution, capacity checking

**Step 06: New Scheduling Engine** 📋 NEEDS UPDATE (2-3 days)
- Build configurable scheduling engine with **config resolution**
- Integrate all strategies
- Add conflict resolution
- **Deliverable**: Complete scheduling engine using resolved configurations
- **Key Addition**: Configuration resolution before strategy execution

### Phase 3: Integration (Days 18-21)

**Step 07: API Endpoints** 📋 NEEDS UPDATE (1-2 days)
- Create RESTful API for configuration management
- **Add global defaults endpoints** (12 new)
- Add authentication/authorization
- **Deliverable**: **46+ API endpoints** (was 30+) for all configuration entities
- **Key Addition**: School Settings API, override control API

**Step 08: UI Components** 📋 NEEDS UPDATE (1-2 days)
- Build admin configuration UI
- **Add School Settings page**
- Create forms and wizards with override controls
- **Deliverable**: Complete admin UI with global defaults management
- **Key Addition**: School Settings page, override mode selectors

### Phase 4: Validation (Days 22-25)

**Step 09: Sample School Configurations** 📋 NEEDS UPDATE (1-2 days)
- Create School A with **global defaults** (traditional)
- Create School B with **global defaults** (team-based)
- Create School C with **global defaults + overrides** (hybrid)
- Create School D with **global defaults** (flexible)
- **Deliverable**: 4 working school configurations including global defaults setup
- **Key Addition**: Global defaults configuration for each school

**Step 10: Integration Testing** 📋 NEEDS UPDATE (1-2 days)
- Write end-to-end tests
- **Add global defaults tests**
- **Add override mode tests**
- **Add configuration resolution tests**
- Performance testing
- **Deliverable**: Comprehensive integration test suite with defaults testing
- **Key Addition**: 4 new test suites (global defaults, overrides, resolution, school scenarios)

## File Organization

```
docs/dev-plan-configurable-scheduling/
├── README.md (this file)
├── 00-OVERVIEW.md
├── ENHANCED-DESIGN-SUMMARY.md ⭐ NEW - Read this first!
├── STEPS-03-10-UPDATE-GUIDE.md ⭐ NEW - Implementation guide
├── 01-database-schema.md ✅ UPDATED
├── 02-configuration-types.md ✅ UPDATED
├── 03-configuration-services.md 📋 Use update guide
├── 04-scheduling-strategies.md 📋 Use update guide
├── 05-team-fallback-logic.md ✓ No changes needed
├── 06-new-scheduling-engine.md 📋 Use update guide
├── 07-api-endpoints.md 📋 Use update guide
├── 08-ui-components.md 📋 Use update guide
├── 09-sample-school-configs.md 📋 Use update guide
└── 10-integration-testing.md 📋 Use update guide
```

## How to Use This Plan

### For Implementation

1. **Read Enhanced Design First**: Start with `ENHANCED-DESIGN-SUMMARY.md` to understand new concepts
2. **Review Updated Steps**: Read `01-database-schema.md` and `02-configuration-types.md` for foundation
3. **Use Update Guide for Remaining Steps**: Refer to `STEPS-03-10-UPDATE-GUIDE.md` for Steps 03-10
4. **Follow Sequential Order**: Complete steps 01-10 in order (each builds on previous)
5. **Check Acceptance Criteria**: Each step has clear acceptance criteria - don't move forward until met
6. **Run Tests Continuously**: Write tests as you implement (don't defer testing)

### For Review

1. **Read Specific Steps**: Jump to relevant step for detailed specifications
2. **Review Acceptance Criteria**: Check if implementation meets criteria
3. **Validate Test Coverage**: Ensure all required tests exist and pass
4. **Check Enhanced Features**: Verify global defaults and override system work correctly

## New Concepts in Enhanced Design

### 1. Global Defaults
- School-wide configuration for outpatient, inpatient, and elective rotations
- Set once, apply to all clerkships by default
- Reduces configuration time from hours to minutes

### 2. Override Modes
- **Inherit**: Use all global defaults (fastest)
- **Override Fields**: Mix defaults + custom settings (flexible)
- **Override Section**: Fully customize (most control)

### 3. Per-Requirement-Type Configuration
- Different rules for outpatient vs inpatient vs elective
- Example: Outpatient uses continuous single, Inpatient uses 14-day blocks
- Each requirement type can have different capacity, health system rules, etc.

### 4. Configuration Resolution
- System merges global defaults + overrides at runtime
- Produces "resolved configuration" for scheduling engine
- Cached for performance

### 5. Change Management
- Updating global defaults prompts: apply to existing or new only
- Prevents unintended changes to existing clerkships
- Audit trail of configuration changes

## Sample School Configurations

### School A: Traditional Conservative
- **Global Defaults**: Continuous single, enforce same system, 1/day
- **Clerkships**: All inherit defaults (no overrides)
- **Setup Time**: 5 minutes (set defaults once)

### School B: Collaborative Team-Based
- **Global Defaults**: Team-based (3-4 preceptors), enforce same system
- **Clerkships**: All inherit, pre-configured teams
- **Setup Time**: 10 minutes (set defaults + create teams)

### School C: Hybrid Flexible
- **Global Defaults**: Continuous for outpatient, blocks for inpatient
- **Clerkships**: Most inherit, Surgery overrides outpatient to use teams
- **Setup Time**: 15 minutes (defaults + selective overrides)

### School D: Modern Maximally Flexible
- **Global Defaults**: Daily rotation, no preferences, high capacity
- **Clerkships**: All inherit, extensive fallback chains
- **Setup Time**: 20 minutes (defaults + fallback setup)

## Success Metrics

### Technical Success
- [ ] All 8 configuration areas implemented
- [ ] Global defaults system fully functional
- [ ] All 3 override modes working correctly
- [ ] Configuration resolution tested and performant
- [ ] All unit tests pass (>90% coverage)
- [ ] All integration tests pass
- [ ] Performance < 1 minute for 500 students
- [ ] No data integrity issues

### Functional Success
- [ ] All 4 school scenarios work end-to-end with global defaults
- [ ] Admin can set global defaults via UI
- [ ] Admin can override per-clerkship via UI
- [ ] System handles override mode switching
- [ ] Validation catches all configuration errors
- [ ] Change management works (apply to existing vs new)
- [ ] UI provides intuitive configuration experience

### Business Success
- [ ] System supports any medical school's rules
- [ ] Configuration changes don't require deployments
- [ ] Global defaults reduce setup time by 90%
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

## Getting Started

1. **Review Enhanced Design**: Read `ENHANCED-DESIGN-SUMMARY.md`
2. **Understand Global Defaults**: See how 3-level hierarchy works
3. **Review Updated Schema**: Read `01-database-schema.md`
4. **Review Types**: Read `02-configuration-types.md`
5. **Start Implementation**: Begin with Step 01 (Database Schema)
6. **Use Update Guide**: Reference `STEPS-03-10-UPDATE-GUIDE.md` for Steps 03-10

## Questions Before Starting?

Before implementing, ensure:
- [ ] Enhanced design understood (global defaults + overrides)
- [ ] All clarifying questions answered
- [ ] Approach approved
- [ ] Timeline acceptable
- [ ] Resource allocation confirmed
- [ ] Priorities clear

## Key Metrics

| Metric | Previous Design | Enhanced Design |
|--------|----------------|-----------------|
| **New Tables** | 9 | 13 (+3 global defaults, +1 overrides) |
| **Configuration Levels** | 1 | 3 (global → clerkship → resolved) |
| **Setup Time** | ~2 hours per school | ~5-20 minutes |
| **Policy Changes** | Edit each clerkship | Update defaults once |
| **Flexibility** | High | Very High |
| **API Endpoints** | 30+ | 46+ |
| **Services** | 7 | 9 |
| **Test Suites** | 10 | 14 |

---

**Last Updated**: 2025-11-19
**Status**: Enhanced Design Complete, Ready for Implementation
**Estimated Duration**: 13-25 days (depends on complexity and testing rigor)
**Major Enhancement**: Global defaults + per-requirement-type configuration
