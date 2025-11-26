<script lang="ts">
	import type { Sites } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createSiteSchema } from '../schemas.js';
	import { ZodError } from 'zod';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';

	interface Props {
		site?: Sites;
		healthSystems: Array<{ id: string; name: string }>;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { site, healthSystems, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: site?.name || '',
		health_system_id: site?.health_system_id || '',
		address: site?.address || '',
		office_phone: site?.office_phone || '',
		contact_person: site?.contact_person || '',
		contact_email: site?.contact_email || ''
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let generalError = $state<string | null>(null);
	let showHealthSystemForm = $state(false);
	let healthSystemsList = $state([...healthSystems]);

	function handleHealthSystemChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		if (target.value === '__create_new__') {
			showHealthSystemForm = true;
			// Reset selection
			formData.health_system_id = '';
		}
	}

	async function handleHealthSystemCreated() {
		// Refresh health systems list
		try {
			const response = await fetch('/api/health-systems');
			const result = await response.json();
			if (result.success && result.data) {
				healthSystemsList = result.data;
				// Auto-select the most recently created health system (last in array)
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

	function handleHealthSystemFormCancel() {
		showHealthSystemForm = false;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errors = {};
		generalError = null;
		isSubmitting = true;

		try {
			// Validate form data
			const validatedData = createSiteSchema.parse(formData);

			// Determine endpoint and method
			const url = site ? `/api/sites/${site.id}` : '/api/sites';
			const method = site ? 'PATCH' : 'POST';

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
					// Handle Zod validation errors
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
				<Label for="name">Site Name</Label>
				<Input
					id="name"
					type="text"
					bind:value={formData.name}
					placeholder="e.g., City Hospital"
					disabled={isSubmitting}
					class={errors.name ? 'border-destructive' : ''}
				/>
				{#if errors.name}
					<p class="text-sm text-destructive">{errors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="health_system_id">Health System (Optional)</Label>
				<select
					id="health_system_id"
					bind:value={formData.health_system_id}
					onchange={handleHealthSystemChange}
					disabled={isSubmitting}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.health_system_id ? 'border-destructive' : ''}"
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
				<Label for="address">Address (Optional)</Label>
				<textarea
					id="address"
					bind:value={formData.address}
					placeholder="123 Main Street, City, State 12345"
					rows="3"
					disabled={isSubmitting}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.address ? 'border-destructive' : ''}"
				></textarea>
				{#if errors.address}
					<p class="text-sm text-destructive">{errors.address}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="office_phone">Office Phone (Optional)</Label>
				<Input
					id="office_phone"
					type="tel"
					bind:value={formData.office_phone}
					placeholder="+1 (555) 123-4567"
					disabled={isSubmitting}
					class={errors.office_phone ? 'border-destructive' : ''}
				/>
				{#if errors.office_phone}
					<p class="text-sm text-destructive">{errors.office_phone}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="contact_person">Contact Person (Optional)</Label>
				<Input
					id="contact_person"
					type="text"
					bind:value={formData.contact_person}
					placeholder="Dr. Jane Smith"
					disabled={isSubmitting}
					class={errors.contact_person ? 'border-destructive' : ''}
				/>
				{#if errors.contact_person}
					<p class="text-sm text-destructive">{errors.contact_person}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="contact_email">Contact Email (Optional)</Label>
				<Input
					id="contact_email"
					type="email"
					bind:value={formData.contact_email}
					placeholder="contact@hospital.com"
					disabled={isSubmitting}
					class={errors.contact_email ? 'border-destructive' : ''}
				/>
				{#if errors.contact_email}
					<p class="text-sm text-destructive">{errors.contact_email}</p>
				{/if}
			</div>

			<div class="flex justify-end gap-2 pt-4">
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSubmitting}>
						Cancel
					</Button>
				{/if}
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : site ? 'Update Site' : 'Create Site'}
				</Button>
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
	<div
		class="fixed left-1/2 top-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
	>
		<HealthSystemForm
			onSuccess={handleHealthSystemCreated}
			onCancel={handleHealthSystemFormCancel}
		/>
	</div>
{/if}
