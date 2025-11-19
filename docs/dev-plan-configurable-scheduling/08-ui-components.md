# Step 08: UI Components for Configuration Management

## Objective

Build the administrative user interface that allows school administrators to configure all 8 areas of the scheduling system. The UI should be intuitive, provide real-time validation feedback, and guide admins through the configuration process without requiring technical knowledge.

## Scope

### UI Pages/Screens to Build

1. **Clerkship Configuration Dashboard** - Overview and entry point
2. **Basic Configuration Form** - Assignment strategy, health system rules, block settings
3. **Requirement Management** - Split requirements (inpatient/outpatient/elective)
4. **Elective Management** - Define and configure elective options
5. **Team Management** - Create and manage preceptor teams
6. **Fallback Management** - Configure fallback chains
7. **Capacity Rules Management** - Set capacity constraints
8. **Health System Management** - Manage health systems and sites
9. **Configuration Wizard** - Guided setup for new clerkships
10. **Validation & Preview** - Validate configuration before saving

Note: Per requirements, NO automated tests for UI components. Testing will be manual.

## UI Architecture

### Technology Stack
- SvelteKit 5 (with Svelte 5 runes)
- Existing UI component library (shadcn-svelte if available, or custom components)
- Form handling with Zod validation
- TailwindCSS for styling
- Existing patterns from codebase

### Design Principles
- Progressive disclosure (show advanced options only when needed)
- Inline validation with helpful error messages
- Contextual help text explaining each option
- Consistent layout and navigation
- Mobile-responsive (desktop-first)
- Accessible (WCAG 2.1 AA)

## Page Specifications

### 1. Clerkship Configuration Dashboard

**Purpose**: Entry point for managing clerkship configurations

**Layout**:
- Left sidebar: List of all clerkships
- Main content: Selected clerkship overview
- Top actions: New configuration, validate all, export/import

**Features**:
- View all clerkships with configuration status
- Filter by specialty, configured/unconfigured
- Quick status indicators (complete, incomplete, has errors)
- Search/filter clerkships
- Click clerkship to edit configuration

**Information Display**:
- Clerkship name, specialty, total required days
- Configuration summary (strategy, requirements, teams enabled, etc.)
- Validation status (green check if valid, red X if errors)
- Last modified date and user

**Actions**:
- "Configure" button for unconfigured clerkships
- "Edit" button for configured clerkships
- "Clone" button to copy configuration
- "Validate" button to check configuration
- "Delete" button with confirmation

### 2. Basic Configuration Form

**Purpose**: Configure core clerkship settings

**Sections**:

**Assignment Strategy Section**
- Dropdown to select strategy:
  - Continuous - Single Preceptor
  - Continuous - Team (2-3 preceptors)
  - Block-based
  - Daily Rotation
  - Hybrid (show sub-form)
- Help text explaining each strategy
- Visual examples (diagrams/illustrations optional)

**Block Settings Section** (only shown if Block-based selected)
- Input: Block size in days
- Checkbox: Allow partial blocks
- Checkbox: Prefer continuous blocks (same preceptor)
- Help text explaining block scheduling

**Health System Continuity Section**
- Radio buttons:
  - Enforce same system (required)
  - Prefer same system (soft preference)
  - No preference
- Help text explaining each option
- Warning if "No preference" selected (explain implications)

**Hybrid Configuration** (only shown if Hybrid selected)
- Shows requirement split form inline
- Allows setting different strategy per requirement type
- Preview of final configuration

**Form Actions**:
- Save button (validates and saves)
- Cancel button (discards changes with confirmation)
- Save & Continue button (saves and moves to next section)

**Validation**:
- Real-time validation as user types
- Highlight invalid fields in red
- Show error messages below fields
- Disable save button if form invalid
- Summary of all errors at top of form

### 3. Requirement Management

**Purpose**: Define how clerkship days are split

**Layout**:
- Header showing total required days (from clerkship)
- List of requirement splits
- Add requirement button
- Progress bar showing days allocated vs total

**Requirement List**:
Each requirement shows:
- Type (Outpatient/Inpatient/Elective)
- Required days (editable inline)
- Assignment mode for this requirement type
- Delete button

