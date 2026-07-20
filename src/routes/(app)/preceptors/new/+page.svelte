<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { createPreceptorSchema } from '$lib/features/preceptors/schemas.js';
	import { ZodError } from 'zod';
	import PatternAvailabilityBuilder from '$lib/features/preceptors/components/pattern-availability-builder.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
	import SiteForm from '$lib/features/sites/components/site-form.svelte';

	let { data }: { data: PageData } = $props();

	// Wizard state
	let currentStep = $state(1);
	const totalSteps = 3;

	// Form data
	let formData = $state({
		name: '',
		email: '',
		phone: '',
		health_system_id: '',
		max_students: 1
	});

	let selectedSiteIds = $state<string[]>([]);

	// Created preceptor (after step 2)
	let createdPreceptor = $state<{
		id: string;
		name: string;
		sites: Array<{ id: string; name: string }>;
	} | null>(null);

	// UI state
	let errors = $state<Record<string, string>>({});
	let generalError = $state<string | null>(null);
	let isSubmitting = $state(false);
	let showHealthSystemForm = $state(false);
	let showSiteForm = $state(false);
	let healthSystemsList = $state([...data.healthSystems]);
	let sitesList = $state([...data.sites]);

	// Filter sites by selected health system
	let filteredSites = $derived(
		formData.health_system_id
			? sitesList.filter((s) => s.health_system_id === formData.health_system_id)
			: sitesList
	);

	// Step validation
	let step1Valid = $derived(formData.name.trim() !== '' && formData.email.trim() !== '');
	let step2Valid = $derived(true); // Sites are optional

	// Step descriptions
	const stepInfo = [
		{ number: 1, title: 'Basic Information', description: 'Name, email, and contact details' },
		{ number: 2, title: 'Sites', description: 'Health system and work locations' },
		{ number: 3, title: 'Availability', description: 'Set up availability patterns' }
	];

	function handleHealthSystemChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		if (target.value === '__create_new__') {
			showHealthSystemForm = true;
			formData.health_system_id = '';
		} else {
			// Clear site selection if health system changed
			if (formData.health_system_id !== target.value) {
				selectedSiteIds = [];
			}
		}
	}

	function toggleSite(siteId: string) {
		if (selectedSiteIds.includes(siteId)) {
			selectedSiteIds = selectedSiteIds.filter((id) => id !== siteId);
		} else {
			selectedSiteIds = [...selectedSiteIds, siteId];
		}
	}

	async function handleHealthSystemCreated() {
		try {
			const response = await fetch('/api/health-systems');
			const result = await response.json();
			if (result.success && result.data) {
				healthSystemsList = result.data;
				// Auto-select the most recently created health system
				if (healthSystemsList.length > 0) {
					const newest = healthSystemsList[healthSystemsList.length - 1];
					formData.health_system_id = newest.id;
				}
			}
		} catch (error) {
			console.error('Failed to refresh health systems:', error);
		}
		showHealthSystemForm = false;
	}

	async function handleSiteCreated() {
		try {
			const response = await fetch('/api/sites');
			const result = await response.json();
			if (result.success && result.data) {
				sitesList = result.data;
				// Auto-select the most recently created site
				if (sitesList.length > 0) {
					const newest = sitesList[sitesList.length - 1];
					selectedSiteIds = [...selectedSiteIds, newest.id];
				}
			}
		} catch (error) {
			console.error('Failed to refresh sites:', error);
		}
		showSiteForm = false;
	}

	async function handleNext() {
		errors = {};
		generalError = null;

		if (currentStep === 1) {
			// Validate step 1
			if (!formData.name.trim()) {
				errors.name = 'Name is required';
				return;
			}
			if (!formData.email.trim()) {
				errors.email = 'Email is required';
				return;
			}
			currentStep = 2;
		} else if (currentStep === 2) {
			// Create the preceptor
			await createPreceptor();
		}
	}

	async function createPreceptor() {
		isSubmitting = true;
		errors = {};
		generalError = null;

		try {
			const dataToValidate = {
				...formData,
				site_ids: selectedSiteIds.length > 0 ? selectedSiteIds : undefined
			};

			const validatedData = createPreceptorSchema.parse(dataToValidate);

			const response = await fetch('/api/preceptors', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validatedData)
			});

			const result = await response.json();

			if (!response.ok) {
				const errorData = result.error || {};
				if (errorData.details && Array.isArray(errorData.details)) {
					const fieldErrors: Record<string, string> = {};
					for (const detail of errorData.details) {
						const field = detail.field || detail.path?.[0];
						if (field) {
							fieldErrors[field] = detail.message;
						}
					}
					errors = fieldErrors;
				} else {
					generalError = errorData.message || 'An error occurred';
				}
				return;
			}

			// Get the created preceptor with sites
			const preceptorResponse = await fetch(`/api/preceptors/${result.data.id}`);
			const preceptorResult = await preceptorResponse.json();

			if (preceptorResponse.ok && preceptorResult.data) {
				createdPreceptor = {
					id: preceptorResult.data.id,
					name: preceptorResult.data.name,
					sites: preceptorResult.data.sites || []
				};
				currentStep = 3;
			} else {
				// Fallback - use selected sites
				const selectedSites = sitesList
					.filter((s) => selectedSiteIds.includes(s.id))
					.map((s) => ({ id: s.id, name: s.name }));

				createdPreceptor = {
					id: result.data.id,
					name: result.data.name,
					sites: selectedSites
				};
				currentStep = 3;
			}
		} catch (error) {
			if (error instanceof ZodError) {
				const fieldErrors: Record<string, string> = {};
				for (const issue of error.issues) {
					const field = issue.path[0]?.toString();
					if (field) {
						fieldErrors[field] = issue.message;
					}
				}
				errors = fieldErrors;
			} else {
				generalError = 'An unexpected error occurred';
			}
		} finally {
			isSubmitting = false;
		}
	}

	function handleBack() {
		if (currentStep > 1 && currentStep < 3) {
			currentStep--;
		}
	}

	async function handleAvailabilitySuccess() {
		// Availability saved, navigate to preceptors list
		goto('/preceptors');
	}

	function handleSkipAvailability() {
		// Skip availability setup for now
		goto('/preceptors');
	}

	function handleCancel() {
		goto('/preceptors');
	}
