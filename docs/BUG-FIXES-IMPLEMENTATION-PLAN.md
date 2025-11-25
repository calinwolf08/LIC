# Bug Fixes Implementation Plan

**Status:** Ready for Implementation
**Date:** 2025-11-25
**Priority:** High

---

## Overview

This document outlines the implementation plan for fixing 6 critical bugs found during user testing. Each bug includes detailed steps, validation criteria, and test requirements.

---

## Bug 1: Preceptors - Unable to Add Preceptor

### Problem
- Cannot create preceptor because `health_system_id` is required but not in form
- No way to select or create Health System from form
- No way to select or create Site from form
- No feedback when creation fails
- Cannot associate preceptors with clerkships at creation
- Preceptors should be creatable with no associations

### Solution Steps

#### 1. Database Migration (014_add_contact_fields.ts)
```typescript
// Add phone to preceptors
await db.schema
  .alterTable('preceptors')
  .addColumn('phone', 'text')
  .execute();

// Add contact fields to sites
await db.schema
  .alterTable('sites')
  .addColumn('address', 'text')
  .addColumn('office_phone', 'text')
  .addColumn('contact_person', 'text')
  .addColumn('contact_email', 'text')
  .execute();
```

#### 2. Create Health System Components
- **Location:** `src/lib/features/health-systems/`
  - `components/health-system-form.svelte` - Reusable form for creating health systems
  - `components/health-system-list.svelte` - List view with edit/delete
  - `schemas.ts` - Validation schemas
  - `services/health-system.service.ts` - CRUD operations

#### 3. Create Site Components
- **Location:** `src/lib/features/sites/`
  - `components/site-form.svelte` - Form with all contact fields
  - `components/site-list.svelte` - List view
  - `schemas.ts` - Validation with contact field validation
  - `services/site.service.ts` - CRUD operations

**Site Form Fields:**
- Name (required)
- Health System (dropdown, optional)
- Address (optional, textarea)
- Office Phone (optional)
- Contact Person (optional)
- Contact Email (optional)

#### 4. Update Preceptor Schema
```typescript
// src/lib/features/preceptors/schemas.ts
export const createPreceptorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,                    // NEW: Optional
  specialty: specialtySchema,
  health_system_id: cuid2Schema.optional(), // CHANGED: Now optional
  site_id: cuid2Schema.optional(),       // NEW: Optional
  clerkship_ids: z.array(cuid2Schema).optional(), // NEW: Optional array
  max_students: positiveIntSchema.default(1)
});
```

#### 5. Update Preceptor Form UI
**Location:** `src/lib/features/preceptors/components/preceptor-form.svelte`

**New Fields:**
1. **Phone** (optional text input)
2. **Health System** (dropdown with data from API)
   - "+ Create New Health System" button → Opens nested modal (Option A)
   - When new health system created, refresh dropdown and auto-select it
   - Preserve all form data when modal opens/closes
3. **Site** (dropdown filtered by selected health_system_id)
   - "+ Create New Site" button → Opens nested modal
   - Pre-populate health_system_id in site form
   - When new site created, refresh dropdown and auto-select it
4. **Clerkships** (multi-select checkboxes or dropdown)
   - Optional, can be empty
   - Shows all available clerkships

**Error Handling:**
- Show validation errors inline for each field
- Show general error message at top if API fails
- Display specific error message explaining what went wrong

#### 6. Update Preceptor Service
**Location:** `src/lib/features/preceptors/services/preceptor.service.ts`

```typescript
export async function createPreceptor(db: Kysely<DB>, data: CreatePreceptorInput) {
  // 1. Create preceptor record
  const preceptor = await db.insertInto('preceptors').values({
    id: crypto.randomUUID(),
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    specialty: data.specialty,
    health_system_id: data.health_system_id || null,
    site_id: data.site_id || null,
    max_students: data.max_students,
    created_at: timestamp,
    updated_at: timestamp
  }).returningAll().executeTakeFirstOrThrow();

  // 2. Create clerkship associations if provided
  if (data.clerkship_ids && data.clerkship_ids.length > 0) {
    await db.insertInto('preceptor_clerkships')
      .values(data.clerkship_ids.map(clerkshipId => ({
        preceptor_id: preceptor.id,
        clerkship_id: clerkshipId,
        created_at: timestamp
      })))
      .execute();
  }

  return preceptor;
}
```

