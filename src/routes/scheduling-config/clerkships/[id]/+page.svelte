<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'overview' | 'requirements' | 'capacity'>('overview');
	let showAddRequirementModal = $state(false);

	// Form state for new requirement
	let newRequirement = $state({
		requirementType: 'outpatient' as 'outpatient' | 'inpatient' | 'elective',
		requiredDays: 20,
		allowCrossSystem: false,
		overrideMode: 'inherit' as 'inherit' | 'override_fields' | 'override_section',
		overrideAssignmentStrategy: undefined as 'continuous_single' | 'continuous_team' | 'block_based' | 'daily_rotation' | undefined,
		overrideHealthSystemRule: undefined as 'enforce_same_system' | 'prefer_same_system' | 'no_preference' | undefined
	});

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	async function handleAddRequirement() {
		showAddRequirementModal = true;
	}

	async function handleSubmitRequirement() {
		isSubmitting = true;
		error = null;

		try {
			const response = await fetch('/api/scheduling-config/requirements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clerkshipId: data.configuration.clerkshipId,
					...newRequirement
				})
			});

			const result = await response.json();

			if (!response.ok) {
				error = result.error?.message || 'Failed to create requirement';
				return;
			}

			// Reset form and close modal
			showAddRequirementModal = false;
			newRequirement = {
				requirementType: 'outpatient',
				requiredDays: 20,
				allowCrossSystem: false,
				overrideMode: 'inherit',
				overrideAssignmentStrategy: undefined,
				overrideHealthSystemRule: undefined
			};

			// Refresh data
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create requirement';
		} finally {
			isSubmitting = false;
		}
	}

	function handleCancelRequirement() {
		showAddRequirementModal = false;
		error = null;
	}

	function formatStrategy(strategy: string | undefined): string {
		if (!strategy) return 'Not configured';
		return strategy
			.split('_')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
</script>

<div class="container mx-auto py-8">
	<!-- Header -->
	<div class="mb-6">
		<Button variant="ghost" onclick={() => goto('/scheduling-config')} class="mb-4">
			← Back to Configurations
		</Button>
		<h1 class="text-3xl font-bold">{data.configuration.clerkshipName}</h1>
		<p class="mt-2 text-muted-foreground">
			Configure scheduling strategies, requirements, and capacity rules
		</p>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'overview')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'overview'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Overview
			</button>
			<button
				onclick={() => (activeTab = 'requirements')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'requirements'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Requirements ({data.configuration.requirements.length})
			</button>
			<button
				onclick={() => (activeTab = 'capacity')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'capacity'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Capacity Rules
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'overview'}
		<div class="space-y-6">
			<!-- Summary Card -->
			<div class="rounded-lg border p-6">
				<h2 class="text-xl font-semibold">Configuration Summary</h2>
				<div class="mt-4 grid gap-4 md:grid-cols-2">
					<div>
						<p class="text-sm text-muted-foreground">Total Required Days</p>
						<p class="text-2xl font-bold">{data.configuration.totalRequiredDays}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Requirements</p>
						<p class="text-2xl font-bold">{data.configuration.requirements.length}</p>
					</div>
				</div>
			</div>

			<!-- Requirements Overview -->
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-xl font-semibold">Requirements</h2>
				<div class="space-y-3">
					{#each data.configuration.requirements as req}
						<div class="rounded border p-4">
							<div class="flex items-start justify-between">
								<div>
									<h3 class="font-semibold capitalize">
										{req.requirement.requirement_type}
									</h3>
									<p class="text-sm text-muted-foreground">
										{req.requirement.required_days} days required
									</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-medium">
										Strategy: {formatStrategy(req.resolvedConfig.assignmentStrategy)}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatStrategy(req.resolvedConfig.healthSystemRule)}
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else if activeTab === 'requirements'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Requirements Configuration</h2>
				<Button onclick={handleAddRequirement}>Add Requirement</Button>
			</div>

			<div class="space-y-4">
				{#each data.configuration.requirements as req}
					<div class="rounded-lg border p-6">
						<div class="mb-4 flex items-start justify-between">
							<div>
								<h3 class="text-lg font-semibold capitalize">
									{req.requirement.requirement_type}
								</h3>
								<p class="text-sm text-muted-foreground">
									ID: {req.requirement.id}
								</p>
							</div>
							<div class="flex gap-2">
								<Button size="sm" variant="outline">Edit</Button>
								<Button size="sm" variant="outline">Delete</Button>
							</div>
						</div>

						<div class="grid gap-4 md:grid-cols-2">
							<div>
								<h4 class="mb-2 text-sm font-medium">Basic Settings</h4>
								<dl class="space-y-2 text-sm">
									<div>
										<dt class="text-muted-foreground">Required Days</dt>
										<dd class="font-medium">{req.requirement.required_days}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Override Mode</dt>
										<dd class="font-medium">{req.requirement.override_mode}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Allow Cross-System</dt>
										<dd class="font-medium">
											{#if req.requirement.allow_cross_system === 1}
												<span class="text-green-600">✓ Enabled</span>
											{:else}
												<span class="text-muted-foreground">✗ Disabled</span>
											{/if}
										</dd>
									</div>
								</dl>
							</div>

							<div>
								<h4 class="mb-2 text-sm font-medium">Resolved Configuration</h4>
								<dl class="space-y-2 text-sm">
									<div>
										<dt class="text-muted-foreground">Assignment Strategy</dt>
										<dd class="font-medium">
											{formatStrategy(req.resolvedConfig.assignmentStrategy)}
										</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Health System Rule</dt>
										<dd class="font-medium">
											{formatStrategy(req.resolvedConfig.healthSystemRule)}
										</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Max Students/Day</dt>
										<dd class="font-medium">{req.resolvedConfig.maxStudentsPerDay}</dd>
									</div>
								</dl>
							</div>
						</div>

						{#if req.electives && req.electives.length > 0}
							<div class="mt-4 border-t pt-4">
								<h4 class="mb-2 text-sm font-medium">Electives ({req.electives.length})</h4>
								<div class="grid gap-2 md:grid-cols-2">
									{#each req.electives as elective}
										<div class="rounded border p-3 text-sm">
											<p class="font-medium">{elective.name}</p>
											{#if elective.specialty}
												<p class="text-xs text-muted-foreground">{elective.specialty}</p>
											{/if}
											<p class="mt-1 text-xs text-muted-foreground">
												{elective.minimum_days} days minimum
											</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else if activeTab === 'capacity'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Capacity Rules</h2>
			</div>

			<div class="rounded-lg border p-12 text-center text-muted-foreground">
				<p>Capacity rules are managed at the preceptor level.</p>
				<p class="mt-2 text-sm">
					View and edit capacity rules in the Preceptors section.
				</p>
				<Button class="mt-4" onclick={() => goto('/preceptors')}>Go to Preceptors</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Add Requirement Modal -->
{#if showAddRequirementModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg">
			<h2 class="mb-4 text-2xl font-bold">Add Requirement</h2>

			{#if error}
				<div class="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleSubmitRequirement(); }} class="space-y-4">
				<!-- Requirement Type -->
				<div>
					<Label for="requirementType">Requirement Type</Label>
					<select
						id="requirementType"
						bind:value={newRequirement.requirementType}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
					>
						<option value="outpatient">Outpatient</option>
						<option value="inpatient">Inpatient</option>
						<option value="elective">Elective</option>
					</select>
				</div>

				<!-- Required Days -->
				<div>
					<Label for="requiredDays">Required Days</Label>
					<Input
						id="requiredDays"
						type="number"
						bind:value={newRequirement.requiredDays}
						min="1"
						required
					/>
				</div>

				<!-- Allow Cross-System -->
				<div class="flex items-center gap-2">
					<input
						type="checkbox"
						id="allowCrossSystem"
						bind:checked={newRequirement.allowCrossSystem}
						class="h-4 w-4 rounded border-gray-300"
					/>
					<Label for="allowCrossSystem" class="cursor-pointer">
						Allow Cross-System Assignments
						<span class="block text-xs font-normal text-muted-foreground">
							Students can be assigned across different health systems for this requirement
						</span>
					</Label>
				</div>

				<!-- Override Mode -->
				<div>
					<Label for="overrideMode">Override Mode</Label>
					<select
						id="overrideMode"
						bind:value={newRequirement.overrideMode}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
					>
						<option value="inherit">Inherit from Clerkship</option>
						<option value="override_fields">Override Specific Fields</option>
						<option value="override_section">Override All Settings</option>
					</select>
				</div>

				{#if newRequirement.overrideMode !== 'inherit'}
					<!-- Assignment Strategy -->
					<div>
						<Label for="assignmentStrategy">Assignment Strategy</Label>
						<select
							id="assignmentStrategy"
							bind:value={newRequirement.overrideAssignmentStrategy}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value={undefined}>-- Use Default --</option>
							<option value="continuous_single">Continuous Single</option>
							<option value="continuous_team">Continuous Team</option>
							<option value="block_based">Block Based</option>
							<option value="daily_rotation">Daily Rotation</option>
						</select>
					</div>

					<!-- Health System Rule -->
					<div>
						<Label for="healthSystemRule">Health System Rule</Label>
						<select
							id="healthSystemRule"
							bind:value={newRequirement.overrideHealthSystemRule}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value={undefined}>-- Use Default --</option>
							<option value="enforce_same_system">Enforce Same System</option>
							<option value="prefer_same_system">Prefer Same System</option>
							<option value="no_preference">No Preference</option>
						</select>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex justify-end gap-2 pt-4">
					<Button
						type="button"
						variant="outline"
						onclick={handleCancelRequirement}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'Creating...' : 'Create Requirement'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
