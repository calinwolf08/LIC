# Step 09: Sample School Configurations

## Objective

Create complete, working configurations for 4 different medical school types (Schools A, B, C, D) that demonstrate the flexibility and capability of the configurable scheduling system. These configurations serve as validation, documentation, and templates for real schools.

## Scope

### Schools to Configure

1. **School A** - Traditional, conservative approach
2. **School B** - Collaborative, team-based approach
3. **School C** - Hybrid, flexible approach
4. **School D** - Modern, maximally flexible approach

Each school will have complete configurations across all areas:
- Assignment strategies
- Requirement structures
- Team configurations
- Fallback chains
- Capacity rules
- Health systems
- Sample clerkships

## School A: Traditional Conservative

### Philosophy
- One preceptor per clerkship for entire year
- Emphasis on continuity and relationship-building
- Strict health system consistency
- Conservative capacity limits

### Configuration Specifications

**General Settings**
- Assignment Strategy: Continuous - Single Preceptor
- Health System Continuity: Enforce same system (required)
- Team Formation: Not used
- Fallback System: Minimal (only for emergencies)

**Sample Clerkship: Family Medicine (60 days)**
- Total Required Days: 60
- Requirement Structure: No split, single requirement
- Assignment Mode: Continuous Single
- Block Size: N/A
- Health System Rule: Enforce same system
- Teams Allowed: No
- Fallback Configured: Yes (1-2 emergency fallbacks with approval required)

**Sample Clerkship: Surgery (45 days)**
- Total Required Days: 45
- Requirement Structure: No split
- Assignment Mode: Continuous Single
- Health System Rule: Enforce same system
- Teams Allowed: No

**Sample Clerkship: Internal Medicine (60 days)**
- Total Required Days: 60
- Requirement Structure: No split
- Assignment Mode: Continuous Single
- Health System Rule: Enforce same system

**Capacity Rules**
- Conservative: Max 1 student per preceptor per day
- Max 3 students per preceptor per year
- No concurrent students

**Health Systems**
- 2 health systems configured
- All preceptors assigned to systems
- No cross-system assignments allowed

### Data to Create

**Health Systems**
- University Hospital System
- Community Health Network

**Preceptors** (minimum for testing)
- 5 Family Medicine preceptors (3 in UHS, 2 in CHN)
- 4 Surgery preceptors (2 in each system)
- 5 Internal Medicine preceptors (3 in UHS, 2 in CHN)
- Each with conservative capacity rules

**Students** (for testing)
- 6 students needing all clerkships

**Expected Outcome**
- System successfully assigns each student to one preceptor per clerkship
- All students in same health system throughout year
- No team assignments
- Fallbacks only used if primary unavailable

## School B: Collaborative Team-Based

### Philosophy
- Students rotate through 3-4 preceptors per clerkship
- Emphasis on diverse experiences
- Team-based learning
- Cross-exposure within health system

### Configuration Specifications

**General Settings**
- Assignment Strategy: Continuous - Team (3-4 preceptors)
- Health System Continuity: Prefer same system (soft)
- Team Formation: Pre-configured teams
- Fallback System: Team substitution

**Sample Clerkship: Family Medicine (60 days)**
- Total Required Days: 60
- Requirement Structure: No split
- Assignment Mode: Continuous Team
- Team Size: 3-4 preceptors
- Team Formation Rules:
  - Require same health system: Yes
  - Require same specialty: Yes
  - Team size: 3-4
- Distribution: Balanced (each team member gets ~15-20 days)

**Sample Clerkship: Surgery (45 days)**
- Total Required Days: 45
- Requirement Structure: No split
- Assignment Mode: Continuous Team
- Team Size: 3-4 preceptors
- Distribution: Balanced

**Sample Clerkship: Pediatrics (40 days)**
- Total Required Days: 40
- Requirement Structure: No split
- Assignment Mode: Continuous Team
- Team Size: 3 preceptors
- Distribution: Balanced

**Capacity Rules**
- Moderate: Max 2 students per preceptor per day
- Max 6 students per preceptor per year (higher due to shared load)
- Teams share capacity

**Teams**
- Pre-configured teams for each clerkship
- Each team has 3-4 members from same health system
- Team members have coordinated schedules

### Data to Create

**Health Systems**
- Metro Medical Center
- Regional Healthcare Alliance

**Teams**
- Family Medicine Team A (3 preceptors in MMC)
- Family Medicine Team B (4 preceptors in RHA)
- Surgery Team A (3 preceptors in MMC)
- Surgery Team B (3 preceptors in RHA)
- Pediatrics Team A (3 preceptors in MMC)
- Pediatrics Team B (3 preceptors in RHA)

**Preceptors** (minimum for testing)
- 7 Family Medicine preceptors (teams of 3 and 4)
- 6 Surgery preceptors (teams of 3 each)
- 6 Pediatrics preceptors (teams of 3 each)
- Each with moderate capacity rules

