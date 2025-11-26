# Implementation Plan: Preceptors Page Changes

## Overview
Major architectural changes to support multi-site preceptors, team site associations, and improved UI.

## Changes Summary
1. Database schema changes (preceptor_sites, team_sites tables)
2. Remove `site_id` from preceptors table
3. Update preceptor list to show health system, site(s), clerkships, teams
4. Convert teams display from cards to table with clerkship filter
5. Update team creation to include clerkship and site selection
6. Remove Site Associations tab
7. Create teams configuration route at `/preceptors/teams/[id]`
8. Remove `require_same_site` from team rules
9. Fix related tests

---

## Step 1: Database Schema Changes

### 1.1 Create migration for preceptor_sites table
**Create:** `src/lib/db/migrations/016_preceptor_multi_site.ts`

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create preceptor_sites junction table
  await db.schema
    .createTable('preceptor_sites')
    .addColumn('preceptor_id', 'text', (col) => col.notNull().references('preceptors.id').onDelete('cascade'))
    .addColumn('site_id', 'text', (col) => col.notNull().references('sites.id').onDelete('cascade'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint('pk_preceptor_sites', ['preceptor_id', 'site_id'])
    .execute();

  // Create team_sites junction table
  await db.schema
    .createTable('team_sites')
    .addColumn('team_id', 'text', (col) => col.notNull().references('preceptor_teams.id').onDelete('cascade'))
    .addColumn('site_id', 'text', (col) => col.notNull().references('sites.id').onDelete('cascade'))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint('pk_team_sites', ['team_id', 'site_id'])
    .execute();

  // Create indexes for efficient lookups
  await db.schema
    .createIndex('idx_preceptor_sites_preceptor')
    .on('preceptor_sites')
    .column('preceptor_id')
    .execute();

  await db.schema
    .createIndex('idx_preceptor_sites_site')
    .on('preceptor_sites')
    .column('site_id')
    .execute();

  await db.schema
    .createIndex('idx_team_sites_team')
    .on('team_sites')
    .column('team_id')
    .execute();

  await db.schema
    .createIndex('idx_team_sites_site')
    .on('team_sites')
    .column('site_id')
    .execute();

  // Remove site_id column from preceptors (will be managed via junction table)
  // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
  // For simplicity, we'll leave the column but stop using it

  // Remove require_same_site from preceptor_teams
  // Same SQLite limitation - we'll just stop using it
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('team_sites').execute();
  await db.schema.dropTable('preceptor_sites').execute();
}
```

### 1.2 Update database types
**File:** `src/lib/db/types.ts`

Add new interfaces:
```typescript
export interface PreceptorSites {
  preceptor_id: string;
  site_id: string;
  created_at: Generated<string>;
}

export interface TeamSites {
  team_id: string;
  site_id: string;
  created_at: Generated<string>;
}
```

Add to DB interface:
```typescript
export interface DB {
  // ... existing tables
  preceptor_sites: PreceptorSites;
  team_sites: TeamSites;
}
```

### 1.3 Migration auto-discovery
Note: Migrations are auto-discovered by the `FileMigrationProvider` from the migrations folder.
No manual registration needed in `index.ts`.

---

## Step 2: Update Preceptor Service

### 2.1 Add site management methods
**File:** `src/lib/features/preceptors/services/preceptor-service.ts`

```typescript
// Get sites for a preceptor
export async function getPreceptorSites(db: Kysely<DB>, preceptorId: string): Promise<string[]> {
  const sites = await db
    .selectFrom('preceptor_sites')
    .select('site_id')
    .where('preceptor_id', '=', preceptorId)
    .execute();
  return sites.map(s => s.site_id);
}

// Set sites for a preceptor (replaces all existing)
export async function setPreceptorSites(
  db: Kysely<DB>,
  preceptorId: string,
  siteIds: string[]
): Promise<void> {
  // Delete existing associations
  await db
    .deleteFrom('preceptor_sites')
    .where('preceptor_id', '=', preceptorId)
    .execute();

  // Add new associations
  if (siteIds.length > 0) {
    await db
      .insertInto('preceptor_sites')
      .values(siteIds.map(siteId => ({
        preceptor_id: preceptorId,
        site_id: siteId
      })))
      .execute();
  }
}

// Get preceptors with their sites, clerkships, and teams
export async function getPreceptorsWithAssociations(db: Kysely<DB>): Promise<PreceptorWithAssociations[]> {
  const preceptors = await db
    .selectFrom('preceptors')
    .leftJoin('health_systems', 'preceptors.health_system_id', 'health_systems.id')
    .select([
      'preceptors.id',
      'preceptors.name',
      'preceptors.email',
      'preceptors.phone',
      'preceptors.max_students',
      'preceptors.health_system_id',
      'health_systems.name as health_system_name',
      'preceptors.created_at'
    ])
    .orderBy('preceptors.name', 'asc')
    .execute();

  // For each preceptor, get their sites, clerkships (via teams), and teams
  const result = await Promise.all(preceptors.map(async (p) => {
    const sites = await db
      .selectFrom('preceptor_sites')
      .innerJoin('sites', 'preceptor_sites.site_id', 'sites.id')
      .select(['sites.id', 'sites.name'])
      .where('preceptor_sites.preceptor_id', '=', p.id)
      .execute();

    const teams = await db
      .selectFrom('preceptor_team_members')
      .innerJoin('preceptor_teams', 'preceptor_team_members.team_id', 'preceptor_teams.id')
      .innerJoin('clerkships', 'preceptor_teams.clerkship_id', 'clerkships.id')
      .select([
        'preceptor_teams.id as team_id',
        'preceptor_teams.name as team_name',
        'clerkships.id as clerkship_id',
        'clerkships.name as clerkship_name'
      ])
      .where('preceptor_team_members.preceptor_id', '=', p.id)
      .execute();

    // Extract unique clerkships from teams
    const clerkshipsMap = new Map();
    teams.forEach(t => clerkshipsMap.set(t.clerkship_id, t.clerkship_name));
    const clerkships = Array.from(clerkshipsMap.entries()).map(([id, name]) => ({ id, name }));

    return {
      ...p,
      sites,
      clerkships,
      teams: teams.map(t => ({ id: t.team_id, name: t.team_name }))
    };
  }));

  return result;
}
```

### 2.2 Update create/update preceptor to handle sites
Modify `createPreceptor` and `updatePreceptor` functions to accept `siteIds: string[]` and call `setPreceptorSites`.

---

## Step 3: Update Team Service

### 3.1 Add site management methods
**File:** `src/lib/features/scheduling-config/services/teams.service.ts`

```typescript
// Get sites for a team
async getTeamSites(teamId: string): Promise<string[]> {
  const sites = await this.db
    .selectFrom('team_sites')
    .select('site_id')
    .where('team_id', '=', teamId)
    .execute();
  return sites.map(s => s.site_id);
}

// Set sites for a team
async setTeamSites(teamId: string, siteIds: string[]): Promise<void> {
  await this.db
    .deleteFrom('team_sites')
    .where('team_id', '=', teamId)
    .execute();

  if (siteIds.length > 0) {
    await this.db
      .insertInto('team_sites')
      .values(siteIds.map(siteId => ({
        team_id: teamId,
        site_id: siteId
      })))
      .execute();
  }
}

// Get preceptors available for a team (filtered by team's sites)
async getAvailablePreceptorsForTeam(siteIds: string[]): Promise<Preceptor[]> {
  if (siteIds.length === 0) {
    // If no sites specified, return all preceptors
    return this.db.selectFrom('preceptors').selectAll().execute();
  }

  // Get preceptors who:
  // 1. Are associated with at least one of the specified sites, OR
  // 2. Have no site associations at all
  const preceptorsWithSites = await this.db
    .selectFrom('preceptors')
    .leftJoin('preceptor_sites', 'preceptors.id', 'preceptor_sites.preceptor_id')
    .select([
      'preceptors.id',
      'preceptors.name',
      'preceptors.email',
      'preceptors.health_system_id',
      sql`GROUP_CONCAT(preceptor_sites.site_id)`.as('site_ids')
    ])
    .groupBy('preceptors.id')
    .execute();

  return preceptorsWithSites.filter(p => {
    if (!p.site_ids) return true; // No site associations
    const preceptorSiteIds = p.site_ids.split(',');
    return siteIds.some(siteId => preceptorSiteIds.includes(siteId));
  });
}
```

### 3.2 Update team creation/update
Modify `createTeam` to:
- Accept `siteIds: string[]` in input
- Remove `requireSameSite` from validation
- Call `setTeamSites` after creating team

### 3.3 Update team retrieval
Modify `getTeamsByClerkship` and `getTeam` to include site information.

### 3.4 Remove require_same_site validation
Remove the validation logic for `requireSameSite` since teams now have explicit site assignments.

---

## Step 4: Update Team API Endpoints

### 4.1 Update GET /api/preceptors/teams
**File:** `src/routes/api/preceptors/teams/+server.ts`

- Remove `clerkshipId` as required query param (make optional for filtering)
- Return all teams if no filter, or filter by clerkshipId if provided
- Include site information in response

### 4.2 Update POST /api/preceptors/teams
- Accept `siteIds: string[]` in request body
- Accept `clerkshipId` in body instead of query param
- Remove `requireSameSite` from body

### 4.3 Update PATCH /api/preceptors/teams/[id]
**File:** `src/routes/api/preceptors/teams/[id]/+server.ts`

- Accept `siteIds: string[]` in request body
- Update team sites when provided

### 4.4 Create GET endpoint for available preceptors
**Create:** `src/routes/api/preceptors/teams/available-preceptors/+server.ts`

```typescript
// GET /api/preceptors/teams/available-preceptors?siteIds=id1,id2
// Returns preceptors filtered by sites (or all if no sites specified)
```

---

## Step 5: Update Preceptors API Endpoint

### 5.1 Update GET /api/preceptors
**File:** `src/routes/api/preceptors/+server.ts`

Return preceptors with associations (health_system, sites, clerkships, teams).

### 5.2 Update POST/PATCH to handle sites
Accept `siteIds: string[]` and call service methods to manage preceptor sites.

---

## Step 6: Update Preceptor List Component

### 6.1 Add new columns
**File:** `src/lib/features/preceptors/components/preceptor-list.svelte`

Add columns:
- Health System (clickable, navigates to `/health-systems`)
- Sites (comma-separated list, each clickable to `/sites/[id]/edit`)
- Clerkships (comma-separated list, each clickable to `/clerkships/[id]/config`)
- Teams (comma-separated list, each clickable to `/preceptors/teams/[id]`)

```svelte
<th class="px-4 py-3 text-left text-sm font-medium">Health System</th>
<th class="px-4 py-3 text-left text-sm font-medium">Sites</th>
<th class="px-4 py-3 text-left text-sm font-medium">Clerkships</th>
<th class="px-4 py-3 text-left text-sm font-medium">Teams</th>

<!-- In table body -->
<td class="px-4 py-3 text-sm">
  {#if preceptor.health_system_name}
    <a href="/health-systems" class="text-blue-600 hover:underline">
      {preceptor.health_system_name}
    </a>
  {:else}
    <span class="text-gray-400">—</span>
  {/if}
</td>
<td class="px-4 py-3 text-sm">
  {#if preceptor.sites?.length}
    {#each preceptor.sites as site, i}
      <a href="/sites/{site.id}/edit" class="text-blue-600 hover:underline">
        {site.name}
      </a>{i < preceptor.sites.length - 1 ? ', ' : ''}
    {/each}
  {:else}
    <span class="text-gray-400">—</span>
  {/if}
</td>
<td class="px-4 py-3 text-sm">
  {#if preceptor.clerkships?.length}
    {#each preceptor.clerkships as clerkship, i}
      <a href="/clerkships/{clerkship.id}/config" class="text-blue-600 hover:underline">
        {clerkship.name}
      </a>{i < preceptor.clerkships.length - 1 ? ', ' : ''}
    {/each}
  {:else}
    <span class="text-gray-400">—</span>
  {/if}
</td>
<td class="px-4 py-3 text-sm">
  {#if preceptor.teams?.length}
    {#each preceptor.teams as team, i}
      <a href="/preceptors/teams/{team.id}" class="text-blue-600 hover:underline">
        {team.name || 'Unnamed Team'}
      </a>{i < preceptor.teams.length - 1 ? ', ' : ''}
    {/each}
  {:else}
    <span class="text-gray-400">—</span>
  {/if}
</td>
```

### 6.2 Update props interface
Update the component to expect the enriched preceptor data.

---

## Step 7: Update Preceptor Form Component

### 7.1 Change site selection to multi-select
**File:** `src/lib/features/preceptors/components/preceptor-form.svelte`

Replace single site dropdown with multi-select checkboxes or a multi-select component:

```svelte
<div class="space-y-2">
  <Label>Sites (optional)</Label>
  <div class="max-h-40 overflow-y-auto border rounded-md p-2">
    {#each filteredSites as site}
      <label class="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          checked={selectedSiteIds.includes(site.id)}
          onchange={() => toggleSite(site.id)}
        />
        <span>{site.name}</span>
      </label>
    {/each}
  </div>
</div>
```

### 7.2 Update form submission
Send `siteIds: string[]` instead of `site_id: string`.

---

## Step 8: Convert Teams Tab to Table

### 8.1 Update team-list.svelte
**File:** `src/lib/features/teams/components/team-list.svelte`

Convert from card layout to table:

```svelte
<table class="min-w-full divide-y divide-gray-200">
  <thead class="bg-gray-50">
    <tr>
      <th class="px-4 py-3 text-left text-sm font-medium">Team Name</th>
      <th class="px-4 py-3 text-left text-sm font-medium">Clerkship</th>
      <th class="px-4 py-3 text-left text-sm font-medium">Sites</th>
      <th class="px-4 py-3 text-left text-sm font-medium">Members</th>
      <th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
    </tr>
  </thead>
  <tbody class="bg-white divide-y divide-gray-200">
    {#each teams as team}
      <tr>
        <td class="px-4 py-3 text-sm">
          <a href="/preceptors/teams/{team.id}" class="text-blue-600 hover:underline">
            {team.name || 'Unnamed Team'}
          </a>
        </td>
        <td class="px-4 py-3 text-sm">{team.clerkshipName}</td>
        <td class="px-4 py-3 text-sm">
          {team.sites?.map(s => s.name).join(', ') || '—'}
        </td>
        <td class="px-4 py-3 text-sm">{team.members?.length || 0} members</td>
        <td class="px-4 py-3 text-sm">
          <Button size="sm" variant="outline" onclick={() => handleEdit(team)}>Edit</Button>
          <Button size="sm" variant="destructive" onclick={() => handleDelete(team.id)}>Delete</Button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
```

### 8.2 Add clerkship filter
Add filter dropdown above the table:

```svelte
<div class="flex items-center gap-4 mb-4">
  <Label for="clerkship-filter">Filter by Clerkship:</Label>
  <select
    id="clerkship-filter"
    bind:value={filterClerkshipId}
    class="rounded-md border px-3 py-2"
  >
    <option value="">All Clerkships</option>
    {#each clerkships as clerkship}
      <option value={clerkship.id}>{clerkship.name}</option>
    {/each}
  </select>
</div>
```

---

## Step 9: Update Team Form Dialog

### 9.1 Add clerkship selection
**File:** `src/lib/features/teams/components/team-form-dialog.svelte`

Remove `clerkshipId` from required props. Add clerkship dropdown:

```svelte
<div class="space-y-2">
  <Label for="clerkship">Clerkship *</Label>
  <select
    id="clerkship"
    bind:value={selectedClerkshipId}
    required
    class="w-full rounded-md border px-3 py-2"
  >
    <option value="">Select a clerkship...</option>
    {#each clerkships as clerkship}
      <option value={clerkship.id}>{clerkship.name}</option>
    {/each}
  </select>
</div>
```

### 9.2 Add site selection
Add site multi-select (filtered by clerkship's associated sites):

```svelte
<div class="space-y-2">
  <Label>Sites *</Label>
  <div class="max-h-40 overflow-y-auto border rounded-md p-2">
    {#each availableSites as site}
      <label class="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          checked={selectedSiteIds.includes(site.id)}
          onchange={() => toggleSite(site.id)}
        />
        <span>{site.name}</span>
      </label>
    {/each}
  </div>
  <p class="text-sm text-gray-500">Select at least one site</p>
</div>
```

### 9.3 Filter preceptors by selected sites
When sites change, reload available preceptors from `/api/preceptors/teams/available-preceptors?siteIds=...`

### 9.4 Remove require_same_site checkbox
Remove the "Require Same Site" checkbox from formation rules.

### 9.5 Load available sites based on clerkship
When clerkship is selected, fetch sites via `/api/clerkship-sites?clerkship_id=...`

---

## Step 10: Remove Site Associations Tab

### 10.1 Update main page
**File:** `src/routes/preceptors/+page.svelte`

Remove the "Site Associations" tab button and content:

```svelte
// Remove this tab button:
<button onclick={() => (activeTab = 'associations')}>Site Associations</button>

// Remove this content section:
{:else if activeTab === 'associations'}
  <PreceptorAssociationsForm />
{/if}

// Update activeTab type:
let activeTab = $state<'preceptors' | 'teams'>('preceptors');
```

### 10.2 Remove PreceptorAssociationsForm import
Remove the import statement for the component.

### 10.3 Optionally delete the component file
**Delete:** `src/lib/features/scheduling-config/components/preceptor-associations-form.svelte`

Or keep it if it might be useful elsewhere.

---

## Step 11: Create Teams Configuration Route

### 11.1 Create route structure
**Create:** `src/routes/preceptors/teams/[id]/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const teamId = params.id;

  const [teamRes, clerkshipsRes, sitesRes, preceptorsRes] = await Promise.all([
    fetch(`/api/preceptors/teams/${teamId}`),
    fetch('/api/clerkships'),
    fetch('/api/sites'),
    fetch('/api/preceptors')
  ]);

  if (!teamRes.ok) {
    throw error(404, 'Team not found');
  }

  const team = await teamRes.json();
  const clerkships = await clerkshipsRes.json();
  const sites = await sitesRes.json();
  const preceptors = await preceptorsRes.json();

  return {
    team: team.data,
    clerkships: clerkships.data,
    sites: sites.data,
    preceptors: preceptors.data
  };
};
```

### 11.2 Create page component
**Create:** `src/routes/preceptors/teams/[id]/+page.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';

  let { data } = $props();

  let team = $state(data.team);
  let selectedSiteIds = $state(team.sites?.map(s => s.id) || []);
  let members = $state(team.members || []);

  // Available sites (filtered by clerkship)
  let availableSites = $derived(
    data.sites.filter(s =>
      data.clerkshipSites?.some(cs => cs.site_id === s.id && cs.clerkship_id === team.clerkship_id)
    )
  );

  // Available preceptors (filtered by selected sites)
  let availablePreceptors = $state([]);

  async function loadAvailablePreceptors() {
    const url = selectedSiteIds.length > 0
      ? `/api/preceptors/teams/available-preceptors?siteIds=${selectedSiteIds.join(',')}`
      : '/api/preceptors';
    const res = await fetch(url);
    const data = await res.json();
    availablePreceptors = data.data;
  }

  async function handleSave() {
    const res = await fetch(`/api/preceptors/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: team.name,
        siteIds: selectedSiteIds,
        members: members.map((m, i) => ({
          preceptorId: m.preceptor_id,
          role: m.role,
          priority: i + 1
        })),
        requireSameHealthSystem: team.require_same_health_system,
        requiresAdminApproval: team.requires_admin_approval
      })
    });

    if (res.ok) {
      goto('/preceptors?tab=teams');
    }
  }
</script>

<div class="container mx-auto py-6 max-w-4xl">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold">Configure Team</h1>
      <p class="text-gray-600">
        {team.clerkship_name} • {team.name || 'Unnamed Team'}
      </p>
    </div>
    <Button variant="outline" onclick={() => goto('/preceptors?tab=teams')}>
      Back to Teams
    </Button>
  </div>

  <div class="space-y-6">
    <!-- Team Name -->
    <div class="space-y-2">
      <Label for="name">Team Name (optional)</Label>
      <Input id="name" bind:value={team.name} placeholder="e.g., Morning Team" />
    </div>

    <!-- Clerkship (read-only) -->
    <div class="space-y-2">
      <Label>Clerkship</Label>
      <p class="text-sm bg-gray-100 px-3 py-2 rounded">{team.clerkship_name}</p>
    </div>

    <!-- Sites -->
    <div class="space-y-2">
      <Label>Sites</Label>
      <div class="border rounded-md p-3 max-h-40 overflow-y-auto">
        {#each availableSites as site}
          <label class="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={selectedSiteIds.includes(site.id)}
              onchange={() => {
                if (selectedSiteIds.includes(site.id)) {
                  selectedSiteIds = selectedSiteIds.filter(id => id !== site.id);
                } else {
                  selectedSiteIds = [...selectedSiteIds, site.id];
                }
                loadAvailablePreceptors();
              }}
            />
            <span>{site.name}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Formation Rules -->
    <div class="space-y-2">
      <Label>Formation Rules</Label>
      <div class="space-y-2">
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={team.require_same_health_system} />
          <span>Require Same Health System</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={team.requires_admin_approval} />
          <span>Requires Admin Approval</span>
        </label>
      </div>
    </div>

    <!-- Team Members -->
    <div class="space-y-2">
      <Label>Team Members</Label>
      <!-- Member list with add/remove/reorder functionality -->
      <!-- Similar to existing team-form-dialog member management -->
    </div>

    <!-- Save Button -->
    <div class="flex justify-end gap-2">
      <Button variant="outline" onclick={() => goto('/preceptors?tab=teams')}>Cancel</Button>
      <Button onclick={handleSave}>Save Changes</Button>
    </div>
  </div>
</div>
```

---

## Step 12: Update Preceptors Page Load Function

### 12.1 Update data loading
**File:** `src/routes/preceptors/+page.ts`

```typescript
export const load: PageLoad = async ({ fetch }) => {
  const [preceptorsRes, healthSystemsRes, sitesRes, clerkshipsRes, teamsRes] = await Promise.all([
    fetch('/api/preceptors'),  // Now returns enriched data
    fetch('/api/health-systems'),
    fetch('/api/sites'),
    fetch('/api/clerkships'),
    fetch('/api/preceptors/teams')  // All teams (no clerkship filter)
  ]);

  // ... process responses

  return {
    preceptors,
    healthSystems,
    sites,
    clerkships,
    teams
  };
};
```

---

## Step 13: Update Main Preceptors Page

### 13.1 Update Teams tab
**File:** `src/routes/preceptors/+page.svelte`

- Remove clerkship dropdown requirement for viewing teams
- Add "Add Team" button that opens modal with clerkship selection
- Use table-based TeamList component
- Pass filter controls to TeamList

---

## Step 14: Fix Tests

### 14.1 Update team service tests
**File:** `src/lib/features/scheduling-config/schemas/teams.schemas.test.ts`

- Remove `requireSameSite` tests
- Add `siteIds` validation tests

### 14.2 Update API tests
**Files:**
- `e2e/api/preceptors.api.test.ts` - Update for multi-site
- `e2e/ui/teams.ui.test.ts` - Update for new UI

### 14.3 Update integration tests
- Update any tests that reference `site_id` on preceptors
- Update team creation tests

---

## Step 15: Fix Build and Type Errors

### 15.1 Run checks
```bash
npm run check
npm run build
```

### 15.2 Fix any TypeScript errors
- Update type definitions
- Fix component props

---

## Files Changed Summary

### New Files:
- `src/lib/db/migrations/016_preceptor_multi_site.ts`
- `src/routes/preceptors/teams/[id]/+page.server.ts`
- `src/routes/preceptors/teams/[id]/+page.svelte`
- `src/routes/api/preceptors/teams/available-preceptors/+server.ts`

### Modified Files:
- `src/lib/db/types.ts`
- `src/lib/db/migrations/index.ts`
- `src/lib/features/preceptors/services/preceptor-service.ts`
- `src/lib/features/preceptors/components/preceptor-list.svelte`
- `src/lib/features/preceptors/components/preceptor-form.svelte`
- `src/lib/features/scheduling-config/services/teams.service.ts`
- `src/lib/features/teams/components/team-list.svelte`
- `src/lib/features/teams/components/team-form-dialog.svelte`
- `src/routes/preceptors/+page.svelte`
- `src/routes/preceptors/+page.ts`
- `src/routes/api/preceptors/+server.ts`
- `src/routes/api/preceptors/teams/+server.ts`
- `src/routes/api/preceptors/teams/[id]/+server.ts`

### Potentially Deleted:
- `src/lib/features/scheduling-config/components/preceptor-associations-form.svelte`

---

## Testing Checklist
- [ ] Migration runs successfully
- [ ] Preceptor CRUD works with multi-site
- [ ] Preceptor list shows health system, sites, clerkships, teams
- [ ] Teams table displays correctly
- [ ] Team filter by clerkship works
- [ ] Team creation modal has clerkship and site selection
- [ ] Team member list filters by site
- [ ] Teams configuration route works
- [ ] Site Associations tab is removed
- [ ] Navigation links work correctly
- [ ] All TypeScript/Svelte checks pass
- [ ] Build succeeds
- [ ] Related tests pass
