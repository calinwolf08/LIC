# Implementation Plan: Clerkships Page Changes

## Overview
Redesign the clerkship configuration page to remove requirements section, add clerkship-level settings with global defaults, and improve preceptor teams display.

## Changes Summary
1. Rename "Scheduling Defaults" tab to "Default Scheduling Rules"
2. Repurpose `clerkship_configurations` table for clerkship-level settings overrides
3. Remove requirements section from config page
4. Move edit form fields to config page (except specialty which is removed)
5. Add form populated with global defaults based on clerkship type
6. Add "Return to Default" functionality
7. Update Preceptor Teams section to show team list with links
8. Add Sites section to show associated sites
9. Fix related tests

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

### 6.2 Redesign config page component
**File:** `src/routes/clerkships/[id]/config/+page.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';

  let { data } = $props();

  // Clerkship basic info (editable)
  let name = $state(data.clerkship.name);
  let clerkshipType = $state(data.clerkship.clerkship_type);
  let requiredDays = $state(data.clerkship.required_days);
  let description = $state(data.clerkship.description || '');

  // Settings (from global defaults or overrides)
  let settings = $state(data.settings);
  let isUsingDefaults = $derived(settings.overrideMode === 'inherit');

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
      // If type changed, settings stay the same but "return to default"
      // will now load defaults for the NEW type
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
      // Reload settings (will get defaults for current type)
      const settingsRes = await fetch(`/api/clerkships/${data.clerkship.id}/settings`);
      const newSettings = await settingsRes.json();
      settings = newSettings.data;
    }
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

  <div class="space-y-8">
    <!-- Section 1: Basic Information -->
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4">
          <div class="space-y-2">
            <Label for="name">Name *</Label>
            <Input id="name" bind:value={name} required />
          </div>

          <div class="space-y-2">
            <Label>Type *</Label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value="inpatient"
                  checked={clerkshipType === 'inpatient'}
                  onchange={() => clerkshipType = 'inpatient'}
                />
                <span>Inpatient</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value="outpatient"
                  checked={clerkshipType === 'outpatient'}
                  onchange={() => clerkshipType = 'outpatient'}
                />
                <span>Outpatient</span>
              </label>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="required-days">Required Days *</Label>
            <Input
              id="required-days"
              type="number"
              min="1"
              bind:value={requiredDays}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="description">Description</Label>
            <textarea
              id="description"
              bind:value={description}
              class="w-full rounded-md border px-3 py-2 min-h-[80px]"
            ></textarea>
          </div>

          <div class="flex justify-end">
            <Button onclick={handleSaveBasicInfo}>Save Basic Info</Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Section 2: Scheduling Settings -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>Scheduling Settings</CardTitle>
          <div class="flex items-center gap-2">
            {#if isUsingDefaults}
              <Badge variant="secondary">Using Global Defaults</Badge>
            {:else}
              <Badge variant="default">Custom Settings</Badge>
              <Button
                variant="outline"
                size="sm"
                onclick={handleReturnToDefaults}
              >
                Return to Defaults
              </Button>
            {/if}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid gap-6">
          <!-- Assignment Strategy -->
          <div class="space-y-2">
            <Label for="strategy">Assignment Strategy</Label>
            <select
              id="strategy"
              bind:value={settings.assignmentStrategy}
              class="w-full rounded-md border px-3 py-2"
            >
              <option value="continuous_single">Continuous Single</option>
              <option value="continuous_team">Continuous Team</option>
              <option value="block_based">Block Based</option>
              <option value="daily_rotation">Daily Rotation</option>
            </select>
          </div>

          <!-- Health System Rule -->
          <div class="space-y-2">
            <Label for="health-rule">Health System Rule</Label>
            <select
              id="health-rule"
              bind:value={settings.healthSystemRule}
              class="w-full rounded-md border px-3 py-2"
            >
              <option value="enforce_same_system">Enforce Same System</option>
              <option value="prefer_same_system">Prefer Same System</option>
              <option value="no_preference">No Preference</option>
            </select>
          </div>

          <!-- Capacity Settings -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="max-day">Max Students Per Day</Label>
              <Input
                id="max-day"
                type="number"
                min="1"
                bind:value={settings.maxStudentsPerDay}
              />
            </div>
            <div class="space-y-2">
              <Label for="max-year">Max Students Per Year</Label>
              <Input
                id="max-year"
                type="number"
                min="1"
                bind:value={settings.maxStudentsPerYear}
              />
            </div>
          </div>

          <!-- Inpatient-specific settings -->
          {#if clerkshipType === 'inpatient'}
            <div class="border-t pt-4">
              <h4 class="font-medium mb-4">Inpatient Settings</h4>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="block-size">Block Size (Days)</Label>
                  <Input
                    id="block-size"
                    type="number"
                    min="1"
                    bind:value={settings.blockSizeDays}
                  />
                </div>
                <div class="space-y-2">
                  <Label for="max-block">Max Students Per Block</Label>
                  <Input
                    id="max-block"
                    type="number"
                    min="1"
                    bind:value={settings.maxStudentsPerBlock}
                  />
                </div>
              </div>
              <div class="mt-4 space-y-2">
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    bind:checked={settings.allowPartialBlocks}
                  />
                  <span>Allow Partial Blocks</span>
                </label>
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    bind:checked={settings.preferContinuousBlocks}
                  />
                  <span>Prefer Continuous Blocks</span>
                </label>
              </div>
            </div>
          {/if}

          <!-- Team Settings -->
          <div class="border-t pt-4">
            <h4 class="font-medium mb-4">Team Settings</h4>
            <label class="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                bind:checked={settings.allowTeams}
              />
              <span>Allow Teams</span>
            </label>
            {#if settings.allowTeams}
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="team-min">Min Team Size</Label>
                  <Input
                    id="team-min"
                    type="number"
                    min="1"
                    bind:value={settings.teamSizeMin}
                  />
                </div>
                <div class="space-y-2">
                  <Label for="team-max">Max Team Size</Label>
                  <Input
                    id="team-max"
                    type="number"
                    min="1"
                    bind:value={settings.teamSizeMax}
                  />
                </div>
              </div>
            {/if}
          </div>

          <!-- Fallback Settings -->
          <div class="border-t pt-4">
            <h4 class="font-medium mb-4">Fallback Settings</h4>
            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  bind:checked={settings.allowFallbacks}
                />
                <span>Allow Fallbacks</span>
              </label>
              {#if settings.allowFallbacks}
                <label class="flex items-center gap-2 ml-6">
                  <input
                    type="checkbox"
                    bind:checked={settings.fallbackRequiresApproval}
                  />
                  <span>Fallback Requires Approval</span>
                </label>
                <label class="flex items-center gap-2 ml-6">
                  <input
                    type="checkbox"
                    bind:checked={settings.fallbackAllowCrossSystem}
                  />
                  <span>Allow Cross-System Fallbacks</span>
                </label>
              {/if}
            </div>
          </div>

          <div class="flex justify-end">
            <Button onclick={handleSaveSettings}>Save Settings</Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Section 3: Associated Sites -->
    <Card>
      <CardHeader>
        <CardTitle>Associated Sites</CardTitle>
      </CardHeader>
      <CardContent>
        {#if data.sites?.length > 0}
          <div class="space-y-2">
            {#each data.sites as site}
              <div class="flex items-center justify-between p-2 border rounded">
                <a
                  href="/sites/{site.id}/edit"
                  class="text-blue-600 hover:underline"
                >
                  {site.name}
                </a>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-gray-500">No sites associated with this clerkship.</p>
        {/if}
        <div class="mt-4">
          <Button variant="outline" onclick={() => goto('/sites')}>
            Manage Sites
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Section 4: Preceptor Teams -->
    <Card>
      <CardHeader>
        <CardTitle>Preceptor Teams</CardTitle>
      </CardHeader>
      <CardContent>
        {#if data.teams?.length > 0}
          <div class="space-y-2">
            {#each data.teams as team}
              <div class="flex items-center justify-between p-3 border rounded">
                <div>
                  <a
                    href="/preceptors/teams/{team.id}"
                    class="text-blue-600 hover:underline font-medium"
                  >
                    {team.name || 'Unnamed Team'}
                  </a>
                  <p class="text-sm text-gray-500">
                    {team.members?.length || 0} members
                    {#if team.sites?.length > 0}
                      • {team.sites.map(s => s.name).join(', ')}
                    {/if}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => goto(`/preceptors/teams/${team.id}`)}
                >
                  Configure
                </Button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-gray-500">No teams created for this clerkship.</p>
        {/if}
        <div class="mt-4">
          <Button
            variant="outline"
            onclick={() => goto('/preceptors?tab=teams')}
          >
            Manage Teams
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</div>
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
