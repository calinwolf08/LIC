<script lang="ts">
	import type { Students } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createStudentSchema } from '../schemas.js';
	import { ZodError } from 'zod';
	import { registerUnsavedGuard } from '$lib/stores/unsaved-changes.svelte';

	interface Props {
		student?: Students;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { student, onSuccess, onCancel }: Props = $props();

	const initial = {
		name: student?.name || '',
		email: student?.email || ''
	};

	let formData = $state({ ...initial });

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let generalError = $state<string | null>(null);
	// Cleared to false the moment a save succeeds so the post-save navigation is
	// not itself blocked by the guard.
	let saved = $state(false);

	// Unsaved-changes guard (finding P1-e): warn before navigating away with dirty
	// fields. Registers once and disposes on unmount.
	$effect(() =>
		registerUnsavedGuard(
			() => !saved && (formData.name !== initial.name || formData.email !== initial.email)
		)
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errors = {};
		generalError = null;
		isSubmitting = true;

		try {
			// Validate form data
			const validatedData = createStudentSchema.parse(formData);

			// Determine endpoint and method
			const url = student ? `/api/students/${student.id}` : '/api/students';
			const method = student ? 'PATCH' : 'POST';

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

			// Success — drop the guard before the caller navigates away.
			saved = true;
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
					placeholder="Enter student name"
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
					placeholder="student@example.com"
					disabled={isSubmitting}
					class={errors.email ? 'border-destructive' : ''}
				/>
				{#if errors.email}
					<p class="text-sm text-destructive">{errors.email}</p>
				{/if}
			</div>

			<div class="flex gap-3 pt-4">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : student ? 'Update' : 'Create'}
				</Button>
				{#if onCancel}
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							// Cancel is an explicit discard — don't re-prompt via the guard.
							saved = true;
							onCancel?.();
						}}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
				{/if}
			</div>
		</div>
	</form>
</Card>