#### 7. Create Preceptor Detail Page
**Location:** `src/routes/(app)/preceptors/[id]/+page.svelte`

**Sections:**
1. Basic Info (name, email, phone, specialty, health system, site, max students)
2. Clerkship Associations
   - List of assigned clerkships
   - "+ Add Clerkship" button
   - Remove association button for each
3. Availability (link to existing availability builder)
4. Edit/Delete buttons

#### 8. E2E Tests
**Location:** `e2e/api/preceptors.api.test.ts`

```typescript
test('should create preceptor with all optional fields', async () => {
  // Create health system and site first
  const hs = await api.post('/api/health-systems', {...});
  const healthSystem = await api.expectData(hs, 201);

  const s = await api.post('/api/sites', {...});
  const site = await api.expectData(s, 201);

  const c = await api.post('/api/clerkships', {...});
  const clerkship = await api.expectData(c, 201);

  // Create preceptor with all fields
  const response = await api.post('/api/preceptors', {
    name: 'Dr. Test',
    email: 'test@example.com',
    phone: '+1 (555) 123-4567',
    specialty: 'Internal Medicine',
    health_system_id: healthSystem.id,
    site_id: site.id,
    clerkship_ids: [clerkship.id],
    max_students: 2
  });

  const preceptor = await api.expectData(response, 201);
  expect(preceptor.phone).toBe('+1 (555) 123-4567');
  expect(preceptor.health_system_id).toBe(healthSystem.id);
  expect(preceptor.site_id).toBe(site.id);

  // Verify clerkship association created
  const assocResponse = await api.get(`/api/preceptors/${preceptor.id}/clerkships`);
  const clerkships = await api.expectData(assocResponse, 200);
  expect(clerkships).toHaveLength(1);
  expect(clerkships[0].id).toBe(clerkship.id);
});

test('should create preceptor with no associations', async () => {
  const response = await api.post('/api/preceptors', {
    name: 'Dr. Test',
    email: 'test@example.com',
    specialty: 'Internal Medicine',
    max_students: 1
  });

  const preceptor = await api.expectData(response, 201);
  expect(preceptor.health_system_id).toBeNull();
  expect(preceptor.site_id).toBeNull();
});

test('should show validation error when form submitted without required fields', async () => {
  const response = await api.post('/api/preceptors', {
    email: 'test@example.com'
  });

  await api.expectValidationError(response, 400);
});
```

### Validation Criteria
- ✅ Can create preceptor with only name, email, specialty
- ✅ Can create preceptor with all optional fields
- ✅ Can create health system from preceptor form without losing data
- ✅ Can create site from preceptor form without losing data
- ✅ Health system dropdown updates after creation
- ✅ Site dropdown filters by selected health system
- ✅ Can select multiple clerkships
- ✅ Error messages display when validation fails
- ✅ E2E tests pass

---

## Bug 2: Clerkships - Specialty Field Required Despite Optional Label

### Problem
Specialty field shows "(optional)" label but validation fails if empty string is provided.

### Solution Steps

#### 1. Update Clerkship Schema
**Location:** `src/lib/features/clerkships/schemas.ts`

```typescript
// BEFORE
export const specialtySchema = z.string().min(1, {
  message: 'Specialty must not be empty if provided'
}).optional();

// AFTER
export const specialtySchema = z
  .string()
  .transform(val => val === '' ? undefined : val)
  .optional();
```

#### 2. E2E Test
```typescript
test('should create clerkship without specialty', async () => {
  const response = await api.post('/api/clerkships', {
    name: 'Internal Medicine',
    specialty: '', // Empty string should be allowed
    clerkship_type: 'inpatient',
    required_days: 28
  });

  const clerkship = await api.expectData(response, 201);
  expect(clerkship.specialty).toBeNull();
});
```

### Validation Criteria
- ✅ Can submit clerkship form with empty specialty
- ✅ Empty string converts to null in database
- ✅ E2E test passes

