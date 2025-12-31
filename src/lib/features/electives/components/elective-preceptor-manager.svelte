<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import {
		addPreceptorToElective,
		removePreceptorFromElective
	} from '../services/elective-client';

	interface Preceptor {
		id: string;
		name: string;
	}

	interface Props {
		elective: ClerkshipElective;
		associatedPreceptors: Preceptor[];
		availablePreceptors: Preceptor[];
		onUpdate?: () => void;
	}

	let { elective, associatedPreceptors, availablePreceptors, onUpdate }: Props = $props();

	let selectedPreceptorId = $state('');
	let isAdding = $state(false);
	let addError = $state<string | null>(null);

	async function handleAddPreceptor() {
		if (!selectedPreceptorId) return;

		isAdding = true;
		addError = null;

		try {
			await addPreceptorToElective(elective.id, selectedPreceptorId);
			selectedPreceptorId = '';
			onUpdate?.();
		} catch (error) {
			addError = error instanceof Error ? error.message : 'Failed to add preceptor';
		} finally {
			isAdding = false;
		}
	}

	async function handleRemovePreceptor(preceptorId: string) {
		try {
			await removePreceptorFromElective(elective.id, preceptorId);
			onUpdate?.();
		} catch (error) {
			console.error('Failed to remove preceptor:', error);
		}
	}
</script>

<Card class="p-6">
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold">Manage Preceptors</h3>
			<p class="text-sm text-muted-foreground">
				Assign specific preceptors who can supervise this elective
			</p>
		</div>

		<!-- Associated Preceptors -->
		{#if associatedPreceptors.length > 0}
			<div class="space-y-2">
				<Label>Associated Preceptors ({associatedPreceptors.length})</Label>
				<div class="flex flex-wrap gap-2">
					{#each associatedPreceptors as preceptor (preceptor.id)}
						<Badge variant="secondary" class="gap-1 pr-1">
							{preceptor.name}
							<button
								onclick={() => handleRemovePreceptor(preceptor.id)}
								class="ml-1 rounded-full hover:bg-destructive/20"
								aria-label="Remove {preceptor.name}"
							>
								<svg
									class="h-3 w-3"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</Badge>
					{/each}
				</div>
			</div>
		{:else}
			<div class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
				No preceptors associated. Add preceptors to specify who can supervise this elective.
			</div>
		{/if}

		<!-- Add Preceptor -->
		{#if availablePreceptors.length > 0}
			<div class="space-y-2">
				<Label for="preceptor-select">Add Preceptor</Label>
				{#if addError}
					<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
						{addError}
					</div>
				{/if}
				<div class="flex gap-2">
					<select
						id="preceptor-select"
						bind:value={selectedPreceptorId}
						disabled={isAdding}
						class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="">Select a preceptor...</option>
						{#each availablePreceptors as preceptor (preceptor.id)}
							<option value={preceptor.id}>{preceptor.name}</option>
						{/each}
					</select>
					<Button onclick={handleAddPreceptor} disabled={!selectedPreceptorId || isAdding}>
						{isAdding ? 'Adding...' : 'Add'}
					</Button>
				</div>
			</div>
		{:else if associatedPreceptors.length > 0}
			<p class="text-sm text-muted-foreground">All available preceptors have been associated.</p>
		{/if}
	</div>
</Card>
