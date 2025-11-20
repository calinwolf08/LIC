<script lang="ts">
	import type { Sites } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createSiteSchema } from '../schemas.js';
	import { ZodError } from 'zod';

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
		address: site?.address || ''
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let generalError = $state<string | null>(null);

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
				if (result.details) {
					// Handle Zod validation errors
					const fieldErrors: Record<string, string> = {};
					for (const detail of result.details) {
						const field = detail.path?.[0];
						if (field) {
							fieldErrors[field] = detail.message;
						}
					}
					errors = fieldErrors;
				} else {
					generalError = result.error || 'An error occurred';
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
				<Label for="health_system_id">Health System</Label>
				<select
					id="health_system_id"
					bind:value={formData.health_system_id}
					disabled={isSubmitting}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.health_system_id ? 'border-destructive' : ''}"
				>
					<option value="">Select a health system...</option>
					{#each healthSystems as hs}
						<option value={hs.id}>{hs.name}</option>
					{/each}
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
