<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'overview' | 'requirements' | 'teams' | 'capacity'>('overview');

	async function handleAddRequirement() {
		// Add requirement logic
		console.log('Add requirement');
	}

	async function handleAddTeam() {
		// Add team logic
		console.log('Add team');
	}

	function formatStrategy(strategy: string): string {
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
			Configure scheduling strategies, requirements, teams, and capacity rules
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
				onclick={() => (activeTab = 'teams')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'teams'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Teams ({data.configuration.teams?.length || 0})
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
				<div class="mt-4 grid gap-4 md:grid-cols-3">
					<div>
						<p class="text-sm text-muted-foreground">Total Required Days</p>
						<p class="text-2xl font-bold">{data.configuration.totalRequiredDays}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Requirements</p>
						<p class="text-2xl font-bold">{data.configuration.requirements.length}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Configured Teams</p>
						<p class="text-2xl font-bold">{data.configuration.teams?.length || 0}</p>
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
	{:else if activeTab === 'teams'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Preceptor Teams</h2>
				<Button onclick={handleAddTeam}>Add Team</Button>
			</div>

			{#if data.configuration.teams && data.configuration.teams.length > 0}
				<div class="space-y-4">
					{#each data.configuration.teams as team}
						<div class="rounded-lg border p-6">
							<div class="mb-4 flex items-start justify-between">
								<div>
									<h3 class="text-lg font-semibold">{team.name}</h3>
									{#if team.description}
										<p class="text-sm text-muted-foreground">{team.description}</p>
									{/if}
								</div>
								<div class="flex gap-2">
									<Button size="sm" variant="outline">Edit</Button>
									<Button size="sm" variant="outline">Delete</Button>
								</div>
							</div>

							<div class="text-sm">
								<p class="mb-2 font-medium">Formation Rules:</p>
								<ul class="ml-4 space-y-1 text-muted-foreground">
									{#if team.require_same_health_system}
										<li>✓ Same health system required</li>
									{/if}
									{#if team.require_same_site}
										<li>✓ Same site required</li>
									{/if}
									{#if team.require_same_specialty}
										<li>✓ Same specialty required</li>
									{/if}
									{#if team.requires_admin_approval}
										<li>⚠ Requires admin approval</li>
									{/if}
								</ul>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border p-12 text-center text-muted-foreground">
					<p>No teams configured for this clerkship.</p>
					<p class="mt-2 text-sm">
						Teams allow multiple preceptors to share teaching responsibilities.
					</p>
					<Button class="mt-4" onclick={handleAddTeam}>Create First Team</Button>
				</div>
			{/if}
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