</script>

<div class="container mx-auto py-8 max-w-4xl">
	<div class="mb-6">
		<a href="/preceptors" class="text-sm text-muted-foreground hover:text-foreground">
			&larr; Back to Preceptors
		</a>
		<h1 class="text-3xl font-bold mt-2">Add New Preceptor</h1>
		<p class="text-muted-foreground mt-1">
			Create a new preceptor and set up their availability in one flow.
		</p>
	</div>

	<!-- Progress Steps -->
	<div class="mb-8">
		<div class="flex items-center justify-between">
			{#each stepInfo as step}
				<div class="flex items-center {step.number < totalSteps ? 'flex-1' : ''}">
					<div class="flex flex-col items-center">
						<div
							class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
								{currentStep > step.number
								? 'bg-primary text-primary-foreground'
								: currentStep === step.number
									? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
									: 'bg-muted text-muted-foreground'}"
						>
							{#if currentStep > step.number}
								&#10003;
							{:else}
								{step.number}
							{/if}
						</div>
						<div class="mt-2 text-center">
							<p class="text-sm font-medium {currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground'}">
								{step.title}
							</p>
							<p class="text-xs text-muted-foreground hidden sm:block">{step.description}</p>
						</div>
					</div>
					{#if step.number < totalSteps}
						<div
							class="flex-1 h-1 mx-4 rounded {currentStep > step.number ? 'bg-primary' : 'bg-muted'}"
						></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#if generalError}
		<div class="mb-6 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
			{generalError}
		</div>
	{/if}

	<!-- Step 1: Basic Information -->
	{#if currentStep === 1}
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Basic Information</h2>
			<p class="text-sm text-muted-foreground mb-6">
				Enter the preceptor's contact details.
			</p>

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name *</Label>
					<Input
						id="name"
						type="text"
						bind:value={formData.name}
						placeholder="Dr. John Smith"
						disabled={isSubmitting}
						class={errors.name ? 'border-destructive' : ''}
					/>
					{#if errors.name}
						<p class="text-sm text-destructive">{errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="email">Email *</Label>
					<Input
						id="email"
						type="email"
						bind:value={formData.email}
						placeholder="smith@example.com"
						disabled={isSubmitting}
						class={errors.email ? 'border-destructive' : ''}
					/>
					{#if errors.email}
						<p class="text-sm text-destructive">{errors.email}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="phone">Phone (Optional)</Label>
					<Input
						id="phone"
						type="tel"
						bind:value={formData.phone}
						placeholder="+1 (555) 123-4567"
						disabled={isSubmitting}
						class={errors.phone ? 'border-destructive' : ''}
					/>
					{#if errors.phone}
						<p class="text-sm text-destructive">{errors.phone}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="max_students">Max Students</Label>
					<Input
						id="max_students"
						type="number"
						bind:value={formData.max_students}
						min="1"
						disabled={isSubmitting}
						class={errors.max_students ? 'border-destructive' : ''}
					/>
					<p class="text-xs text-muted-foreground">
						Maximum number of students this preceptor can supervise at once.
					</p>
					{#if errors.max_students}
						<p class="text-sm text-destructive">{errors.max_students}</p>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	<!-- Step 2: Health System & Sites -->
	{#if currentStep === 2}
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Health System & Sites</h2>
			<p class="text-sm text-muted-foreground mb-6">
				Select where this preceptor works. This helps with scheduling and team assignment.
			</p>

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="health_system_id">Health System (Optional)</Label>
					<select
						id="health_system_id"
						bind:value={formData.health_system_id}
						onchange={handleHealthSystemChange}
						disabled={isSubmitting}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.health_system_id ? 'border-destructive' : ''}"
					>
						<option value="">Select a health system...</option>
						{#each healthSystemsList as hs}
							<option value={hs.id}>{hs.name}</option>
						{/each}
						<option value="__create_new__" class="font-semibold text-primary">
							+ Create New Health System
						</option>
					</select>
					{#if errors.health_system_id}
						<p class="text-sm text-destructive">{errors.health_system_id}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label>Sites (Optional)</Label>
					<p class="text-xs text-muted-foreground mb-2">
						Select the clinical locations where this preceptor works.
					</p>
					<div class="max-h-48 overflow-y-auto rounded-md border border-input p-2">
						{#if filteredSites.length === 0}
							<p class="text-sm text-muted-foreground py-2">
								{#if sitesList.length === 0}
									No sites exist yet. Create a site first using the button below.
								{:else if formData.health_system_id}
									No sites found for this health system. Create one or select a different health system.
								{:else}
									Select a health system to see available sites, or create a new site.
								{/if}
							</p>
						{:else}
							{#each filteredSites as site}
								<label class="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-1 cursor-pointer">
									<input
										type="checkbox"
										checked={selectedSiteIds.includes(site.id)}
										onchange={() => toggleSite(site.id)}
										disabled={isSubmitting}
										class="h-4 w-4 rounded border-gray-300"
									/>
									<span class="text-sm">{site.name}</span>
								</label>
							{/each}
						{/if}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => (showSiteForm = true)}
						disabled={isSubmitting}
					>
						+ Create New Site
					</Button>
					{#if selectedSiteIds.length > 0}
						<p class="text-sm text-muted-foreground">
							{selectedSiteIds.length} site{selectedSiteIds.length === 1 ? '' : 's'} selected
						</p>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	<!-- Step 3: Availability -->
	{#if currentStep === 3 && createdPreceptor}
		<Card class="p-6">
			<div class="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
				<p class="text-sm text-green-800 dark:text-green-200">
					<strong>{createdPreceptor.name}</strong> has been created. Now set up their availability to include them in schedule generation.
				</p>
			</div>

			{#if createdPreceptor.sites.length === 0}
				<div class="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
					<p class="text-sm text-yellow-800 dark:text-yellow-200">
						<strong>Note:</strong> No sites are assigned to this preceptor. You'll need to assign sites before setting up availability patterns.
					</p>
					<Button
						variant="outline"
						size="sm"
						class="mt-2"
						onclick={() => goto(`/preceptors`)}
					>
						Go to Preceptors List
					</Button>
				</div>
			{:else}
				<PatternAvailabilityBuilder
					preceptor={createdPreceptor}
					onSuccess={handleAvailabilitySuccess}
					onCancel={handleSkipAvailability}
				/>
			{/if}
		</Card>

		{#if createdPreceptor.sites.length > 0}
			<div class="mt-4 text-center">
				<button
					type="button"
					class="text-sm text-muted-foreground hover:text-foreground underline"
					onclick={handleSkipAvailability}
				>
					Skip for now - I'll set up availability later
				</button>
			</div>
		{/if}
	{/if}

	<!-- Navigation Buttons -->
	{#if currentStep < 3}
		<div class="flex justify-between mt-6">
			<div>
				{#if currentStep > 1}
					<Button type="button" variant="outline" onclick={handleBack} disabled={isSubmitting}>
						&larr; Back
					</Button>
				{:else}
					<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
						Cancel
					</Button>
				{/if}
			</div>
			<Button
				type="button"
				onclick={handleNext}
				disabled={isSubmitting || (currentStep === 1 && !step1Valid)}
			>
				{#if isSubmitting}
					{currentStep === 2 ? 'Creating Preceptor...' : 'Loading...'}
				{:else if currentStep === 2}
					Create & Continue
				{:else}
					Next &rarr;
				{/if}
			</Button>
		</div>
	{/if}
</div>

<!-- Nested Health System Form Modal -->
{#if showHealthSystemForm}
	<div
		class="fixed inset-0 z-[60] bg-black/50"
		onclick={() => (showHealthSystemForm = false)}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<HealthSystemForm
			onSuccess={handleHealthSystemCreated}
			onCancel={() => (showHealthSystemForm = false)}
		/>
	</div>
{/if}

<!-- Nested Site Form Modal -->
{#if showSiteForm}
	<div
		class="fixed inset-0 z-[60] bg-black/50"
		onclick={() => (showSiteForm = false)}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<SiteForm
			healthSystems={healthSystemsList}
			onSuccess={handleSiteCreated}
			onCancel={() => (showSiteForm = false)}
		/>
	</div>
{/if}