---

## Bug 3: Health Systems & Sites - No Dedicated Routes

### Problem
Health Systems and Sites only manageable from `/scheduling-config`, which is confusing. Need dedicated routes.

### Solution Steps

#### 1. Create `/health-systems` Route
**Files:**
- `src/routes/(app)/health-systems/+page.svelte` - Main page with list + modal pattern
- `src/routes/(app)/health-systems/+page.server.ts` - Load health systems

```svelte
<!-- Pattern matching /preceptors and /clerkships -->
<div class="container mx-auto py-8">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-3xl font-bold">Health Systems</h1>
    <Button onclick={handleAdd}>Add Health System</Button>
  </div>

  <HealthSystemList
    healthSystems={data.healthSystems}
    onEdit={handleEdit}
    onDelete={handleDelete}
  />
</div>

{#if showForm}
  <!-- Modal with form -->
{/if}
```

#### 2. Create `/sites` Route
**Files:**
- `src/routes/(app)/sites/+page.svelte` - Main page with list + modal pattern
- `src/routes/(app)/sites/+page.server.ts` - Load sites

**Site List Columns:**
- Name
- Health System (lookup)
- Address
- Office Phone
- Contact Person
- Contact Email
- Actions (Edit, Delete)

#### 3. Update Navigation
**Location:** `src/routes/(app)/+layout.svelte`

Add links to sidebar/header navigation:
- Health Systems
- Sites

#### 4. Remove from Scheduling Config
**Location:** `src/routes/(app)/scheduling-config/+page.svelte`

- Remove 'health-systems' from activeTab type
- Remove Health Systems tab button
- Remove Health Systems tab content

#### 5. E2E Tests
```typescript
// e2e/api/health-systems.api.test.ts
test('should create health system', async () => {
  const response = await api.post('/api/health-systems', {
    name: 'Test Hospital',
    location: 'City, State',
    description: 'Test description'
  });

  const hs = await api.expectData(response, 201);
  expect(hs.name).toBe('Test Hospital');
});

// e2e/api/sites.api.test.ts
test('should create site with all contact fields', async () => {
  const hsResponse = await api.post('/api/health-systems', {...});
  const hs = await api.expectData(hsResponse, 201);

  const response = await api.post('/api/sites', {
    name: 'Main Campus',
    health_system_id: hs.id,
    address: '123 Main St, City, State 12345',
    office_phone: '+1 (555) 123-4567',
    contact_person: 'Dr. Jane Smith',
    contact_email: 'jane@hospital.com'
  });

  const site = await api.expectData(response, 201);
  expect(site.address).toBe('123 Main St, City, State 12345');
  expect(site.office_phone).toBe('+1 (555) 123-4567');
  expect(site.contact_person).toBe('Dr. Jane Smith');
  expect(site.contact_email).toBe('jane@hospital.com');
});
```

### Validation Criteria
- ✅ /health-systems route works
- ✅ /sites route works with all contact fields
- ✅ Navigation links present
- ✅ Health Systems tab removed from scheduling-config
- ✅ E2E tests pass

---

## Bug 4: Execute Scheduling Engine - Non-functional Page

### Problem
"Execute Scheduling Engine" tab in `/scheduling-config` does nothing. Should be removed; execution happens in `/calendar`.

### Solution Steps

#### 1. Remove Execute Tab
**Location:** `src/routes/(app)/scheduling-config/+page.svelte`

```typescript
// Remove 'execute' from type
let activeTab = $state<'clerkships' | 'global-defaults' | 'associations' | 'onboarding'>('clerkships');

// Remove execute tab button (lines ~91-100)
// Remove execute tab content (lines ~175-187)
// Remove handleExecuteScheduling function (lines 24-26)
```

#### 2. Delete Execute Page
**File to delete:** `src/routes/(app)/scheduling-config/execute/+page.svelte`

### Validation Criteria
- ✅ Execute tab not visible on scheduling-config page
- ✅ Execute page file deleted
- ✅ No broken links or references

---

## Bug 5: Clerkship Configuration - Overcomplicated UI

