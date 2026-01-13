<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import ElectivesManager from '$lib/features/electives/components/electives-manager.svelte';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'basic-info' | 'scheduling' | 'sites' | 'teams' | 'electives'>('basic-info');

	// Clerkship basic info (editable)
	let name = $state(data.clerkship?.name || '');
	let clerkshipType = $state(data.clerkship?.clerkship_type || 'outpatient');
	let requiredDays = $state(data.clerkship?.required_days || 1);
	let description = $state(data.clerkship?.description || '');

	// Settings (from global defaults or overrides)
	let settings = $state(data.settings || {
		overrideMode: 'inherit',
		assignmentStrategy: 'team_continuity',
		healthSystemRule: 'no_preference',
		maxStudentsPerDay: 1,
		maxStudentsPerYear: 3,
		allowTeams: false,
		allowFallbacks: true,
		fallbackRequiresApproval: false,
		fallbackAllowCrossSystem: false
	});

	let isUsingDefaults = $derived(settings.overrideMode === 'inherit');

	// Associated sites (mutable copy)
	let associatedSites = $state(data.sites || []);

	// Available sites (not already associated)
	let availableSites = $derived(
		(data.allSites || []).filter(
			(site: any) => !associatedSites.some((as: any) => as.id === site.id)
		)
	);

	// Site dependency tracking
	let siteDependencies = $state<Record<string, { teamId: string; teamName: string }[]>>({});
	let removeSiteError = $state<string | null>(null);

	// Add site modal state
	let showAddSiteModal = $state(false);
	let selectedSiteToAdd = $state('');

	// Status messages
	let basicInfoStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let settingsStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	// Load dependencies for associated sites
	async function loadSiteDependencies() {
		const deps: Record<string, { teamId: string; teamName: string }[]> = {};
		for (const site of associatedSites) {
			try {
				const res = await fetch(
					`/api/clerkship-sites/dependencies?clerkship_id=${data.clerkship.id}&site_id=${site.id}`
				);
				if (res.ok) {
					const result = await res.json();
					deps[site.id] = result.data || [];
				}
			} catch {
				// Ignore errors, assume no dependencies
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

	function hasDependencies(siteId: string): boolean {
		return (siteDependencies[siteId]?.length || 0) > 0;
	}

	function getDependencyCount(siteId: string): number {
		return siteDependencies[siteId]?.length || 0;
	}

	async function handleSaveBasicInfo() {
		basicInfoStatus = null;
		try {
			const res = await fetch(`/api/clerkships/${data.clerkship.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					clerkship_type: clerkshipType,
					required_days: requiredDays,
					description: description || undefined
				})
			});

			if (res.ok) {
				basicInfoStatus = { type: 'success', message: 'Basic information saved successfully' };
				setTimeout(() => basicInfoStatus = null, 3000);
			} else {
				const result = await res.json();
				basicInfoStatus = { type: 'error', message: result.error?.message || 'Failed to save' };
			}
		} catch (err) {
			basicInfoStatus = { type: 'error', message: 'Failed to save basic information' };
		}
	}

	async function handleSaveSettings() {
		settingsStatus = null;
		try {
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
				settingsStatus = { type: 'success', message: 'Settings saved successfully' };
				setTimeout(() => settingsStatus = null, 3000);
			} else {
				settingsStatus = { type: 'error', message: 'Failed to save settings' };
			}
		} catch (err) {
			settingsStatus = { type: 'error', message: 'Failed to save settings' };
		}
	}

	async function handleReturnToDefaults() {
		settingsStatus = null;
		try {
			const res = await fetch(`/api/clerkships/${data.clerkship.id}/settings`, {
				method: 'DELETE'
			});

			if (res.ok) {
				// Reload settings (will get defaults for current type)
				const settingsRes = await fetch(`/api/clerkships/${data.clerkship.id}/settings`);
				if (settingsRes.ok) {
					const newSettings = await settingsRes.json();
					settings = newSettings.data;
					settingsStatus = { type: 'success', message: 'Reset to global defaults' };
					setTimeout(() => settingsStatus = null, 3000);
				}
			} else {
				settingsStatus = { type: 'error', message: 'Failed to reset settings' };
			}
		} catch (err) {
			settingsStatus = { type: 'error', message: 'Failed to reset settings' };
		}
	}

	async function handleAddSite() {
		if (!selectedSiteToAdd) return;

		try {
			const res = await fetch('/api/clerkship-sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clerkship_id: data.clerkship.id,
					site_id: selectedSiteToAdd
				})
			});

			if (res.ok) {
				const siteToAdd = data.allSites.find((s: any) => s.id === selectedSiteToAdd);
				if (siteToAdd) {
					associatedSites = [...associatedSites, siteToAdd];
				}
				selectedSiteToAdd = '';
				showAddSiteModal = false;
			}
		} catch (err) {
			// Handle error
		}
	}

	async function handleRemoveSite(siteId: string) {
		removeSiteError = null;

		// Check for dependencies first
		const dependencies = siteDependencies[siteId] || [];
		if (dependencies.length > 0) {
			const teamNames = dependencies.map(d => d.teamName).join(', ');
			removeSiteError = `Cannot remove site. The following teams depend on this site: ${teamNames}. Please update or remove these teams first.`;
			return;
		}

		try {
			const res = await fetch(
				`/api/clerkship-sites?clerkship_id=${data.clerkship.id}&site_id=${siteId}`,
				{ method: 'DELETE' }
			);

			if (res.ok) {
				associatedSites = associatedSites.filter((s: any) => s.id !== siteId);
			}
		} catch (err) {
			// Handle error
		}
	}
</script>

<div class="container mx-auto py-8 max-w-4xl">
	<!-- Header -->
	<div class="mb-6">
		<Button variant="ghost" onclick={() => goto('/clerkships')} class="mb-4">
			← Back to Clerkships
		</Button>
		<h1 class="text-3xl font-bold">Configure Clerkship</h1>
		<p class="mt-2 text-muted-foreground">{data.clerkship?.name || 'Clerkship'}</p>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'basic-info')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'basic-info'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Basic Information
			</button>
			<button
				onclick={() => (activeTab = 'scheduling')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'scheduling'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Scheduling Settings
			</button>
			<button
				onclick={() => (activeTab = 'sites')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'sites'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Allowed Sites ({associatedSites.length})
			</button>
			<button
				onclick={() => (activeTab = 'teams')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'teams'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Preceptor Teams ({data.teams?.length || 0})
			</button>
			<button
				onclick={() => (activeTab = 'electives')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'electives'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Electives
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'basic-info'}
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Basic Information</h2>

			{#if basicInfoStatus}
				<div class="mb-4 rounded border p-3 text-sm {basicInfoStatus.type === 'success' ? 'border-green-500 bg-green-50 text-green-700' : 'border-destructive bg-destructive/10 text-destructive'}">
					{basicInfoStatus.message}
				</div>
			{/if}

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
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
					></textarea>
				</div>

				<div class="flex justify-end">
					<Button onclick={handleSaveBasicInfo}>Save Basic Info</Button>
				</div>
			</div>
		</Card>
	{:else if activeTab === 'scheduling'}
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl font-semibold">Scheduling Settings</h2>
				<div class="flex items-center gap-2">
					{#if isUsingDefaults}
						<Badge variant="secondary">Using Global Defaults</Badge>
					{:else}
						<Badge>Custom Settings</Badge>
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

			{#if settingsStatus}
				<div class="mb-4 rounded border p-3 text-sm {settingsStatus.type === 'success' ? 'border-green-500 bg-green-50 text-green-700' : 'border-destructive bg-destructive/10 text-destructive'}">
					{settingsStatus.message}
				</div>
			{/if}

			<div class="grid gap-6">
				<!-- Assignment Strategy -->
				<div class="space-y-2">
					<Label for="strategy">Assignment Strategy</Label>
					<select
						id="strategy"
						bind:value={settings.assignmentStrategy}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="team_continuity">Team Continuity (Default)</option>
						<option value="continuous_single">Continuous Single</option>
						<option value="continuous_team">Continuous Team</option>
						<option value="block_based">Block Based</option>
						<option value="daily_rotation">Daily Rotation</option>
					</select>
					<p class="text-xs text-muted-foreground">
						{#if settings.assignmentStrategy === 'team_continuity' || settings.assignmentStrategy === 'continuous_single' || settings.assignmentStrategy === 'continuous_team'}
							Maximizes continuity by assigning as many days as possible to the primary preceptor, then fills remaining days with other team members by priority.
						{:else if settings.assignmentStrategy === 'block_based'}
							Divides the rotation into fixed-size blocks (e.g., 2-week blocks) with one preceptor assigned per block. Ideal for inpatient rotations.
						{:else if settings.assignmentStrategy === 'daily_rotation'}
							Rotates through different preceptors day-by-day to provide exposure to varied teaching styles. Days do not need to be consecutive.
						{/if}
					</p>
				</div>

				<!-- Health System Rule -->
				<div class="space-y-2">
					<Label for="health-rule">Health System Rule</Label>
					<select
						id="health-rule"
						bind:value={settings.healthSystemRule}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
		</Card>
	{:else if activeTab === 'sites'}
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl font-semibold">Allowed Sites</h2>
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
					{#each associatedSites as site (site.id)}
						<div class="flex items-center justify-between p-3 border rounded-md">
							<div>
								<a
									href="/sites/{site.id}/edit"
									class="text-blue-600 hover:underline"
								>
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
				<p class="text-muted-foreground text-center py-8">
					No sites associated with this clerkship.
					<br />
					<span class="text-sm">Add sites to define where this clerkship is offered.</span>
				</p>
			{/if}
		</Card>

		<!-- Add Site Modal -->
		{#if showAddSiteModal}
			<div
				class="fixed inset-0 z-50 bg-black/50"
				onclick={() => showAddSiteModal = false}
				role="presentation"
			></div>
			<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
				<Card class="p-6">
					<h3 class="text-lg font-semibold mb-4">Add Site</h3>
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="site-select">Select Site</Label>
							<select
								id="site-select"
								bind:value={selectedSiteToAdd}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								<option value="">Choose a site...</option>
								{#each availableSites as site (site.id)}
									<option value={site.id}>{site.name}</option>
								{/each}
							</select>
						</div>
						{#if availableSites.length === 0}
							<p class="text-sm text-muted-foreground">All sites are already associated with this clerkship.</p>
						{/if}
						<div class="flex justify-end gap-2">
							<Button variant="outline" onclick={() => showAddSiteModal = false}>Cancel</Button>
							<Button onclick={handleAddSite} disabled={!selectedSiteToAdd}>Add</Button>
						</div>
					</div>
				</Card>
			</div>
		{/if}
	{:else if activeTab === 'teams'}
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl font-semibold">Preceptor Teams</h2>
				<Button variant="outline" onclick={() => goto(`/preceptors?tab=teams&fromClerkship=${data.clerkship.id}`)}>
					Manage Teams
				</Button>
			</div>

			{#if data.teams?.length > 0}
				<div class="space-y-2">
					{#each data.teams as team (team.id)}
						<div class="flex items-center justify-between p-3 border rounded-md">
							<div>
								<a
									href="/preceptors/teams/{team.id}?fromClerkship={data.clerkship.id}"
									class="text-blue-600 hover:underline font-medium"
								>
									{team.name || 'Unnamed Team'}
								</a>
								<p class="text-sm text-muted-foreground">
									{team.members?.length || 0} members
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
				<p class="text-muted-foreground text-center py-8">
					No teams created for this clerkship.
					<br />
					<span class="text-sm">Teams can be created on the Preceptors page.</span>
				</p>
			{/if}
		</Card>
	{:else if activeTab === 'electives'}
		<ElectivesManager
			clerkshipId={data.clerkship.id}
			allSites={data.allSites}
		/>
	{/if}
</div>