**Students** (for testing)
- 8 students needing all clerkships

**Expected Outcome**
- Each student assigned to a team for each clerkship
- Days balanced across team members
- Students experience 3-4 different preceptors per clerkship
- All team members within same health system

## School C: Hybrid Flexible

### Philosophy
- Different approaches for different settings
- Inpatient uses block scheduling (2-week rotations)
- Outpatient uses continuous single preceptor
- Electives for special interests
- Maximum customization per clerkship type

### Configuration Specifications

**General Settings**
- Assignment Strategy: Hybrid (varies by requirement type)
- Health System Continuity: Prefer same system
- Block Size: 14 days (for inpatient)
- Electives: Supported

**Sample Clerkship: Internal Medicine (70 days)**
- Total Required Days: 70
- Requirement Structure: Split
  - Outpatient: 30 days (Continuous Single)
  - Inpatient: 30 days (Block-based, 14-day blocks)
  - Elective: 10 days (Daily Rotation)
- Health System Rule: Prefer same system (allow exceptions for electives)
- Block Configuration:
  - Block size: 14 days
  - Allow partial blocks: Yes
  - Prefer continuous blocks: Yes (same preceptor for multiple blocks)

**Sample Clerkship: Surgery (60 days)**
- Total Required Days: 60
- Requirement Structure: Split
  - Outpatient: 20 days (Continuous Single)
  - Inpatient: 35 days (Block-based, 14-day blocks)
  - Elective: 5 days (Daily Rotation)

**Sample Clerkship: Pediatrics (50 days)**
- Total Required Days: 50
- Requirement Structure: Split
  - Outpatient: 30 days (Continuous Single)
  - Inpatient: 20 days (Block-based, 14-day blocks)
  - No electives

**Elective Options** (for Internal Medicine)
- Sexual Assault Clinic (min 3 days)
- Bupe Clinic (min 2 days)
- Geriatrics (min 2 days)
- Remaining days distributed as needed

**Capacity Rules**
- Outpatient: Max 1-2 students per day
- Inpatient: Max 1 student per block
- Max 4 blocks per preceptor per year
- Electives: More flexible capacity

### Data to Create

**Health Systems**
- Academic Medical Center
- Community Practice Network
- Specialty Clinics Network (for electives)

**Preceptors** (minimum for testing)
- Internal Medicine:
  - 4 outpatient preceptors
  - 3 inpatient preceptors
  - 3 elective preceptors (specialized)
- Surgery:
  - 3 outpatient preceptors
  - 4 inpatient preceptors
- Pediatrics:
  - 4 outpatient preceptors
  - 3 inpatient preceptors
- Each with appropriate capacity rules based on setting

**Students** (for testing)
- 5 students needing all clerkships

**Expected Outcome**
- Each student assigned to:
  - One continuous preceptor for outpatient
  - Block-based assignments for inpatient (rotating every 2 weeks)
  - Various preceptors for electives (1-3 different ones)
- Health system consistency preferred but not enforced for electives
- Proper block boundaries (no partial blocks unless necessary)

## School D: Modern Maximally Flexible

### Philosophy
- Day-by-day assignment flexibility
- No requirements for continuity
- Optimize for preceptor availability
- Cross-system assignments allowed
- Dynamic adaptation

### Configuration Specifications

**General Settings**
- Assignment Strategy: Daily Rotation
- Health System Continuity: No preference
- Team Formation: Dynamic (formed as needed)
- Fallback System: Extensive

**Sample Clerkship: Family Medicine (50 days)**
- Total Required Days: 50
- Requirement Structure: No split
- Assignment Mode: Daily Rotation
- Health System Rule: No preference
- Minimize consecutive days with same preceptor: No (allow repetition)
- Load balancing: Yes (distribute across available preceptors)

**Sample Clerkship: Emergency Medicine (30 days)**
- Total Required Days: 30
- Requirement Structure: No split
- Assignment Mode: Daily Rotation
- Health System Rule: No preference

**Sample Clerkship: Psychiatry (40 days)**
- Total Required Days: 40
- Requirement Structure: No split
- Assignment Mode: Daily Rotation
- Health System Rule: No preference

**Capacity Rules**
- Liberal: Max 2-3 students per preceptor per day
- Max 10 students per preceptor per year
- High capacity to support flexibility

**Fallback Configuration**
- Extensive fallback chains (3-4 deep)
- Auto-assignment (no approval required)
- Health system override allowed
- Dynamic fallback selection

### Data to Create

**Health Systems**
- City Hospital Network
- Suburban Medical Group
- Rural Health Partnership

**Preceptors** (minimum for testing)
- 6 Family Medicine preceptors (across all systems)
- 4 Emergency Medicine preceptors (across all systems)
- 5 Psychiatry preceptors (across all systems)
- Each with liberal capacity rules
- Each with 2-3 fallbacks configured

