<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Clerkship basic info (editable)
	let name = $state(data.clerkship?.name || '');
	let clerkshipType = $state(data.clerkship?.clerkship_type || 'outpatient');
	let requiredDays = $state(data.clerkship?.required_days || 1);
	let description = $state(data.clerkship?.description || '');

	// Settings (from global defaults or overrides)
	let settings = $state(data.settings || {
		overrideMode: 'inherit',
		assignmentStrategy: 'continuous_single',
		healthSystemRule: 'no_preference',
		maxStudentsPerDay: 1,
		maxStudentsPerYear: 3,
		allowTeams: false,
		allowFallbacks: true,
		fallbackRequiresApproval: false,
		fallbackAllowCrossSystem: false
	});

	let isUsingDefaults = $derived(settings.overrideMode === 'inherit');

	// Status messages
	let basicInfoStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
	let settingsStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);

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

	<div class="space-y-8">
		<!-- Section 1: Basic Information -->
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

		<!-- Section 2: Scheduling Settings -->
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

		<!-- Section 3: Associated Sites -->
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Associated Sites</h2>
			{#if data.sites?.length > 0}
				<div class="space-y-2">
					{#each data.sites as site}
						<div class="flex items-center justify-between p-3 border rounded-md">
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
				<p class="text-muted-foreground">No sites associated with this clerkship.</p>
			{/if}
			<div class="mt-4">
				<Button variant="outline" onclick={() => goto('/sites')}>
					Manage Sites
				</Button>
			</div>
		</Card>

		<!-- Section 4: Preceptor Teams -->
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Preceptor Teams</h2>
			{#if data.teams?.length > 0}
				<div class="space-y-2">
					{#each data.teams as team}
						<div class="flex items-center justify-between p-3 border rounded-md">
							<div>
								<a
									href="/preceptors/teams/{team.id}"
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
				<p class="text-muted-foreground">No teams created for this clerkship.</p>
			{/if}
			<div class="mt-4">
				<Button variant="outline" onclick={() => goto('/preceptors?tab=teams')}>
					Manage Teams
				</Button>
			</div>
		</Card>
	</div>
</div>