**Add Requirement Form**:
- Dropdown: Requirement type
- Input: Required days
- Dropdown: Assignment mode (based on parent strategy)
- Add button

**Validation**:
- Total days must equal clerkship.required_days
- Show remaining days to allocate
- Warning if over-allocated
- Error if under-allocated
- Cannot have duplicate requirement types

**Smart Defaults**:
- Suggest even split if adding first requirement
- Suggest remaining days when adding subsequent requirements
- Pre-select assignment mode based on parent strategy

### 4. Elective Management

**Purpose**: Configure elective options (only if elective requirement exists)

**Visibility**: Only shown if clerkship has elective requirement

**Layout**:
- Header showing total elective days available
- List of elective options
- Add elective button

**Elective List**:
Each elective shows:
- Name
- Minimum days required
- Available preceptors (multi-select)
- Specialty requirement
- Edit/Delete buttons

**Add/Edit Elective Form**:
- Input: Elective name
- Input: Minimum days (validated against total elective days)
- Multi-select: Available preceptors (filtered by specialty)
- Input: Specialty (if different from clerkship specialty)
- Save/Cancel buttons

**Validation**:
- Sum of minimum days cannot exceed total elective days
- At least one preceptor must be selected
- Selected preceptors must have matching specialty

### 5. Team Management

**Purpose**: Create and manage preceptor teams

**Layout**:
- Header with team overview
- List of existing teams
- Add team button

**Team List**:
Each team shows:
- Team name
- Members (with avatars/names)
- Formation rules (badges: "Same Health System", "Same Specialty", etc.)
- Validation status
- Edit/Delete buttons

**Add/Edit Team Form**:
- Input: Team name (optional, auto-generated if empty)
- Multi-select: Team members (2-3 preceptors)
- Checkboxes for formation rules:
  - Require same health system
  - Require same site
  - Require same specialty
  - Requires admin approval for use
- Min/Max team size inputs
- Live validation feedback
- Preview of team composition

**Validation**:
- Real-time check of formation rules
- Show violations immediately (e.g., "Members have different health systems")
- Highlight conflicting members
- Suggest fixes (e.g., "Remove Dr. Smith or change health system rule")

**Features**:
- Filter preceptor list by specialty, health system, site
- Show preceptor details on hover
- Drag-and-drop to add members (optional enhancement)

### 6. Fallback Management

**Purpose**: Configure fallback chains for preceptors

**Layout**:
- Grouped by primary preceptor
- Each primary shows fallback chain
- Add fallback button

**Primary Preceptor List**:
Each primary shows:
- Primary preceptor name
- Fallback chain (ordered list)
- Edit chain button

**Fallback Chain Editor**:
- Primary preceptor (read-only)
- Clerkship filter (which clerkship this chain applies to)
- Ordered list of fallbacks:
  - Fallback preceptor (dropdown)
  - Priority (auto-numbered, drag to reorder)
  - Settings:
    - Checkbox: Requires approval
    - Checkbox: Allow different health system
  - Remove button
- Add fallback button
- Save/Cancel buttons

**Validation**:
- Real-time circular reference detection
- Show error if adding fallback creates cycle
- Validate specialty compatibility
- Validate health system compatibility (if override not allowed)
- Show availability comparison (is fallback available when primary typically works?)

**Features**:
- Drag-and-drop to reorder fallbacks
- Visual indicator of fallback availability
- "Test fallback chain" button (simulates resolution)
- Bulk import fallbacks (CSV upload optional)

### 7. Capacity Rules Management

**Purpose**: Set capacity constraints for preceptors

**Layout**:
- Grouped by preceptor
- General rules vs clerkship-specific rules
- Add rule button

**Preceptor List**:
Each preceptor shows:
- Name and specialty
- General capacity rules (applies to all clerkships)
- Clerkship-specific overrides (list)
- Edit buttons

**Capacity Rule Form**:
- Preceptor selection (read-only when editing)
- Clerkship filter (optional, null for general rule)
- Inputs:
  - Max students per day
  - Max students per year
  - Max students per block (only for block-based clerkships)
  - Max blocks per year (only for block-based clerkships)
