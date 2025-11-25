<script lang="ts">
	import type { HealthSystems } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createHealthSystemSchema } from '../schemas.js';
	import { ZodError } from 'zod';

	interface Props {
		healthSystem?: HealthSystems;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { healthSystem, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: healthSystem?.name || '',
		location: healthSystem?.location || '',
		description: healthSystem?.description || ''
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
			const validatedData = createHealthSystemSchema.parse(formData);

			// Determine endpoint and method
			const url = healthSystem
				? `/api/health-systems/${healthSystem.id}`
				: '/api/health-systems';
			const method = healthSystem ? 'PATCH' : 'POST';

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
				if (result.error?.details) {
					// Handle field-specific errors
					const fieldErrors: Record<string, string> = {};
					for (const detail of result.error.details) {
						fieldErrors[detail.field] = detail.message;
					}
					errors = fieldErrors;
				} else {
					generalError = result.error?.message || 'An error occurred';
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
					placeholder="e.g., University Hospital System"
					disabled={isSubmitting}
					class={errors.name ? 'border-destructive' : ''}
				/>
				{#if errors.name}
					<p class="text-sm text-destructive">{errors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="location">Location (Optional)</Label>
				<Input
					id="location"
					type="text"
					bind:value={formData.location}
					placeholder="e.g., New York, NY"
					disabled={isSubmitting}
					class={errors.location ? 'border-destructive' : ''}
				/>
				{#if errors.location}
					<p class="text-sm text-destructive">{errors.location}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="description">Description (Optional)</Label>
				<textarea
					id="description"
					bind:value={formData.description}
					placeholder="Description of the health system..."
					rows="3"
					disabled={isSubmitting}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {errors.description ? 'border-destructive' : ''}"
				></textarea>
				{#if errors.description}
					<p class="text-sm text-destructive">{errors.description}</p>
				{/if}
			</div>

			<div class="flex justify-end gap-2 pt-4">
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSubmitting}>
						Cancel
					</Button>
				{/if}
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : healthSystem ? 'Update' : 'Create'}
				</Button>
			</div>
		</div>
	</form>
</Card>
