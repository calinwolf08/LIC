<script lang="ts">
	import type { EnrichedAssignment } from '../types';
	import type { Preceptors } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		assignment: EnrichedAssignment | null;
		preceptors: Preceptors[];
		open: boolean;
		onSave?: () => void;
		onCancel?: () => void;
	}

	let { assignment, preceptors, open, onSave, onCancel }: Props = $props();

	let selectedPreceptorId = $state('');
	let isValidating = $state(false);
	let isSaving = $state(false);
	let validationResult = $state<{ valid: boolean; errors: string[] } | null>(null);

	// Filter preceptors by matching specialty
	let matchingPreceptors = $derived(() => {
		if (!assignment) return [];
		return preceptors.filter((p) => p.specialty === assignment.clerkship_specialty);
	});

	// Reset form when modal opens
	$effect(() => {
		if (assignment && open) {
			selectedPreceptorId = '';
			validationResult = null;
		}
	});

	async function handlePreview() {
		if (!assignment || !selectedPreceptorId) return;

		isValidating = true;

		try {
			const response = await fetch(`/api/schedules/assignments/${assignment.id}/reassign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					new_preceptor_id: selectedPreceptorId,
					dry_run: true
				})
			});

			const result = await response.json();
			validationResult = result.data;
		} catch (error) {
			validationResult = {
				valid: false,
				errors: ['Failed to validate reassignment']
			};
		} finally {
			isValidating = false;
		}
	}

	async function handleSave() {
		if (!assignment || !selectedPreceptorId) return;

		isSaving = true;

		try {
			const response = await fetch(`/api/schedules/assignments/${assignment.id}/reassign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					new_preceptor_id: selectedPreceptorId,
					dry_run: false
				})
			});

			const result = await response.json();

			if (!response.ok || !result.data.valid) {
				validationResult = result.data;
				return;
			}

			onSave?.();
		} catch (error) {
			validationResult = {
				valid: false,
				errors: ['An unexpected error occurred']
			};
		} finally {
			isSaving = false;
		}
	}
</script>

{#if open && assignment}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 bg-black/50" onclick={onCancel} role="presentation"></div>

	<!-- Modal -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Reassign to Different Preceptor</h2>

			<!-- Assignment Info -->
			<div class="space-y-2 p-4 bg-muted rounded mb-4">
				<p><strong>Student:</strong> {assignment.student_name}</p>
				<p><strong>Current Preceptor:</strong> {assignment.preceptor_name}</p>
				<p><strong>Clerkship:</strong> {assignment.clerkship_name}</p>
				<p><strong>Date:</strong> {assignment.date}</p>
			</div>

			<!-- Select New Preceptor -->
			<div class="space-y-2 mb-4">
				<Label for="preceptor">New Preceptor (matching specialty: {assignment.clerkship_specialty})</Label>
				<select
					id="preceptor"
					bind:value={selectedPreceptorId}
					onchange={handlePreview}
					disabled={isSaving}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">Select a preceptor...</option>
					{#each matchingPreceptors() as preceptor}
						{#if preceptor.id !== assignment.preceptor_id}
							<option value={preceptor.id}>{preceptor.name}</option>
						{/if}
					{/each}
				</select>
			</div>

			<!-- Validation Result -->
			{#if isValidating}
				<div class="mb-4 p-3 bg-muted rounded text-sm">
					Validating reassignment...
				</div>
			{:else if validationResult}
				{#if validationResult.valid}
					<div class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
						<p class="font-semibold">✓ Reassignment is valid</p>
						<p class="mt-1">No conflicts detected.</p>
					</div>
				{:else}
					<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
						<p class="font-semibold">Validation Errors:</p>
						<ul class="list-disc list-inside mt-1">
							{#each validationResult.errors as error}
								<li>{error}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isSaving}>
					Cancel
				</Button>
				<Button
					onclick={handleSave}
					disabled={isSaving || !selectedPreceptorId || (validationResult && !validationResult.valid)}
				>
					{isSaving ? 'Reassigning...' : 'Reassign'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