- Help text explaining each limit
- Save/Cancel buttons

**Validation**:
- All limits must be non-negative
- Max per day must be > 0
- Warning if reducing capacity below current assignments
- Cannot save if conflict with existing assignments

**Features**:
- Show current usage (e.g., "Currently 2/5 students assigned today")
- Preview impact of changes
- Bulk edit (apply same rule to multiple preceptors)

### 8. Health System Management

**Purpose**: Manage health systems and sites

**Layout**:
- Two-panel view:
  - Left: Health systems list
  - Right: Sites within selected system
- Add health system button
- Add site button (when system selected)

**Health System List**:
Each system shows:
- Name
- Number of sites
- Number of preceptors assigned
- Edit/Delete buttons

**Add/Edit Health System Form**:
- Input: System name
- Input: Location
- Textarea: Description (optional)
- Save/Cancel buttons

**Site List** (for selected health system):
Each site shows:
- Name
- Address
- Number of preceptors
- Edit/Delete buttons

**Add/Edit Site Form**:
- Input: Site name
- Input: Address
- Health system (read-only, pre-selected)
- Save/Cancel buttons

**Validation**:
- Cannot delete system if preceptors assigned
- Cannot delete site if preceptors assigned
- Show warning and count of affected preceptors

### 9. Configuration Wizard (Guided Setup)

**Purpose**: Step-by-step guided setup for new clerkships

**Workflow**:
1. Welcome & Overview
2. Basic Configuration (strategy, health system rules)
3. Requirements Setup (split days)
4. Electives (if applicable)
5. Advanced Options (teams, fallbacks, capacity)
6. Review & Validate
7. Confirmation

**Features**:
- Progress indicator (Step 2 of 7)
- Next/Previous buttons
- Save draft (exit and resume later)
- Skip optional steps
- Summary at end showing all configurations
- "Finish" commits everything

**Benefits**:
- Easier for new admins
- Ensures all required configurations complete
- Provides context and examples
- Reduces configuration errors

### 10. Validation & Preview

**Purpose**: Validate complete configuration and preview impact

**Validation Panel**:
- Run validation on entire configuration
- Show errors grouped by category:
  - Missing configurations
  - Invalid settings
  - Conflicts
  - Warnings
- Each error shows:
  - Description
  - Affected entity
  - Suggested fix
  - Link to edit relevant section

**Preview Panel**:
- Show how scheduling will behave with this configuration
- Mock schedule generation for sample students
- Show example assignments
- Highlight configuration effects

**Actions**:
- Fix errors button (links to relevant forms)
- Export configuration (JSON)
- Import configuration (JSON upload)
- Mark as complete (locks configuration until unlocked)

## Navigation and Layout

### Main Navigation
- Dashboard (home)
- Clerkships (list with configuration status)
- Health Systems
- Global Settings (future)

### Clerkship Configuration Tabs
When editing a clerkship:
- Overview (summary)
- Basic Settings
- Requirements
- Electives (if applicable)
- Teams (if configured)
- Fallbacks
- Capacity Rules
- Validation

### Breadcrumbs
Show current location:
- Dashboard > Clerkships > Surgery > Basic Settings

## Implementation Tasks

### 1. Create Page Components
- Dashboard page component
- Configuration form components
- Wizard components
- Validation panel component

### 2. Create Reusable Form Components
- Strategy selector component
- Requirement editor component
- Elective editor component
- Team builder component
- Fallback chain editor component
- Capacity rule form component

### 3. Create Data Components
- List components (clerkships, teams, fallbacks, etc.)
- Card components for displaying summaries
- Status indicators
- Validation message components

### 4. Implement Form Handling
- Form state management (Svelte 5 runes)
- Zod schema integration for validation
- API integration for CRUD operations
- Optimistic UI updates
- Error handling and display

### 5. Implement Navigation
- Route structure
- Tab navigation
- Wizard navigation
- Breadcrumb component

### 6. Styling and Polish
- Consistent styling with TailwindCSS
- Responsive design
- Loading states
- Empty states
- Success/error toasts

## Acceptance Criteria