### Problem
Clerkship configuration page has multiple tabs (Requirements, Teams, Capacity Rules, Fallbacks) which is confusing. Should be simplified to a single page with grouped fields that auto-populate from global defaults.

### Solution Steps

#### 1. Understand Current Structure
Read files:
- `src/routes/(app)/scheduling-config/clerkships/[id]/+page.svelte`
- `src/lib/features/scheduling-config/components/clerkship-requirements-form.svelte`
- `src/lib/features/scheduling-config/services/requirements.service.ts`

#### 2. Create Simplified Single-Page Form
**Location:** `src/routes/(app)/scheduling-config/clerkships/[id]/+page.svelte`

**Form Structure:**
```svelte
<form>
  <h2>Configure {clerkship.name}</h2>

  <!-- Reset Button -->
  <Button onclick={resetToGlobalDefaults}>Reset to Global Defaults</Button>

  <!-- Base Requirements Section -->
  <fieldset>
    <legend>Base Requirements</legend>
    <Label>Minimum Total Days</Label>
    <Input type="number" bind:value={formData.min_total_days} />

    <Label>Maximum Total Days</Label>
    <Input type="number" bind:value={formData.max_total_days} />
  </fieldset>

  <!-- Consecutive Days Section -->
  <fieldset>
    <legend>Consecutive Days</legend>
    <Label>Minimum Consecutive Days</Label>
    <Input type="number" bind:value={formData.min_consecutive_days} />

    <Label>Maximum Consecutive Days</Label>
    <Input type="number" bind:value={formData.max_consecutive_days} />
  </fieldset>

  <!-- Inpatient-Specific Section (only if clerkship_type === 'inpatient') -->
  {#if clerkship.clerkship_type === 'inpatient'}
    <fieldset>
      <legend>Inpatient Requirements</legend>
      <Label>Minimum Inpatient Days</Label>
      <Input type="number" bind:value={formData.min_inpatient_days} />

      <Label>Maximum Inpatient Days</Label>
      <Input type="number" bind:value={formData.max_inpatient_days} />
    </fieldset>
  {/if}

  <!-- Outpatient-Specific Section (only if clerkship_type === 'outpatient') -->
  {#if clerkship.clerkship_type === 'outpatient'}
    <fieldset>
      <legend>Outpatient Requirements</legend>
      <Label>Minimum Outpatient Days</Label>
      <Input type="number" bind:value={formData.min_outpatient_days} />

      <Label>Maximum Outpatient Days</Label>
      <Input type="number" bind:value={formData.max_outpatient_days} />
    </fieldset>
  {/if}

  <!-- Electives Section (if applicable) -->
  <fieldset>
    <legend>Electives</legend>
    <!-- Elective configuration fields -->
  </fieldset>

  <Button type="submit">Save Configuration</Button>
</form>
```

#### 3. Auto-populate from Global Defaults
**On page load:**
```typescript
onMount(async () => {
  // Fetch global defaults
  const globalDefaultsResponse = await fetch('/api/scheduling-config/global-defaults');
  const globalDefaults = await globalDefaultsResponse.json();

  // Fetch existing clerkship configuration
  const configResponse = await fetch(`/api/scheduling-config/clerkships/${clerkshipId}`);
  const existingConfig = await configResponse.json();

  // Determine which defaults to use
  let defaults;
  if (clerkship.clerkship_type === 'outpatient') {
    defaults = globalDefaults.outpatient_defaults;
  } else if (clerkship.clerkship_type === 'inpatient') {
    defaults = globalDefaults.inpatient_defaults;
  } else {
    defaults = globalDefaults.base_defaults;
  }

  // Populate form: use existing config if present, otherwise use defaults
  formData = {
    min_total_days: existingConfig?.min_total_days ?? defaults.min_total_days,
    max_total_days: existingConfig?.max_total_days ?? defaults.max_total_days,
    min_consecutive_days: existingConfig?.min_consecutive_days ?? defaults.min_consecutive_days,
    max_consecutive_days: existingConfig?.max_consecutive_days ?? defaults.max_consecutive_days,
    min_inpatient_days: existingConfig?.min_inpatient_days ?? defaults.min_inpatient_days,
    max_inpatient_days: existingConfig?.max_inpatient_days ?? defaults.max_inpatient_days,
    min_outpatient_days: existingConfig?.min_outpatient_days ?? defaults.min_outpatient_days,
    max_outpatient_days: existingConfig?.max_outpatient_days ?? defaults.max_outpatient_days,
  };
});
```

