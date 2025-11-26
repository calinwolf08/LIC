# Implementation Plan: Clerkships Page Changes

## Overview
Redesign the clerkship configuration page to use tabs, add clerkship-site association management, and improve overall UX.

## Changes Summary
1. Rename "Scheduling Defaults" tab to "Default Scheduling Rules"
2. Repurpose `clerkship_configurations` table for clerkship-level settings overrides
3. Remove requirements section from config page
4. Move edit form fields to config page (except specialty which is removed)
5. Add form populated with global defaults based on clerkship type
6. Add "Return to Default" functionality
7. **Use tabs instead of cards**: Basic Information, Scheduling Settings, Associated Sites, Preceptor Teams
8. **Add clerkship-site association management** (add/remove sites)
9. Update Preceptor Teams section to show team list with links
10. Fix related tests

---

## UI Design: Config Page with Tabs

The config page will use a tabbed interface instead of stacked cards:

```
[Basic Information] [Scheduling Settings] [Associated Sites] [Preceptor Teams]
─────────────────────────────────────────────────────────────────────────────

Tab Content Area
```

### Tab 1: Basic Information
- Name (text input)
- Type (inpatient/outpatient radio)
- Required Days (number input)
- Description (textarea)
- Save button

### Tab 2: Scheduling Settings
- Badge showing "Using Global Defaults" or "Custom Settings"
- Return to Defaults button (when custom)
- Assignment Strategy dropdown
- Health System Rule dropdown
- Capacity settings (max per day, max per year)
- Inpatient-specific settings (if type is inpatient)
- Team settings
- Fallback settings
- Save button

### Tab 3: Associated Sites
- List of currently associated sites with Remove button
- "Add Site" button → opens modal/dropdown to select from available sites
- Sites are filtered to show only those not already associated
- API: POST/DELETE to `/api/clerkship-sites`

**Dependency Checking on Remove:**
- Before removing a site from a clerkship, check if any teams depend on that site-clerkship relationship
- Query: Check `team_sites` for teams that belong to this clerkship AND reference this site
- If dependencies exist:
  - Block removal (disable Remove button or show error)
  - Display notification listing the dependent teams by name
  - Message: "Cannot remove site. The following teams depend on this site: [Team A, Team B]. Please update or remove these teams first."
- Only allow removal when no teams depend on the site-clerkship relationship

### Tab 4: Preceptor Teams
- List of teams for this clerkship
- Each team shows: name, sites, member count
- Link to team configuration page
- "Manage Teams" button → navigates to preceptors page teams tab

---

## Step 1: Rename Tab on Main Page

### 1.1 Update tab label
**File:** `src/routes/clerkships/+page.svelte`

Change line ~98 (the tab button text):
```svelte
// FROM:
>
  Scheduling Defaults
</button>

// TO:
>
  Default Scheduling Rules
</button>
```

Note: The `activeTab` state variable name (`'scheduling-defaults'`) can stay the same - only the display text changes.

---

## Step 2: Database Schema Changes

### 2.1 Create migration for clerkship_configurations expansion
**Create:** `src/lib/db/migrations/017_clerkship_settings_overrides.ts`

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add override fields to clerkship_configurations table
  // Since SQLite doesn't support ALTER TABLE ADD COLUMN with complex defaults,
  // we'll add each column individually

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_mode', 'text', (col) =>
      col.defaultTo('inherit').check(sql`override_mode IN ('inherit', 'override')`)
    )
    .execute();

  // Assignment settings
  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_assignment_strategy', 'text')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_health_system_rule', 'text')
    .execute();

  // Capacity settings
  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_max_students_per_day', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_max_students_per_year', 'integer')
    .execute();

  // Inpatient-specific settings
  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_block_size_days', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_max_students_per_block', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_max_blocks_per_year', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_allow_partial_blocks', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_prefer_continuous_blocks', 'integer')
    .execute();

  // Team settings
  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_allow_teams', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_team_size_min', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_team_size_max', 'integer')
    .execute();

  // Fallback settings
  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_allow_fallbacks', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_fallback_requires_approval', 'integer')
    .execute();

  await db.schema
    .alterTable('clerkship_configurations')
    .addColumn('override_fallback_allow_cross_system', 'integer')
    .execute();

  // Remove specialty from clerkships table (SQLite limitation - just stop using it)
  // The column will remain but we won't read/write it
}

