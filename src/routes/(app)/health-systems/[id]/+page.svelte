<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
	import { ConfirmDialog } from '$lib/components';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'details' | 'dependencies'>('details');

	// Form state
	let successMessage = $state<string | null>(null);
	let showDeleteConfirm = $state(false);

	async function handleFormSuccess() {
		successMessage = 'Health system updated successfully';
		await invalidateAll();
		setTimeout(() => {
			successMessage = null;
		}, 3000);
	}

	async function handleDelete() {
		const response = await fetch(`/api/health-systems/${data.healthSystem.id}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete health system');
		}
		goto('/health-systems');
	}
</script>

<svelte:head>
	<title>{data.healthSystem.name} | Health Systems | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<!-- Breadcrumb -->
	<nav class="mb-6 text-sm text-muted-foreground">
		<a href="/health-systems" class="hover:underline">Health Systems</a>
		<span class="mx-2">/</span>
		<span>{data.healthSystem.name}</span>
	</nav>

	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold">{data.healthSystem.name}</h1>
		{#if data.healthSystem.location}
			<p class="mt-1 text-muted-foreground">{data.healthSystem.location}</p>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'details')}
				class={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
					activeTab === 'details'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Details
			</button>
			<button
				onclick={() => (activeTab = 'dependencies')}
				class={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
					activeTab === 'dependencies'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Dependencies
				<span class="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
					{data.dependencies.sites.length + data.dependencies.preceptors.length}
				</span>
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'details'}
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Health System Information</h2>

			{#if successMessage}
				<div class="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
					{successMessage}
				</div>
			{/if}

			<div class="max-w-xl">
				<HealthSystemForm healthSystem={data.healthSystem} onSuccess={handleFormSuccess} />
			</div>

			<div class="mt-6 border-t pt-6">
				<h3 class="mb-2 text-sm font-medium text-muted-foreground">Additional Information</h3>
				<dl class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<dt class="text-muted-foreground">Created</dt>
						<dd>{new Date(String(data.healthSystem.created_at)).toLocaleDateString()}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Last Updated</dt>
						<dd>{new Date(String(data.healthSystem.updated_at)).toLocaleDateString()}</dd>
					</div>
				</dl>
			</div>
		</Card>

		<!-- Danger Zone -->
		<Card class="mt-6 border-red-200 p-6">
			<h2 class="mb-4 text-xl font-semibold text-red-600">Danger Zone</h2>

			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium">Delete this health system</p>
					<p class="text-sm text-muted-foreground">This action cannot be undone.</p>
				</div>

				<div class="group relative">
					<Button
						variant="destructive"
						disabled={!data.canDelete}
						onclick={() => (showDeleteConfirm = true)}
					>
						Delete Health System
					</Button>
					{#if !data.canDelete}
						<div class="absolute right-0 bottom-full z-50 mb-2 hidden group-hover:block">
							<div
								class="max-w-[300px] min-w-[200px] rounded-lg bg-gray-900 px-3 py-2 text-xs whitespace-pre-line text-white"
							>
								{data.deleteTooltip}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</Card>
	{:else if activeTab === 'dependencies'}
		<div class="space-y-6">
			<!-- Sites Section -->
			<Card class="p-6">
				<h2 class="mb-4 text-xl font-semibold">
					Sites
					<span class="ml-2 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm">
						{data.dependencies.sites.length}
					</span>
				</h2>

				{#if data.dependencies.sites.length === 0}
					<p class="text-muted-foreground">No sites associated with this health system.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full border-collapse">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="px-4 py-2 text-left text-sm font-medium">Name</th>
									<th class="px-4 py-2 text-left text-sm font-medium">Address</th>
									<th class="px-4 py-2 text-left text-sm font-medium">Action</th>
								</tr>
							</thead>
							<tbody>
								{#each data.dependencies.sites as site}
									<tr class="border-b hover:bg-muted/50">
										<td class="px-4 py-2 text-sm">{site.name}</td>
										<td class="px-4 py-2 text-sm text-muted-foreground">{site.address || '—'}</td>
										<td class="px-4 py-2 text-sm">
											<Button size="sm" variant="ghost" onclick={() => goto(`/sites/${site.id}`)}>
												View →
											</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>

			<!-- Preceptors Section -->
			<Card class="p-6">
				<h2 class="mb-4 text-xl font-semibold">
					Preceptors
					<span class="ml-2 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm">
						{data.dependencies.preceptors.length}
					</span>
				</h2>

				{#if data.dependencies.preceptors.length === 0}
					<p class="text-muted-foreground">No preceptors associated with this health system.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full border-collapse">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="px-4 py-2 text-left text-sm font-medium">Name</th>
									<th class="px-4 py-2 text-left text-sm font-medium">Email</th>
									<th class="px-4 py-2 text-left text-sm font-medium">Action</th>
								</tr>
							</thead>
							<tbody>
								{#each data.dependencies.preceptors as preceptor}
									<tr class="border-b hover:bg-muted/50">
										<td class="px-4 py-2 text-sm">{preceptor.name}</td>
										<td class="px-4 py-2 text-sm text-muted-foreground">{preceptor.email || '—'}</td
										>
										<td class="px-4 py-2 text-sm">
											<Button
												size="sm"
												variant="ghost"
												onclick={() => goto(`/preceptors/${preceptor.id}`)}
											>
												View →
											</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>

			<!-- Student Onboarding Note -->
			{#if data.dependencyCounts.studentOnboarding > 0}
				<Card class="border-yellow-200 bg-yellow-50 p-6">
					<h2 class="mb-2 text-xl font-semibold text-yellow-800">
						Student Onboarding Records
						<span
							class="ml-2 inline-flex items-center rounded-full bg-yellow-200 px-2.5 py-0.5 text-sm"
						>
							{data.dependencyCounts.studentOnboarding}
						</span>
					</h2>
					<p class="text-sm text-yellow-700">
						There are {data.dependencyCounts.studentOnboarding} student onboarding record{data
							.dependencyCounts.studentOnboarding > 1
							? 's'
							: ''} for this health system. These will be automatically deleted if the health system
						is deleted.
					</p>
				</Card>
			{/if}
		</div>
	{/if}
</div>

<!-- Delete Confirmation -->
<ConfirmDialog
	bind:open={showDeleteConfirm}
	title={`Delete ${data.healthSystem.name}?`}
	description="This action cannot be undone."
	confirmLabel="Delete"
	onConfirm={handleDelete}
>
	{#snippet details()}
		{#if data.dependencyCounts.studentOnboarding > 0}
			<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
				This will also delete {data.dependencyCounts.studentOnboarding} student onboarding record{data
					.dependencyCounts.studentOnboarding > 1
					? 's'
					: ''}.
			</p>
		{/if}
	{/snippet}
</ConfirmDialog>
