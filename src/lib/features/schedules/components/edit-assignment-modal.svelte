<script lang="ts">
	import type { EnrichedAssignment } from '../types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		assignment: EnrichedAssignment | null;
		open: boolean;
		onSave?: () => void;
		onCancel?: () => void;
		onReassign?: (assignment: EnrichedAssignment) => void;
		onDelete?: (assignment: EnrichedAssignment) => void;
	}

	let { assignment, open, onSave, onCancel, onReassign, onDelete }: Props = $props();

	let editedDate = $state('');
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let errors = $state<string[]>([]);

	// Reset form when modal opens
	$effect(() => {
		if (assignment && open) {
			editedDate = assignment.date;
			errors = [];
		}
	});

	async function handleSave() {
		if (!assignment) return;

		isSaving = true;
		errors = [];

		try {
			const response = await fetch(`/api/schedules/assignments/${assignment.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date: editedDate })
			});

			const result = await response.json();

			if (!response.ok) {
				if (result.error?.details) {
					errors = result.error.details.map((d: any) => d.message);
				} else {
					errors = [result.error?.message || 'Failed to update assignment'];
				}
				return;
			}

			onSave?.();
		} catch (error) {
			errors = ['An unexpected error occurred'];
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		if (!assignment) return;

		if (!confirm('Are you sure you want to delete this assignment?')) {
			return;
		}

		isDeleting = true;

		try {
			const response = await fetch(`/api/schedules/assignments/${assignment.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				errors = [result.error?.message || 'Failed to delete assignment'];
				return;
			}

			onDelete?.(assignment);
		} catch (error) {
			errors = ['An unexpected error occurred'];
		} finally {
			isDeleting = false;
		}
	}

	function handleReassignClick() {
		if (assignment) {
			onReassign?.(assignment);
		}
	}
</script>

{#if open && assignment}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 bg-black/50" onclick={onCancel} role="presentation"></div>

	<!-- Modal -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Edit Assignment</h2>

			<!-- Read-only Info -->
			<div class="space-y-2 p-4 bg-muted rounded mb-4">
				<p><strong>Student:</strong> {assignment.student_name}</p>
				<p><strong>Preceptor:</strong> {assignment.preceptor_name}</p>
				<p><strong>Clerkship:</strong> {assignment.clerkship_name}</p>
				<p><strong>Specialty:</strong> {assignment.clerkship_specialty}</p>
				<p><strong>Status:</strong> {assignment.status}</p>
			</div>

			<!-- Editable Date -->
			<div class="space-y-2 mb-4">
				<Label for="date">Date</Label>
				<Input id="date" type="date" bind:value={editedDate} disabled={isSaving || isDeleting} />
			</div>

			<!-- Errors -->
			{#if errors.length > 0}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					<p class="font-semibold mb-1">Errors:</p>
					<ul class="list-disc list-inside">
						{#each errors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-between">
				<div class="flex gap-2">
					<Button variant="outline" onclick={handleReassignClick} disabled={isSaving || isDeleting}>
						Reassign Preceptor
					</Button>
					<Button
						variant="destructive"
						onclick={handleDelete}
						disabled={isSaving || isDeleting}
					>
						{isDeleting ? 'Deleting...' : 'Delete'}
					</Button>
				</div>

				<div class="flex gap-2">
					<Button variant="outline" onclick={onCancel} disabled={isSaving || isDeleting}>
						Cancel
					</Button>
					<Button onclick={handleSave} disabled={isSaving || isDeleting}>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</Button>
				</div>
			</div>
		</Card>
	</div>
{/if}