export async function down(db: Kysely<any>): Promise<void> {
  // SQLite doesn't support DROP COLUMN easily
  // For rollback, would need to recreate table without these columns
}
```

### 2.2 Update database types
**File:** `src/lib/db/types.ts`

Update `ClerkshipConfigurations` interface:
```typescript
export interface ClerkshipConfigurations {
  id: string | null;
  clerkship_id: string;
  override_mode: Generated<string>;  // 'inherit' | 'override'

  // Assignment settings
  override_assignment_strategy: string | null;
  override_health_system_rule: string | null;

  // Capacity settings
  override_max_students_per_day: number | null;
  override_max_students_per_year: number | null;

  // Inpatient-specific
  override_block_size_days: number | null;
  override_max_students_per_block: number | null;
  override_max_blocks_per_year: number | null;
  override_allow_partial_blocks: number | null;
  override_prefer_continuous_blocks: number | null;

  // Team settings
  override_allow_teams: number | null;
  override_team_size_min: number | null;
  override_team_size_max: number | null;

  // Fallback settings
  override_allow_fallbacks: number | null;
  override_fallback_requires_approval: number | null;
  override_fallback_allow_cross_system: number | null;

  created_at: Generated<string>;
  updated_at: Generated<string>;
}
```

### 2.3 Migration auto-discovery
Note: Migrations are auto-discovered by the `FileMigrationProvider` from the migrations folder.
No manual registration needed in `index.ts`.

---

## Step 3: Create Clerkship Settings Service

### 3.1 Create service for clerkship settings
**Create:** `src/lib/features/clerkships/services/clerkship-settings.service.ts`

```typescript
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface ClerkshipSettings {
  overrideMode: 'inherit' | 'override';
  assignmentStrategy: string;
  healthSystemRule: string;
  maxStudentsPerDay: number;
  maxStudentsPerYear: number;
  // Inpatient-specific
  blockSizeDays?: number;
  maxStudentsPerBlock?: number;
  maxBlocksPerYear?: number;
  allowPartialBlocks?: boolean;
  preferContinuousBlocks?: boolean;
  // Team settings
  allowTeams: boolean;
  teamSizeMin?: number;
  teamSizeMax?: number;
  // Fallback settings
  allowFallbacks: boolean;
  fallbackRequiresApproval: boolean;
  fallbackAllowCrossSystem: boolean;
}

export class ClerkshipSettingsService {
  constructor(private db: Kysely<DB>) {}

  async getClerkshipSettings(clerkshipId: string): Promise<ClerkshipSettings> {
    // Get clerkship to determine type
    const clerkship = await this.db
      .selectFrom('clerkships')
      .select(['clerkship_type'])
      .where('id', '=', clerkshipId)
      .executeTakeFirst();

    if (!clerkship) {
      throw new Error('Clerkship not found');
    }

    // Get global defaults based on type
    const globalDefaults = await this.getGlobalDefaults(clerkship.clerkship_type);

    // Get clerkship configuration overrides
    const config = await this.db
      .selectFrom('clerkship_configurations')
      .selectAll()
      .where('clerkship_id', '=', clerkshipId)
      .executeTakeFirst();

    // If no config or inherit mode, return global defaults
    if (!config || config.override_mode === 'inherit') {
      return {
        overrideMode: 'inherit',
        ...globalDefaults
      };
    }

    // Merge overrides with defaults
    return {
      overrideMode: 'override',
      assignmentStrategy: config.override_assignment_strategy || globalDefaults.assignmentStrategy,
      healthSystemRule: config.override_health_system_rule || globalDefaults.healthSystemRule,
      maxStudentsPerDay: config.override_max_students_per_day ?? globalDefaults.maxStudentsPerDay,
      maxStudentsPerYear: config.override_max_students_per_year ?? globalDefaults.maxStudentsPerYear,
      blockSizeDays: config.override_block_size_days ?? globalDefaults.blockSizeDays,
      maxStudentsPerBlock: config.override_max_students_per_block ?? globalDefaults.maxStudentsPerBlock,
      maxBlocksPerYear: config.override_max_blocks_per_year ?? globalDefaults.maxBlocksPerYear,
      allowPartialBlocks: config.override_allow_partial_blocks !== null
        ? Boolean(config.override_allow_partial_blocks)
        : globalDefaults.allowPartialBlocks,
      preferContinuousBlocks: config.override_prefer_continuous_blocks !== null
        ? Boolean(config.override_prefer_continuous_blocks)
        : globalDefaults.preferContinuousBlocks,
      allowTeams: config.override_allow_teams !== null
        ? Boolean(config.override_allow_teams)
        : globalDefaults.allowTeams,
      teamSizeMin: config.override_team_size_min ?? globalDefaults.teamSizeMin,
      teamSizeMax: config.override_team_size_max ?? globalDefaults.teamSizeMax,
      allowFallbacks: config.override_allow_fallbacks !== null
        ? Boolean(config.override_allow_fallbacks)
        : globalDefaults.allowFallbacks,
      fallbackRequiresApproval: config.override_fallback_requires_approval !== null
        ? Boolean(config.override_fallback_requires_approval)
        : globalDefaults.fallbackRequiresApproval,
      fallbackAllowCrossSystem: config.override_fallback_allow_cross_system !== null
        ? Boolean(config.override_fallback_allow_cross_system)
        : globalDefaults.fallbackAllowCrossSystem,
    };
  }

