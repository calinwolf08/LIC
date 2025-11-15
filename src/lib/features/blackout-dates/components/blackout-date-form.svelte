<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { createBlackoutDateSchema } from '../schemas';
	import { ZodError } from 'zod';

	interface Props {
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { onSuccess, onCancel }: Props = $props();

	let formData = $state({
		start_date: '',
		end_date: '',
		reason: ''
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
			const validatedData = createBlackoutDateSchema.parse(formData);

			// Submit to API
			const response = await fetch('/api/blackout-dates', {
				method: 'POST',
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
				<Label for="start_date">Start Date</Label>
				<Input
					id="start_date"
					type="date"
					bind:value={formData.start_date}
					disabled={isSubmitting}
					class={errors.start_date ? 'border-destructive' : ''}
				/>
				{#if errors.start_date}
					<p class="text-sm text-destructive">{errors.start_date}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="end_date">End Date</Label>
				<Input
					id="end_date"
					type="date"
					bind:value={formData.end_date}
					disabled={isSubmitting}
					class={errors.end_date ? 'border-destructive' : ''}
				/>
				{#if errors.end_date}
					<p class="text-sm text-destructive">{errors.end_date}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="reason">Reason</Label>
				<Input
					id="reason"
					type="text"
					bind:value={formData.reason}
					placeholder="Winter Break"
					disabled={isSubmitting}
					class={errors.reason ? 'border-destructive' : ''}
				/>
				{#if errors.reason}
					<p class="text-sm text-destructive">{errors.reason}</p>
				{/if}
			</div>

			<div class="flex gap-3 pt-4">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Creating...' : 'Create'}
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