#### 4. Reset to Defaults Function
```typescript
function resetToGlobalDefaults() {
  if (!confirm('Reset all fields to global defaults? This will discard any custom values.')) {
    return;
  }

  // Repopulate from defaults
  formData = { ...defaults };
}
```

#### 5. Remove Tabs
- Remove Requirements tab
- Remove Capacity Rules tab
- Remove Fallbacks tab
- Keep Teams tab (team management accessible from both clerkship and preceptor pages)

#### 6. E2E Tests
```typescript
test('should auto-populate clerkship config from outpatient defaults', async () => {
  // Create outpatient clerkship
  const clerkship = await api.post('/api/clerkships', {
    name: 'Family Medicine',
    clerkship_type: 'outpatient',
    required_days: 28
  });

  // Fetch configuration (should be auto-populated)
  const response = await api.get(`/api/scheduling-config/clerkships/${clerkship.id}`);
  const config = await api.expectData(response, 200);

  // Should have outpatient defaults
  expect(config.min_outpatient_days).toBeGreaterThan(0);
});

test('should reset clerkship config to global defaults', async () => {
  // Create clerkship with custom config
  const clerkship = await api.post('/api/clerkships', {...});
  await api.patch(`/api/scheduling-config/clerkships/${clerkship.id}`, {
    min_total_days: 99
  });

  // Reset to defaults
  const response = await api.post(`/api/scheduling-config/clerkships/${clerkship.id}/reset`);
  const config = await api.expectData(response, 200);

  // Should be back to defaults
  expect(config.min_total_days).not.toBe(99);
});
```

### Validation Criteria
- ✅ Single page with grouped fields
- ✅ Auto-populates from global defaults
- ✅ Uses correct defaults (outpatient vs inpatient)
- ✅ Reset button works
- ✅ Only shows relevant sections based on clerkship type
- ✅ Tabs removed except Teams
- ✅ E2E tests pass

---

## Bug 6: Teams Feature - Not Implemented on UI

### Problem
Teams are implemented in the backend but have no UI. Need to add Teams tab to /preceptors page and enable team creation with members.

### Solution Steps

#### 1. Add Teams Tab to Preceptors Page
**Location:** `src/routes/(app)/preceptors/+page.svelte`

```svelte
<script>
  let activeTab = $state<'preceptors' | 'teams'>('preceptors');
</script>

<div class="mb-6 border-b">
  <nav class="flex space-x-6">
    <button onclick={() => activeTab = 'preceptors'}>Preceptors</button>
    <button onclick={() => activeTab = 'teams'}>Teams</button>
  </nav>
</div>

{#if activeTab === 'preceptors'}
  <!-- Existing preceptor list -->
{:else if activeTab === 'teams'}
  <TeamList teams={data.teams} onEdit={handleEditTeam} onDelete={handleDeleteTeam} />
  <Button onclick={handleAddTeam}>Add Team</Button>
{/if}
```

#### 2. Create Team Components
**Location:** `src/lib/features/teams/`

