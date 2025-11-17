<script lang="ts">
	import type { Preceptors, PreceptorAvailability } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';

	interface Props {
		preceptor: Preceptors;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, onSuccess, onCancel }: Props = $props();

	type AvailabilityItem = {
		date: string;
		is_available: boolean;
	};

	let availabilityItems = $state<AvailabilityItem[]>([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// Load existing availability
	async function loadAvailability() {
		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/availability`);
			if (!response.ok) {
				throw new Error('Failed to load availability');
			}

			const result = await response.json();
			const data: PreceptorAvailability[] = result.data;

			// Convert to availability items
			availabilityItems = data.map((item) => ({
				date: item.date,
				is_available: item.is_available === 1
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load availability';
		} finally {
			isLoading = false;
		}
	}

	// Initialize
	$effect(() => {
		loadAvailability();
	});

	function addDate() {
		const today = new Date().toISOString().split('T')[0];
		availabilityItems = [...availabilityItems, { date: today, is_available: true }];
	}

	function removeDate(index: number) {
		availabilityItems = availabilityItems.filter((_, i) => i !== index);
	}

	async function handleSave() {
		error = null;
		isSaving = true;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/availability`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					availability: availabilityItems
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to save availability');
			}

			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save availability';
		} finally {
			isSaving = false;
		}
	}
</script>

<Card class="p-6">
	<div class="space-y-4">
		<h3 class="text-lg font-semibold">
			Availability for {preceptor.name}
		</h3>

		{#if error}
			<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if isLoading}
			<p class="text-sm text-muted-foreground">Loading...</p>
		{:else}
			<div class="space-y-3">
				{#if availabilityItems.length === 0}
					<p class="text-sm text-muted-foreground">No availability dates set</p>
				{:else}
					{#each availabilityItems as item, i (i)}
						<div class="flex items-center gap-3">
							<div class="flex-1">
								<Label for="date-{i}" class="sr-only">Date</Label>
								<Input
									id="date-{i}"
									type="date"
									bind:value={item.date}
									disabled={isSaving}
								/>
							</div>
							<div class="flex items-center gap-2">
								<Checkbox
									id="available-{i}"
									checked={item.is_available}
									onCheckedChange={(checked) => {
										item.is_available = checked === true;
									}}
									disabled={isSaving}
								/>
								<Label for="available-{i}" class="text-sm">Available</Label>
							</div>
							<Button
								size="sm"
								variant="ghost"
								onclick={() => removeDate(i)}
								disabled={isSaving}
							>
								Remove
							</Button>
						</div>
					{/each}
				{/if}
			</div>

			<Button variant="outline" onclick={addDate} disabled={isSaving}>
				Add Date
			</Button>

			<div class="flex justify-end gap-3 pt-4 border-t">
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSaving}>
						Cancel
					</Button>
				{/if}
				<Button onclick={handleSave} disabled={isSaving}>
					{isSaving ? 'Saving...' : 'Save Availability'}
				</Button>
			</div>
		{/if}
	</div>
</Card>
