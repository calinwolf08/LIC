<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import GlobalDefaultsForm from '$lib/features/scheduling-config/components/global-defaults-form.svelte';
	import PreceptorAssociationsForm from '$lib/features/scheduling-config/components/preceptor-associations-form.svelte';
	import StudentOnboardingForm from '$lib/features/scheduling-config/components/student-onboarding-form.svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<
		| 'clerkships'
		| 'global-defaults'
		| 'associations'
		| 'onboarding'
		| 'health-systems'
		| 'execute'
	>('clerkships');

	function handleClerkshipConfigure(clerkshipId: string) {
		goto(`/scheduling-config/clerkships/${clerkshipId}`);
	}

	function handleExecuteScheduling() {
		activeTab = 'execute';
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Scheduling Configuration</h1>
		<p class="mt-2 text-muted-foreground">
			Configure clerkships, global defaults, preceptor associations, student onboarding, and
			execute the scheduling engine.
		</p>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => (activeTab = 'clerkships')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'clerkships'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Clerkships
			</button>
			<button
				onclick={() => (activeTab = 'global-defaults')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'global-defaults'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Global Defaults
			</button>
			<button
				onclick={() => (activeTab = 'associations')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'associations'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Preceptor Associations
			</button>
			<button
				onclick={() => (activeTab = 'onboarding')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'onboarding'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Student Onboarding
			</button>
			<button
				onclick={() => (activeTab = 'health-systems')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'health-systems'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Health Systems
			</button>
			<button
				onclick={() => (activeTab = 'execute')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'execute'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Execute
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'clerkships'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Clerkship Configurations</h2>
				<p class="text-sm text-muted-foreground">
					Configure scheduling strategies, requirements, and teams for each clerkship
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each data.clerkships as clerkship}
					{#if clerkship.id}
						{@const clerkshipId = clerkship.id}
						<div class="rounded-lg border p-4 hover:border-primary transition-colors">
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<h3 class="font-semibold">{clerkship.name}</h3>
									{#if clerkship.specialty}
										<p class="mt-1 text-sm text-muted-foreground">{clerkship.specialty}</p>
									{/if}
									<div class="mt-2 flex items-center gap-2">
										<span
											class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {clerkship.clerkship_type ===
											'inpatient'
												? 'bg-blue-100 text-blue-700'
												: 'bg-green-100 text-green-700'}"
										>
											{clerkship.clerkship_type === 'inpatient' ? 'Inpatient' : 'Outpatient'}
										</span>
										<p class="text-sm text-muted-foreground">
											{clerkship.required_days} days
										</p>
									</div>
								</div>
							</div>
							<div class="mt-4 flex gap-2">
								<Button size="sm" onclick={() => handleClerkshipConfigure(clerkshipId)}>
									Configure
								</Button>
							</div>
						</div>
					{/if}
				{/each}
			</div>

			{#if data.clerkships.length === 0}
				<div class="py-12 text-center text-muted-foreground">
					<p>No clerkships found. Create clerkships first in the Clerkships page.</p>
					<Button class="mt-4" onclick={() => goto('/clerkships')}>Go to Clerkships</Button>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'global-defaults'}
		<GlobalDefaultsForm />
	{:else if activeTab === 'associations'}
		<PreceptorAssociationsForm />
	{:else if activeTab === 'onboarding'}
		<StudentOnboardingForm />
	{:else if activeTab === 'health-systems'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Health Systems</h2>
				<Button>Add Health System</Button>
			</div>

			<div class="rounded-lg border p-8 text-center text-muted-foreground">
				<p>Health system management coming soon.</p>
				<p class="mt-2 text-sm">Configure health systems, sites, and organizational structure.</p>
			</div>
		</div>
	{:else if activeTab === 'execute'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Execute Scheduling Engine</h2>
			</div>

			<div class="rounded-lg border p-8 text-center text-muted-foreground">
				<p>Scheduling execution interface coming soon.</p>
				<p class="mt-2 text-sm">
					Execute the configurable scheduling engine with custom options.
				</p>
			</div>
		</div>
	{/if}
</div>