**team-form.svelte:**
```svelte
<form onsubmit={handleSubmit}>
  <!-- Basic Info -->
  <Label>Name</Label>
  <Input bind:value={formData.name} required />

  <Label>Health System</Label>
  <Select bind:value={formData.health_system_id} required>
    {#each healthSystems as hs}
      <option value={hs.id}>{hs.name}</option>
    {/each}
  </Select>

  <Label>Description (optional)</Label>
  <Textarea bind:value={formData.description} />

  <!-- Team Rules -->
  <fieldset>
    <legend>Team Rules</legend>

    <label>
      <input type="checkbox" bind:checked={formData.require_same_health_system} />
      Enforce same health system for all members
    </label>

    <label>
      <input type="checkbox" bind:checked={formData.require_same_site} />
      Enforce same site for all members
    </label>

    <label>
      <input type="checkbox" bind:checked={formData.require_same_specialty} />
      Enforce same specialty for all members
    </label>

    <label>
      <input type="checkbox" bind:checked={formData.requires_admin_approval} />
      Requires admin approval
    </label>
  </fieldset>

  <!-- Team Members -->
  <fieldset>
    <legend>Team Members</legend>

    <div>
      <Label>Add Preceptor</Label>
      <Select bind:value={selectedPreceptorId}>
        {#each availablePreceptors as preceptor}
          <option value={preceptor.id}>{preceptor.name}</option>
        {/each}
      </Select>
      <Button onclick={addMember}>Add Member</Button>
    </div>

    <!-- Members List -->
    <ul>
      {#each members as member}
        <li>
          {member.name}
          <Input type="number" bind:value={member.priority} placeholder="Priority" />
          <Input type="text" bind:value={member.role} placeholder="Role (optional)" />
          <Button onclick={() => removeMember(member.id)}>Remove</Button>
        </li>
      {/each}
    </ul>
  </fieldset>

  <Button type="submit">Create Team</Button>
</form>
```

#### 3. Filter Available Preceptors
```typescript
// Filter preceptors based on selected health system and team rules
$: availablePreceptors = allPreceptors.filter(p => {
  // Must match health system
  if (formData.health_system_id && p.health_system_id !== formData.health_system_id) {
    return false;
  }

  // If enforce same site rule is on, filter by first member's site
  if (formData.require_same_site && members.length > 0) {
    const firstMemberSite = members[0].site_id;
    if (p.site_id !== firstMemberSite) {
      return false;
    }
  }

  // If enforce same specialty rule is on, filter by first member's specialty
  if (formData.require_same_specialty && members.length > 0) {
    const firstMemberSpecialty = members[0].specialty;
    if (p.specialty !== firstMemberSpecialty) {
      return false;
    }
  }

  // Don't show already added members
  if (members.some(m => m.preceptor_id === p.id)) {
    return false;
  }

  return true;
});
```

#### 4. Team Service Integration
**Verify API endpoints exist:**
- `GET /api/scheduling-config/teams?clerkshipId={id}` (exists per grep)
- `POST /api/scheduling-config/teams` (exists)
- `POST /api/scheduling-config/teams/validate` (exists)

**Create team with members:**
```typescript
async function handleSubmit() {
  const response = await fetch('/api/scheduling-config/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.name,
      health_system_id: formData.health_system_id,
      description: formData.description,
      require_same_health_system: formData.require_same_health_system,
      require_same_site: formData.require_same_site,
      require_same_specialty: formData.require_same_specialty,
      requires_admin_approval: formData.requires_admin_approval,
      members: members.map(m => ({
        preceptor_id: m.preceptor_id,
        role: m.role,
        priority: m.priority
      }))
    })
  });

  if (!response.ok) {
    // Handle error
  }

  onSuccess();
}
```

#### 5. Add Teams to Clerkship Config Page
**Location:** `src/routes/(app)/scheduling-config/clerkships/[id]/+page.svelte`

Keep Teams tab, show teams associated with this clerkship. Allow creating teams specific to the clerkship.

#### 6. E2E Tests
```typescript
test('should create team with members and validation rules', async () => {
  // Create health system and preceptors
  const hs = await api.post('/api/health-systems', {...});
  const healthSystem = await api.expectData(hs, 201);

  const p1 = await api.post('/api/preceptors', {
    name: 'Dr. A',
    health_system_id: healthSystem.id,
    ...
  });
  const preceptor1 = await api.expectData(p1, 201);

  const p2 = await api.post('/api/preceptors', {
    name: 'Dr. B',
    health_system_id: healthSystem.id,
    ...
  });
  const preceptor2 = await api.expectData(p2, 201);

  // Create team
  const response = await api.post('/api/scheduling-config/teams', {
    name: 'Surgery Team A',
    health_system_id: healthSystem.id,
    description: 'Surgical teaching team',
    require_same_health_system: true,
    require_same_site: false,
    require_same_specialty: true,
    requires_admin_approval: false,
    members: [
      { preceptor_id: preceptor1.id, role: 'Lead', priority: 1 },
      { preceptor_id: preceptor2.id, role: 'Member', priority: 2 }
    ]
  });

  const team = await api.expectData(response, 201);
  expect(team.name).toBe('Surgery Team A');
  expect(team.members).toHaveLength(2);
  expect(team.require_same_health_system).toBe(true);
});

test('should enforce same health system rule when enabled', async () => {
  // Create team with enforce same health system
  // Try to add preceptor from different health system
  // Should fail validation
});
```

