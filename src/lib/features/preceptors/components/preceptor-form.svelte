<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createPreceptorSchema, updatePreceptorSchema } from '../schemas.js';
	import { ZodError } from 'zod';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
	import SiteForm from '$lib/features/sites/components/site-form.svelte';

	// Accept preceptor in either format (with site_ids or sites array)
	interface PreceptorInput {
		id?: string;
		name: string;
		email: string;
		phone?: string | null;
		health_system_id?: string | null;
		max_students?: number;
		site_ids?: string[];
		sites?: Array<{ id: string; name: string }>;
	}

	interface Props {
		preceptor?: PreceptorInput;
		healthSystems: Array<{ id: string; name: string }>;
		sites: Array<{ id: string; name: string; health_system_id: string | null }>;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, healthSystems, sites, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: preceptor?.name || '',
		email: preceptor?.email || '',
		phone: preceptor?.phone || '',
		health_system_id: preceptor?.health_system_id || '',
		max_students: preceptor?.max_students || 1
	});

	// Multi-site selection state - handle both site_ids array and sites object array
	let selectedSiteIds = $state<string[]>(
		preceptor?.site_ids || preceptor?.sites?.map(s => s.id) || []
	);

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let generalError = $state<string | null>(null);
	let showHealthSystemForm = $state(false);
	let showSiteForm = $state(false);
	let healthSystemsList = $state([...healthSystems]);
	let sitesList = $state([...sites]);

	// Filter sites by selected health system
	let filteredSites = $derived(
		formData.health_system_id
			? sitesList.filter((s) => s.health_system_id === formData.health_system_id)
			: sitesList
	);

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

	function handleHealthSystemFormCancel() {
		showHealthSystemForm = false;
	}

	function handleSiteFormCancel() {
		showSiteForm = false;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errors = {};
		generalError = null;
		isSubmitting = true;

		try {
			// Use appropriate schema for create vs update
			const schema = preceptor ? updatePreceptorSchema : createPreceptorSchema;

			// Include site_ids in the submission
			const dataToValidate = {
				...formData,
				site_ids: selectedSiteIds.length > 0 ? selectedSiteIds : undefined
			};

			const validatedData = schema.parse(dataToValidate);

			// Determine endpoint and method
			const url = preceptor ? `/api/preceptors/${preceptor.id}` : '/api/preceptors';
			const method = preceptor ? 'PATCH' : 'POST';

			// Submit to API
			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
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

			// Success
			onSuccess?.();
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
</script>

<Card class="p-6">
	<form onsubmit={handleSubmit}>
		<div class="space-y-4">
			{#if generalError}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{generalError}
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="name">Name</Label>
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
				<Label for="email">Email</Label>
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
				<Label for="health_system_id">Health System (Optional)</Label>
				<select
					id="health_system_id"
					bind:value={formData.health_system_id}
					onchange={handleHealthSystemChange}
					disabled={isSubmitting}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.health_system_id
						? 'border-destructive'
						: ''}"
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
				<div class="max-h-40 overflow-y-auto rounded-md border border-input p-2">
					{#if filteredSites.length === 0}
						<p class="text-sm text-muted-foreground py-2">
							{formData.health_system_id
								? 'No sites for this health system.'
								: 'No sites available.'}
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
				{#if errors.site_ids}
					<p class="text-sm text-destructive">{errors.site_ids}</p>
				{/if}
				{#if selectedSiteIds.length > 0}
					<p class="text-sm text-muted-foreground">
						{selectedSiteIds.length} site{selectedSiteIds.length === 1 ? '' : 's'} selected
					</p>
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
				{#if errors.max_students}
					<p class="text-sm text-destructive">{errors.max_students}</p>
				{/if}
			</div>

			<div class="flex gap-3 pt-4">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : preceptor ? 'Update Preceptor' : 'Create Preceptor'}
				</Button>
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSubmitting}>
						Cancel
					</Button>
				{/if}
			</div>
		</div>
	</form>
</Card>

<!-- Nested Health System Form Modal -->
{#if showHealthSystemForm}
	<div
		class="fixed inset-0 z-[60] bg-black/50"
		onclick={handleHealthSystemFormCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<HealthSystemForm
			onSuccess={handleHealthSystemCreated}
			onCancel={handleHealthSystemFormCancel}
		/>
	</div>
{/if}

<!-- Nested Site Form Modal -->
{#if showSiteForm}
	<div
		class="fixed inset-0 z-[60] bg-black/50"
		onclick={handleSiteFormCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<SiteForm
			healthSystems={healthSystemsList}
			onSuccess={handleSiteCreated}
			onCancel={handleSiteFormCancel}
		/>
	</div>
{/if}