  async updateClerkshipSettings(
    clerkshipId: string,
    settings: Partial<ClerkshipSettings>
  ): Promise<void> {
    // Ensure config record exists
    const existing = await this.db
      .selectFrom('clerkship_configurations')
      .select('id')
      .where('clerkship_id', '=', clerkshipId)
      .executeTakeFirst();

    const updateData = {
      override_mode: settings.overrideMode || 'override',
      override_assignment_strategy: settings.assignmentStrategy,
      override_health_system_rule: settings.healthSystemRule,
      override_max_students_per_day: settings.maxStudentsPerDay,
      override_max_students_per_year: settings.maxStudentsPerYear,
      override_block_size_days: settings.blockSizeDays,
      override_max_students_per_block: settings.maxStudentsPerBlock,
      override_max_blocks_per_year: settings.maxBlocksPerYear,
      override_allow_partial_blocks: settings.allowPartialBlocks !== undefined
        ? (settings.allowPartialBlocks ? 1 : 0)
        : null,
      override_prefer_continuous_blocks: settings.preferContinuousBlocks !== undefined
        ? (settings.preferContinuousBlocks ? 1 : 0)
        : null,
      override_allow_teams: settings.allowTeams !== undefined
        ? (settings.allowTeams ? 1 : 0)
        : null,
      override_team_size_min: settings.teamSizeMin,
      override_team_size_max: settings.teamSizeMax,
      override_allow_fallbacks: settings.allowFallbacks !== undefined
        ? (settings.allowFallbacks ? 1 : 0)
        : null,
      override_fallback_requires_approval: settings.fallbackRequiresApproval !== undefined
        ? (settings.fallbackRequiresApproval ? 1 : 0)
        : null,
      override_fallback_allow_cross_system: settings.fallbackAllowCrossSystem !== undefined
        ? (settings.fallbackAllowCrossSystem ? 1 : 0)
        : null,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      await this.db
        .updateTable('clerkship_configurations')
        .set(updateData)
        .where('clerkship_id', '=', clerkshipId)
        .execute();
    } else {
      await this.db
        .insertInto('clerkship_configurations')
        .values({
          id: crypto.randomUUID(),
          clerkship_id: clerkshipId,
          ...updateData
        })
        .execute();
    }
  }

  async resetToDefaults(clerkshipId: string): Promise<void> {
    await this.db
      .updateTable('clerkship_configurations')
      .set({
        override_mode: 'inherit',
        override_assignment_strategy: null,
        override_health_system_rule: null,
        override_max_students_per_day: null,
        override_max_students_per_year: null,
        override_block_size_days: null,
        override_max_students_per_block: null,
        override_max_blocks_per_year: null,
        override_allow_partial_blocks: null,
        override_prefer_continuous_blocks: null,
        override_allow_teams: null,
        override_team_size_min: null,
        override_team_size_max: null,
        override_allow_fallbacks: null,
        override_fallback_requires_approval: null,
        override_fallback_allow_cross_system: null,
        updated_at: new Date().toISOString()
      })
      .where('clerkship_id', '=', clerkshipId)
      .execute();
  }

