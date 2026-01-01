<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { createElective, updateElective } from '../services/elective-client';
	import { electiveFormSchema } from '../schemas/elective-schemas';
	import { extractZodErrors, extractApiErrors } from '../utils/form-helpers';
	import { ZodError } from 'zod';

	interface Props {
		clerkshipId: string;
		elective?: ClerkshipElective;
		maxDays?: number;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { clerkshipId, elective, maxDays, onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: elective?.name || '',
		specialty: elective?.specialty || '',
		minimumDays: elective?.minimumDays || 1,
		isRequired: elective?.isRequired || false
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
			// Validate
			const validatedData = electiveFormSchema.parse({
				...formData,
				specialty: formData.specialty || null
			});

			// Check if days exceed remaining days (for new electives)
			if (!elective && maxDays !== undefined && validatedData.minimumDays > maxDays) {
				errors.minimumDays = `Cannot exceed ${maxDays} remaining days`;
				return;
			}

			// Prepare data for submission (ensuring specialty is string | null, not undefined)
			const submitData = {
				name: validatedData.name,
				specialty: validatedData.specialty ?? null,
				minimumDays: validatedData.minimumDays,
				isRequired: validatedData.isRequired
			};

			// Submit
			if (elective) {
				await updateElective(elective.id, submitData);
			} else {
				await createElective(clerkshipId, submitData);
			}

			onSuccess?.();
		} catch (error) {
			if (error instanceof ZodError) {
				errors = extractZodErrors(error);
			} else if (error instanceof Error) {
				// Check if API error with field details
				try {
					const errorData = JSON.parse(error.message);
					if (errorData.error?.details) {
						errors = extractApiErrors(errorData.error.details);
					} else {
						generalError = error.message;
					}
				} catch {
					generalError = error.message;
				}
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
			<div class="mb-4">
				<h2 class="text-lg font-semibold">
					{elective ? 'Edit' : 'Create'} Elective
				</h2>
			</div>

			{#if generalError}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{generalError}
				</div>
			{/if}

			<!-- Name -->
			<div class="space-y-2">
				<Label for="name">Name *</Label>
				<Input
					id="name"
					bind:value={formData.name}
					placeholder="e.g., Cardiology Elective"
					class={errors.name ? 'border-destructive' : ''}
					disabled={isSubmitting}
				/>
				{#if errors.name}
					<p class="text-sm text-destructive">{errors.name}</p>
				{/if}
			</div>

			<!-- Specialty -->
			<div class="space-y-2">
				<Label for="specialty">Specialty (Optional)</Label>
				<Input
					id="specialty"
					bind:value={formData.specialty}
					placeholder="e.g., Cardiology"
					class={errors.specialty ? 'border-destructive' : ''}
					disabled={isSubmitting}
				/>
				{#if errors.specialty}
					<p class="text-sm text-destructive">{errors.specialty}</p>
				{/if}
				<p class="text-sm text-muted-foreground">
					Specific medical specialty for this elective
				</p>
			</div>

			<!-- Minimum Days -->
			<div class="space-y-2">
				<Label for="minimumDays">Minimum Days *</Label>
				<Input
					id="minimumDays"
					type="number"
					bind:value={formData.minimumDays}
					min="1"
					max="365"
					class={errors.minimumDays ? 'border-destructive' : ''}
					disabled={isSubmitting}
				/>
				{#if errors.minimumDays}
					<p class="text-sm text-destructive">{errors.minimumDays}</p>
				{/if}
				<p class="text-sm text-muted-foreground">
					Minimum number of days students must complete
				</p>
			</div>

			<!-- Is Required -->
			<div class="flex items-center space-x-2">
				<Checkbox
					id="isRequired"
					checked={formData.isRequired}
					onCheckedChange={(checked) => {
						formData.isRequired = checked === true;
					}}
					disabled={isSubmitting}
				/>
				<Label
					for="isRequired"
					class="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
				>
					Required Elective
				</Label>
			</div>
			<p class="text-sm text-muted-foreground ml-6">
				If checked, all students must complete this elective
			</p>

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-4">
				<Button type="button" variant="outline" onclick={onCancel} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : elective ? 'Update' : 'Create'}
				</Button>
			</div>
		</div>
	</form>
</Card>
