<script lang="ts">
	import type { Clerkships } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createClerkshipSchema } from '../schemas.js';
	import { ZodError } from 'zod';

	interface Props {
		clerkship?: Clerkships;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { clerkship, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: clerkship?.name || '',
		specialty: clerkship?.specialty || '',
		inpatient_days: clerkship?.inpatient_days || 0,
		outpatient_days: clerkship?.outpatient_days || 0,
		description: clerkship?.description || ''
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
			const validatedData = createClerkshipSchema.parse(formData);

			// Determine endpoint and method
			const url = clerkship ? `/api/clerkships/${clerkship.id}` : '/api/clerkships';
			const method = clerkship ? 'PATCH' : 'POST';

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
					placeholder="Internal Medicine"
					disabled={isSubmitting}
					class={errors.name ? 'border-destructive' : ''}
				/>
				{#if errors.name}
					<p class="text-sm text-destructive">{errors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="specialty">Specialty (optional)</Label>
				<Input
					id="specialty"
					type="text"
					bind:value={formData.specialty}
					placeholder="Internal Medicine"
					disabled={isSubmitting}
					class={errors.specialty ? 'border-destructive' : ''}
				/>
				{#if errors.specialty}
					<p class="text-sm text-destructive">{errors.specialty}</p>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="inpatient_days">Inpatient Days</Label>
					<Input
						id="inpatient_days"
						type="number"
						bind:value={formData.inpatient_days}
						min="0"
						disabled={isSubmitting}
						class={errors.inpatient_days ? 'border-destructive' : ''}
					/>
					{#if errors.inpatient_days}
						<p class="text-sm text-destructive">{errors.inpatient_days}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="outpatient_days">Outpatient Days</Label>
					<Input
						id="outpatient_days"
						type="number"
						bind:value={formData.outpatient_days}
						min="0"
						disabled={isSubmitting}
						class={errors.outpatient_days ? 'border-destructive' : ''}
					/>
					{#if errors.outpatient_days}
						<p class="text-sm text-destructive">{errors.outpatient_days}</p>
					{/if}
				</div>
			</div>

			{#if formData.inpatient_days > 0 || formData.outpatient_days > 0}
				<p class="text-sm text-muted-foreground">
					Total: {formData.inpatient_days + formData.outpatient_days} days
				</p>
			{/if}

			<div class="space-y-2">
				<Label for="description">Description (optional)</Label>
				<Input
					id="description"
					type="text"
					bind:value={formData.description}
					placeholder="Four-week rotation in internal medicine"
					disabled={isSubmitting}
					class={errors.description ? 'border-destructive' : ''}
				/>
				{#if errors.description}
					<p class="text-sm text-destructive">{errors.description}</p>
				{/if}
			</div>

			<div class="flex gap-3 pt-4">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : clerkship ? 'Update' : 'Create'}
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
