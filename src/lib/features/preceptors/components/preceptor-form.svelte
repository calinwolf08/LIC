<script lang="ts">
	import type { PreceptorsTable } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createPreceptorSchema } from '../schemas';
	import { ZodError } from 'zod';

	interface Props {
		preceptor?: PreceptorsTable;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: preceptor?.name || '',
		email: preceptor?.email || '',
		specialty: preceptor?.specialty || '',
		max_students: preceptor?.max_students || 1
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
			const validatedData = createPreceptorSchema.parse(formData);

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
				for (const issue of error.errors) {
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
				<Label for="specialty">Specialty</Label>
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
					{isSubmitting ? 'Saving...' : preceptor ? 'Update' : 'Create'}
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