**Fallback Chains**
- Every preceptor has 2-3 fallbacks
- Cross-system fallbacks allowed
- Auto-assignment enabled

**Students** (for testing)
- 10 students needing all clerkships

**Expected Outcome**
- Each student assigned day-by-day
- Students may see different preceptor each day
- Assignments span multiple health systems
- High utilization of all preceptors (load balanced)
- Fallbacks automatically used when needed

## Implementation Tasks

### 1. Create Seed Data Scripts

**Script Structure**
- Separate script per school
- Idempotent (can run multiple times)
- Clean database first (optional flag)
- Create in dependency order (health systems → preceptors → teams → configs)

**Script Content**
- Health system creation
- Site creation
- Preceptor creation with health system assignment
- Team creation (for School B)
- Fallback chain creation (for School D)
- Capacity rule creation
- Clerkship configuration creation
- Requirement creation
- Elective creation (for School C)
- Student creation

### 2. Create Validation Scripts

**Validation Checks**
- All configurations are complete
- All configurations pass validation rules
- Sample scheduling runs successfully
- All students get assigned
- No constraint violations

### 3. Create Documentation

**Configuration Guides**
- Document each school's philosophy
- Explain configuration choices
- Provide step-by-step recreation guide
- Include screenshots (optional)
- Create comparison matrix

**Comparison Matrix**
- Table comparing all 4 schools across all dimensions
- Highlight differences
- Show use cases for each approach

### 4. Create Demo/Testing Helpers

**Demo Mode**
- Quick setup script for demos
- Reset script to clean state
- Sample data visualization

## Testing Requirements

### Integration Tests

1. **School A Integration Test**
   - Load School A configuration
   - Create students
   - Run scheduling engine
   - Verify:
     - All students assigned to single preceptor per clerkship
     - All assignments within same health system per student
     - No team assignments
     - All requirements met

2. **School B Integration Test**
   - Load School B configuration
   - Create students
   - Run scheduling engine
   - Verify:
     - All students assigned to teams
     - Days balanced across team members
     - All team members in same health system
     - All requirements met

3. **School C Integration Test**
   - Load School C configuration
   - Create students
   - Run scheduling engine
   - Verify:
     - Outpatient uses single preceptor
     - Inpatient uses 14-day blocks
     - Electives use daily rotation
     - All requirements met
     - Block boundaries respected

4. **School D Integration Test**
   - Load School D configuration
   - Create students
   - Run scheduling engine
   - Verify:
     - Day-by-day assignment works
     - Load balanced across preceptors
     - Cross-system assignments occur
     - Fallbacks used when appropriate
     - All requirements met

5. **Cross-School Comparison Test**
   - Run all 4 schools with same student count
   - Compare results:
     - Preceptor utilization rates
     - Health system distribution
     - Assignment patterns
     - Success rates
   - Document differences

## Acceptance Criteria

- [ ] All 4 school configurations implemented
- [ ] Seed data scripts created for each school
- [ ] All configurations pass validation
- [ ] Integration tests pass for all schools
- [ ] Scheduling engine successfully schedules all students for all schools
- [ ] Documentation created explaining each school
- [ ] Comparison matrix created
- [ ] Demo mode implemented for quick testing
- [ ] Configurations can be loaded via API
- [ ] Configurations can be loaded via UI
- [ ] All configurations demonstrate key features of system

## Files to Create

### Seed Scripts
```
src/lib/testing/seeds/school-a-config.ts
src/lib/testing/seeds/school-b-config.ts
src/lib/testing/seeds/school-c-config.ts
src/lib/testing/seeds/school-d-config.ts
src/lib/testing/seeds/index.ts
```

### Test Files
```
src/lib/testing/integration/school-a.integration.test.ts
src/lib/testing/integration/school-b.integration.test.ts
src/lib/testing/integration/school-c.integration.test.ts
src/lib/testing/integration/school-d.integration.test.ts
src/lib/testing/integration/cross-school-comparison.test.ts
```

### Documentation
```
docs/sample-schools/README.md
docs/sample-schools/school-a-traditional.md
docs/sample-schools/school-b-team-based.md
docs/sample-schools/school-c-hybrid.md
docs/sample-schools/school-d-flexible.md
docs/sample-schools/comparison-matrix.md
```

### Helper Scripts
```
scripts/seed-school.ts (CLI to load any school)
scripts/demo-mode.ts (quick demo setup)
scripts/validate-configs.ts (validate all school configs)
```

## Notes

- Make seed scripts deterministic (same data every run)
- Use realistic names for preceptors and students
- Include enough data to test edge cases
- Consider parameterizing seed scripts (vary student count)
- Document any assumptions or limitations
- Provide clear instructions for running seed scripts
- Consider adding UI export/import for configurations
- These configurations serve as regression tests
- Keep configurations up-to-date as system evolves
- Use these as templates for real school onboarding