- [ ] All 10 UI screens implemented
- [ ] All forms integrate with API from Step 07
- [ ] Real-time validation using Zod schemas
- [ ] Intuitive navigation between configuration sections
- [ ] Help text and examples throughout
- [ ] Error messages are clear and actionable
- [ ] Configuration wizard guides users through setup
- [ ] Validation panel identifies all configuration issues
- [ ] UI is responsive (works on desktop and tablet)
- [ ] UI follows existing design patterns in codebase
- [ ] All 4 school scenarios can be configured via UI
- [ ] Manual testing confirms all features work correctly
- [ ] No automated UI tests (per requirements)

## Files to Create

### Page Components
```
src/routes/config/+page.svelte (dashboard)
src/routes/config/+layout.svelte (navigation)
src/routes/config/clerkships/+page.svelte (clerkship list)
src/routes/config/clerkships/[id]/+page.svelte (clerkship overview)
src/routes/config/clerkships/[id]/basic/+page.svelte
src/routes/config/clerkships/[id]/requirements/+page.svelte
src/routes/config/clerkships/[id]/electives/+page.svelte
src/routes/config/clerkships/[id]/teams/+page.svelte
src/routes/config/clerkships/[id]/fallbacks/+page.svelte
src/routes/config/clerkships/[id]/capacity/+page.svelte
src/routes/config/clerkships/[id]/validate/+page.svelte
src/routes/config/wizard/+page.svelte (wizard entry)
src/routes/config/wizard/[step]/+page.svelte (wizard steps)
src/routes/config/health-systems/+page.svelte
```

### Reusable Components
```
src/lib/features/scheduling-config/components/StrategySelector.svelte
src/lib/features/scheduling-config/components/RequirementEditor.svelte
src/lib/features/scheduling-config/components/ElectiveEditor.svelte
src/lib/features/scheduling-config/components/TeamBuilder.svelte
src/lib/features/scheduling-config/components/FallbackChainEditor.svelte
src/lib/features/scheduling-config/components/CapacityRuleForm.svelte
src/lib/features/scheduling-config/components/ValidationPanel.svelte
src/lib/features/scheduling-config/components/ConfigurationSummary.svelte
src/lib/features/scheduling-config/components/HealthSystemSelector.svelte
```

### Supporting Components
```
src/lib/features/scheduling-config/components/ConfigurationCard.svelte
src/lib/features/scheduling-config/components/StatusBadge.svelte
src/lib/features/scheduling-config/components/ProgressBar.svelte
src/lib/features/scheduling-config/components/HelpText.svelte
src/lib/features/scheduling-config/components/ErrorMessage.svelte
```

### Page Load Functions
```
src/routes/config/clerkships/[id]/+page.ts
src/routes/config/clerkships/[id]/+page.server.ts
src/routes/config/health-systems/+page.ts
```

## Manual Testing Checklist

Since no automated UI tests, create comprehensive manual test plan:

### Configuration Creation Tests
- [ ] Create School A configuration through UI
- [ ] Create School B configuration through UI
- [ ] Create School C configuration through UI
- [ ] Create School D configuration through UI

### Validation Tests
- [ ] Invalid configurations show errors
- [ ] Validation panel catches all error types
- [ ] Error messages are helpful
- [ ] Fixes clear errors

### Workflow Tests
- [ ] Complete wizard for new clerkship
- [ ] Edit existing configuration
- [ ] Clone configuration
- [ ] Delete configuration
- [ ] Create team and use in configuration
- [ ] Create fallback chain
- [ ] Set capacity rules

### Edge Case Tests
- [ ] Handle network errors gracefully
- [ ] Handle concurrent edits
- [ ] Handle missing data
- [ ] Handle browser back button
- [ ] Handle form abandonment

## Notes

- Follow existing UI patterns in codebase
- Reuse existing components where possible
- Maintain consistent styling with rest of application
- Consider accessibility from the start
- Provide contextual help throughout
- Use progressive disclosure to avoid overwhelming users
- Consider adding tooltips for advanced options
- Add confirmation dialogs for destructive actions
- Implement optimistic updates for better UX
- Show loading states during API calls
- Cache configuration data for performance
- Consider adding keyboard shortcuts for power users
- Document all UI components for future maintainers