  private async getGlobalDefaults(clerkshipType: string): Promise<Omit<ClerkshipSettings, 'overrideMode'>> {
    const tableName = clerkshipType === 'inpatient'
      ? 'global_inpatient_defaults'
      : 'global_outpatient_defaults';

    const defaults = await this.db
      .selectFrom(tableName as any)
      .selectAll()
      .where('school_id', '=', 'default')
      .executeTakeFirst();

    if (!defaults) {
      // Return hardcoded defaults if no DB record
      return {
        assignmentStrategy: 'continuous_single',
        healthSystemRule: 'no_preference',
        maxStudentsPerDay: 1,
        maxStudentsPerYear: 3,
        allowTeams: false,
        allowFallbacks: true,
        fallbackRequiresApproval: false,
        fallbackAllowCrossSystem: false
      };
    }

    return {
      assignmentStrategy: defaults.assignment_strategy,
      healthSystemRule: defaults.health_system_rule,
      maxStudentsPerDay: defaults.default_max_students_per_day,
      maxStudentsPerYear: defaults.default_max_students_per_year,
      blockSizeDays: defaults.block_size_days,
      maxStudentsPerBlock: defaults.default_max_students_per_block,
      maxBlocksPerYear: defaults.default_max_blocks_per_year,
      allowPartialBlocks: Boolean(defaults.allow_partial_blocks),
      preferContinuousBlocks: Boolean(defaults.prefer_continuous_blocks),
      allowTeams: Boolean(defaults.allow_teams),
      teamSizeMin: defaults.team_size_min,
      teamSizeMax: defaults.team_size_max,
      allowFallbacks: Boolean(defaults.allow_fallbacks),
      fallbackRequiresApproval: Boolean(defaults.fallback_requires_approval),
      fallbackAllowCrossSystem: Boolean(defaults.fallback_allow_cross_system)
    };
  }
}
```

---

## Step 4: Create API Endpoint for Clerkship Settings

### 4.1 Create settings endpoint
**Create:** `src/routes/api/clerkships/[id]/settings/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ClerkshipSettingsService } from '$lib/features/clerkships/services/clerkship-settings.service';