### Validation Criteria
- ✅ Teams tab visible on /preceptors page
- ✅ Can create team with name, health system, description
- ✅ Can add multiple members to team
- ✅ Can set member priority and role
- ✅ Enforce rules work (same health system, site, specialty)
- ✅ Available preceptors filtered correctly
- ✅ Teams accessible from both /preceptors and /clerkships pages
- ✅ E2E tests pass

---

## Database Migrations Summary

### Migration 013: Add Contact Fields
**File:** `src/lib/db/migrations/013_add_contact_fields.ts`

```typescript
export async function up(db: Kysely<any>): Promise<void> {
  // Add phone to preceptors
  await db.schema
    .alterTable('preceptors')
    .addColumn('phone', 'text')
    .execute();

  // Add contact fields to sites
  await db.schema
    .alterTable('sites')
    .addColumn('address', 'text')
    .addColumn('office_phone', 'text')
    .addColumn('contact_person', 'text')
    .addColumn('contact_email', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('preceptors').dropColumn('phone').execute();

  await db.schema
    .alterTable('sites')
    .dropColumn('address')
    .dropColumn('office_phone')
    .dropColumn('contact_person')
    .dropColumn('contact_email')
    .execute();
}
```

---

## Implementation Order

1. **Migration** - Create and run migration 013
2. **Bug 2** - Clerkship specialty field (quick fix, 15 min)
3. **Bug 4** - Remove execute tab (quick fix, 10 min)
4. **Bug 3** - Health Systems & Sites routes (1-2 hours)
5. **Bug 1** - Preceptors form enhancement (2-3 hours)
6. **Bug 6** - Teams UI (2-3 hours)
7. **Bug 5** - Clerkship config simplification (2-3 hours)

**Total Estimated Time:** 8-12 hours

---

## Testing Strategy

### Unit Tests
- Schema validation tests for new fields
- Service layer tests for CRUD operations
- Form validation tests

### Integration Tests
- Preceptor creation with associations
- Site creation with health system
- Team creation with members

### E2E Tests
- Complete workflows for each bug fix
- Error handling scenarios
- Edge cases (empty fields, validation failures)

### Manual Testing Checklist
- [ ] Create preceptor with all fields
- [ ] Create preceptor with no optional fields
- [ ] Create health system from preceptor form
- [ ] Create site from preceptor form
- [ ] Create clerkship with empty specialty
- [ ] Navigate to /health-systems
- [ ] Navigate to /sites
- [ ] Create team with members
- [ ] Configure clerkship (simplified form)
- [ ] Reset clerkship config to defaults

---

## Success Criteria

All bugs fixed when:
1. ✅ Can create preceptor with all optional fields (health system, site, phone, clerkships)
2. ✅ Can create health system and site from preceptor form without losing data
3. ✅ Can create clerkship with empty specialty field
4. ✅ /health-systems and /sites routes functional
5. ✅ Execute tab removed from scheduling-config
6. ✅ Clerkship configuration simplified to single page
7. ✅ Teams UI functional on both /preceptors and /clerkships pages
8. ✅ All E2E tests pass
9. ✅ Manual testing checklist complete

---

## Related Documents

- `DESIGN_CONTACT_FIELDS.md` - Contact field specifications
- `DESIGN_MULTI_TENANCY.md` - Multi-tenancy architecture (deferred)
- `VERIFICATION-COMPLETE.md` - Teams API verification
- `ROUTE-VALIDATION.md` - API route documentation