export const GET: RequestHandler = async ({ params, locals }) => {
  const service = new ClerkshipSettingsService(locals.db);

  try {
    const settings = await service.getClerkshipSettings(params.id);
    return json({ data: settings });
  } catch (e) {
    throw error(404, 'Clerkship not found');
  }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const service = new ClerkshipSettingsService(locals.db);
  const body = await request.json();

  await service.updateClerkshipSettings(params.id, body);

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  // Reset to defaults
  const service = new ClerkshipSettingsService(locals.db);
  await service.resetToDefaults(params.id);

  return json({ success: true });
};
```

---

## Step 4.5: Create Clerkship-Sites Dependencies Endpoint

### 4.5.1 Create dependencies check endpoint
**Create:** `src/routes/api/clerkship-sites/dependencies/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const clerkshipId = url.searchParams.get('clerkship_id');
  const siteId = url.searchParams.get('site_id');

  if (!clerkshipId || !siteId) {
    throw error(400, 'clerkship_id and site_id are required');
  }

  // Find teams that:
  // 1. Belong to this clerkship (via preceptor_teams.clerkship_id)
  // 2. Have this site in their team_sites
  const dependentTeams = await locals.db
    .selectFrom('preceptor_teams')
    .innerJoin('team_sites', 'preceptor_teams.id', 'team_sites.team_id')
    .select(['preceptor_teams.id as teamId', 'preceptor_teams.name as teamName'])
    .where('preceptor_teams.clerkship_id', '=', clerkshipId)
    .where('team_sites.site_id', '=', siteId)
    .execute();

  return json({
    data: dependentTeams.map(t => ({
      teamId: t.teamId,
      teamName: t.teamName || 'Unnamed Team'
    }))
  });
};
```

This endpoint checks if any teams for the given clerkship use the specified site. Returns an array of dependent teams (empty if no dependencies).

---

## Step 5: Update Clerkship API Endpoints

### 5.1 Remove specialty from clerkship schema
**File:** `src/lib/features/clerkships/schemas.ts`

Remove `specialty` from create/update schemas:
```typescript
export const createClerkshipSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // Remove: specialty: z.string().optional(),
  clerkship_type: z.enum(['inpatient', 'outpatient']),
  required_days: z.number().int().positive(),
  description: z.string().optional()
});
```

### 5.2 Update clerkship service
**File:** `src/lib/features/clerkships/services/clerkship-service.ts`

Remove references to `specialty` field.

---

## Step 6: Redesign Config Page

### 6.1 Update server load function
**File:** `src/routes/clerkships/[id]/config/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const clerkshipId = params.id;

  const [clerkshipRes, settingsRes, sitesRes, teamsRes] = await Promise.all([
    fetch(`/api/clerkships/${clerkshipId}`),
    fetch(`/api/clerkships/${clerkshipId}/settings`),
    fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`),
    fetch(`/api/preceptors/teams?clerkshipId=${clerkshipId}`)
  ]);

  if (!clerkshipRes.ok) {
    throw error(404, 'Clerkship not found');
  }

  const clerkship = await clerkshipRes.json();
  const settings = await settingsRes.json();
  const sites = await sitesRes.json();
  const teams = await teamsRes.json();

  return {
    clerkship: clerkship.data,
    settings: settings.data,
    sites: sites.data,
    teams: teams.data
  };
};
```

### 6.2 Redesign config page component with Tabs
**File:** `src/routes/clerkships/[id]/config/+page.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Tabs from '$lib/components/ui/tabs';

  let { data } = $props();

  // Active tab state
  let activeTab = $state('basic-info');

  // Clerkship basic info (editable)
  let name = $state(data.clerkship.name);
  let clerkshipType = $state(data.clerkship.clerkship_type);
  let requiredDays = $state(data.clerkship.required_days);
  let description = $state(data.clerkship.description || '');

  // Settings (from global defaults or overrides)
  let settings = $state(data.settings);
  let isUsingDefaults = $derived(settings.overrideMode === 'inherit');

  // Associated sites
  let associatedSites = $state(data.sites || []);
  let availableSites = $derived(
    data.allSites?.filter(s => !associatedSites.some(as => as.id === s.id)) || []
  );
  let showAddSiteModal = $state(false);
  let selectedSiteToAdd = $state('');

  // Track if type changed
  let originalType = data.clerkship.clerkship_type;

  async function handleSaveBasicInfo() {
    const res = await fetch(`/api/clerkships/${data.clerkship.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        clerkship_type: clerkshipType,
        required_days: requiredDays,
        description
      })
    });

    if (res.ok) {
      originalType = clerkshipType;
    }
  }

  async function handleSaveSettings() {
    const res = await fetch(`/api/clerkships/${data.clerkship.id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...settings,
        overrideMode: 'override'
      })
    });

    if (res.ok) {
      settings.overrideMode = 'override';
    }
  }

  async function handleReturnToDefaults() {
    const res = await fetch(`/api/clerkships/${data.clerkship.id}/settings`, {
      method: 'DELETE'
    });

    if (res.ok) {
      const settingsRes = await fetch(`/api/clerkships/${data.clerkship.id}/settings`);
      const newSettings = await settingsRes.json();
      settings = newSettings.data;
    }
  }

  async function handleAddSite() {
    if (!selectedSiteToAdd) return;

    const res = await fetch('/api/clerkship-sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkship_id: data.clerkship.id,
        site_id: selectedSiteToAdd
      })
    });

    if (res.ok) {
      const siteToAdd = data.allSites.find(s => s.id === selectedSiteToAdd);
      if (siteToAdd) {
        associatedSites = [...associatedSites, siteToAdd];
      }
      selectedSiteToAdd = '';
      showAddSiteModal = false;
    }
  }

  // Track site dependencies (teams that use each site)
  let siteDependencies = $state<Record<string, { teamId: string; teamName: string }[]>>({});
  let removeSiteError = $state<string | null>(null);

  // Load dependencies for each associated site
  async function loadSiteDependencies() {
    const deps: Record<string, { teamId: string; teamName: string }[]> = {};
    for (const site of associatedSites) {
      const res = await fetch(
        `/api/clerkship-sites/dependencies?clerkship_id=${data.clerkship.id}&site_id=${site.id}`
      );
      if (res.ok) {
        const result = await res.json();
        deps[site.id] = result.data || [];
      }
    }
    siteDependencies = deps;
  }

  // Load dependencies when sites change
  $effect(() => {
    if (associatedSites.length > 0) {
      loadSiteDependencies();
    }
  });

  async function handleRemoveSite(siteId: string) {
    removeSiteError = null;

    // Check for dependencies first
    const dependencies = siteDependencies[siteId] || [];
    if (dependencies.length > 0) {
      const teamNames = dependencies.map(d => d.teamName).join(', ');
      removeSiteError = `Cannot remove site. The following teams depend on this site: ${teamNames}. Please update or remove these teams first.`;
      return;
    }

    const res = await fetch(`/api/clerkship-sites?clerkship_id=${data.clerkship.id}&site_id=${siteId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      associatedSites = associatedSites.filter(s => s.id !== siteId);
    }
  }

  function hasDependencies(siteId: string): boolean {
    return (siteDependencies[siteId]?.length || 0) > 0;
  }

  function getDependencyCount(siteId: string): number {
    return siteDependencies[siteId]?.length || 0;
  }
</script>

<div class="container mx-auto py-6 max-w-4xl">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold">Configure Clerkship</h1>
      <p class="text-gray-600">{data.clerkship.name}</p>
    </div>
    <Button variant="outline" onclick={() => goto('/clerkships')}>
      Back to Clerkships
    </Button>
  </div>

  <!-- Tabbed Interface -->
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List class="grid w-full grid-cols-4">
      <Tabs.Trigger value="basic-info">Basic Information</Tabs.Trigger>
      <Tabs.Trigger value="scheduling">Scheduling Settings</Tabs.Trigger>
      <Tabs.Trigger value="sites">Associated Sites</Tabs.Trigger>
      <Tabs.Trigger value="teams">Preceptor Teams</Tabs.Trigger>
    </Tabs.List>

    <!-- Tab 1: Basic Information -->
    <Tabs.Content value="basic-info" class="mt-6">
      <div class="border rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-4">Basic Information</h3>
        <div class="grid gap-4">
          <div class="space-y-2">
            <Label for="name">Name *</Label>
            <Input id="name" bind:value={name} required />
          </div>

          <div class="space-y-2">
            <Label>Type *</Label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2">
                <input type="radio" name="type" value="inpatient"
                  checked={clerkshipType === 'inpatient'}
                  onchange={() => clerkshipType = 'inpatient'} />
                <span>Inpatient</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" name="type" value="outpatient"
                  checked={clerkshipType === 'outpatient'}
                  onchange={() => clerkshipType = 'outpatient'} />
                <span>Outpatient</span>
              </label>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="required-days">Required Days *</Label>
            <Input id="required-days" type="number" min="1" bind:value={requiredDays} required />
          </div>

          <div class="space-y-2">
            <Label for="description">Description</Label>
            <textarea id="description" bind:value={description}
              class="w-full rounded-md border px-3 py-2 min-h-[80px]"></textarea>
          </div>

          <div class="flex justify-end">
            <Button onclick={handleSaveBasicInfo}>Save Basic Info</Button>
          </div>
        </div>
      </div>
    </Tabs.Content>

    <!-- Tab 2: Scheduling Settings -->
    <Tabs.Content value="scheduling" class="mt-6">
      <div class="border rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Scheduling Settings</h3>
          <div class="flex items-center gap-2">
            {#if isUsingDefaults}
              <Badge variant="secondary">Using Global Defaults</Badge>
            {:else}
              <Badge variant="default">Custom Settings</Badge>
              <Button variant="outline" size="sm" onclick={handleReturnToDefaults}>
                Return to Defaults
              </Button>
            {/if}
          </div>
        </div>

        <!-- Settings form fields (same as before) -->
        <div class="grid gap-6">
          <!-- Assignment Strategy, Health System Rule, Capacity, etc. -->
          <!-- ... (keep existing settings form content) ... -->

          <div class="flex justify-end">
            <Button onclick={handleSaveSettings}>Save Settings</Button>
          </div>
        </div>
      </div>
    </Tabs.Content>

    <!-- Tab 3: Associated Sites -->
    <Tabs.Content value="sites" class="mt-6">
      <div class="border rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Associated Sites</h3>
          <Button onclick={() => showAddSiteModal = true}>Add Site</Button>
        </div>

        <!-- Error message for dependency blocking -->
        {#if removeSiteError}
          <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p class="font-medium">Cannot Remove Site</p>
            <p class="text-sm mt-1">{removeSiteError}</p>
          </div>
        {/if}

        {#if associatedSites.length > 0}
          <div class="space-y-2">
            {#each associatedSites as site}
              <div class="flex items-center justify-between p-3 border rounded">
                <div>
                  <a href="/sites/{site.id}/edit" class="text-blue-600 hover:underline">
                    {site.name}
                  </a>
                  {#if hasDependencies(site.id)}
                    <p class="text-xs text-amber-600 mt-1">
                      Used by {getDependencyCount(site.id)} team{getDependencyCount(site.id) > 1 ? 's' : ''}
                    </p>
                  {/if}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => handleRemoveSite(site.id)}
                  disabled={hasDependencies(site.id)}
                  title={hasDependencies(site.id) ? 'Cannot remove: teams depend on this site' : 'Remove site'}
                >
                  Remove
                </Button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-gray-500 text-center py-8">
            No sites associated with this clerkship.
            <br />
            <span class="text-sm">Add sites to define where this clerkship is offered.</span>
          </p>
        {/if}
      </div>

      <!-- Add Site Modal -->
      {#if showAddSiteModal}
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 class="text-lg font-semibold mb-4">Add Site</h3>
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="site-select">Select Site</Label>
                <select id="site-select" bind:value={selectedSiteToAdd}
                  class="w-full rounded-md border px-3 py-2">
                  <option value="">Choose a site...</option>
                  {#each availableSites as site}
                    <option value={site.id}>{site.name}</option>
                  {/each}
                </select>
              </div>
              <div class="flex justify-end gap-2">
                <Button variant="outline" onclick={() => showAddSiteModal = false}>Cancel</Button>
                <Button onclick={handleAddSite} disabled={!selectedSiteToAdd}>Add</Button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </Tabs.Content>

    <!-- Tab 4: Preceptor Teams -->
    <Tabs.Content value="teams" class="mt-6">
      <div class="border rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Preceptor Teams</h3>
          <Button variant="outline" onclick={() => goto('/preceptors?tab=teams')}>
            Manage Teams
          </Button>
        </div>

        {#if data.teams?.length > 0}
          <div class="space-y-2">
            {#each data.teams as team}
              <div class="flex items-center justify-between p-3 border rounded">
                <div>
                  <a href="/preceptors/teams/{team.id}" class="text-blue-600 hover:underline font-medium">
                    {team.name || 'Unnamed Team'}
                  </a>
                  <p class="text-sm text-gray-500">
                    {team.members?.length || 0} members
                    {#if team.sites?.length > 0}
                      • {team.sites.map(s => s.name).join(', ')}
                    {/if}
                  </p>
                </div>
                <Button variant="outline" size="sm" onclick={() => goto(`/preceptors/teams/${team.id}`)}>
                  Configure
                </Button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-gray-500 text-center py-8">
            No teams created for this clerkship.
            <br />
            <span class="text-sm">Teams can be created on the Preceptors page.</span>
          </p>
        {/if}
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>
```

### 6.3 Update server load to include all sites
**File:** `src/routes/clerkships/[id]/config/+page.server.ts`

```typescript
export const load: PageServerLoad = async ({ params, fetch }) => {
  const clerkshipId = params.id;

  const [clerkshipRes, settingsRes, sitesRes, allSitesRes, teamsRes] = await Promise.all([
    fetch(`/api/clerkships/${clerkshipId}`),
    fetch(`/api/clerkships/${clerkshipId}/settings`),
    fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`),
    fetch('/api/sites'),  // All sites for the "Add Site" dropdown
    fetch(`/api/preceptors/teams?clerkshipId=${clerkshipId}`)
  ]);

  // ... process responses

  return {
    clerkship: clerkship.data,
    settings: settings.data,
    sites: sites.data,        // Currently associated sites
    allSites: allSites.data,  // All available sites
    teams: teams.data
  };
};
```

---

## Step 7: Remove Edit Modal from Main Page

### 7.1 Update main clerkships page
**File:** `src/routes/clerkships/+page.svelte`

Remove the edit modal and redirect "Edit" button to config page:

```svelte
// Remove:
// - showForm state
// - selectedClerkship state
// - handleSave function for modal
// - Modal component with ClerkshipForm

// Update ClerkshipList onEdit handler:
onedit={(clerkship) => goto(`/clerkships/${clerkship.id}/config`)}
```

### 7.2 Update ClerkshipList component
**File:** `src/lib/features/clerkships/components/clerkship-list.svelte`

Remove "Edit" button (since Configure now handles everything):

```svelte
// Change buttons from:
<Button size="sm" variant="outline" onclick={() => onedit(clerkship)}>Edit</Button>
<Button size="sm" variant="outline" onclick={() => onconfigure(clerkship)}>Configure</Button>

// To just:
<Button size="sm" variant="outline" onclick={() => onconfigure(clerkship)}>Configure</Button>
```

---

## Step 8: Update Clerkship Form Component

### 8.1 Remove specialty field
**File:** `src/lib/features/clerkships/components/clerkship-form.svelte`

Remove the specialty input field. This form is now only used for creating new clerkships.

---

## Step 9: Fix Tests

### 9.1 Update clerkship tests
**Files to update:**
- `e2e/api/clerkships.api.test.ts` - Remove specialty tests
- `e2e/api/scheduling-config.api.test.ts` - Update for new settings endpoint
- Any unit tests for clerkship service

### 9.2 Add new tests for clerkship settings
- Test GET settings returns defaults for new clerkship
- Test PUT settings creates override
- Test DELETE settings resets to defaults
- Test type change keeps settings, return to default uses new type

---

## Step 10: Fix Build and Type Errors

### 10.1 Run checks
```bash
npm run check
npm run build
```

### 10.2 Fix any TypeScript errors
- Update type definitions
- Remove specialty references throughout codebase

---

## Files Changed Summary

### New Files:
- `src/lib/db/migrations/017_clerkship_settings_overrides.ts`
- `src/lib/features/clerkships/services/clerkship-settings.service.ts`
- `src/routes/api/clerkships/[id]/settings/+server.ts`
- `src/routes/api/clerkship-sites/dependencies/+server.ts`

### Modified Files:
- `src/lib/db/types.ts`
- `src/lib/db/migrations/index.ts`
- `src/lib/features/clerkships/schemas.ts`
- `src/lib/features/clerkships/services/clerkship-service.ts`
- `src/lib/features/clerkships/components/clerkship-form.svelte`
- `src/lib/features/clerkships/components/clerkship-list.svelte`
- `src/routes/clerkships/+page.svelte`
- `src/routes/clerkships/[id]/config/+page.server.ts`
- `src/routes/clerkships/[id]/config/+page.svelte`

---

## Testing Checklist
- [ ] Migration runs successfully
- [ ] Tab renamed to "Default Scheduling Rules"
- [ ] Config page shows basic info form (no specialty)
- [ ] Config page shows scheduling settings from global defaults
- [ ] Settings can be customized and saved
- [ ] "Return to Default" button resets to global defaults
- [ ] Type change keeps custom settings
- [ ] After type change, "Return to Default" loads new type's defaults
- [ ] Sites section shows associated sites with links
- [ ] Preceptor Teams section shows teams with configure links
- [ ] Edit button removed from clerkship list (Configure only)
- [ ] Creating new clerkship works (no specialty)
- [ ] All TypeScript/Svelte checks pass
- [ ] Build succeeds
- [ ] Related tests pass

### Associated Sites Dependency Tests
- [ ] Sites with no dependent teams can be removed
- [ ] Sites with dependent teams show warning indicator (e.g., "Used by 2 teams")
- [ ] Remove button is disabled for sites with dependencies
- [ ] Attempting to remove a site with dependencies shows error message
- [ ] Error message lists the specific team names that depend on the site
- [ ] After removing dependent teams, site can be removed
- [ ] Dependencies endpoint returns correct team list
