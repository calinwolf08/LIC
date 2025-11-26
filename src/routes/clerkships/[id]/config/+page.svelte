<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showAddRequirementModal = $state(false);

	// Simplified form state for new requirement
	let newRequirement = $state({
		requirementType: 'outpatient' as 'outpatient' | 'inpatient' | 'elective',
		requiredDays: 20
	});

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	async function handleAddRequirement() {
		showAddRequirementModal = true;
	}

	async function handleSubmitRequirement() {
		isSubmitting = true;
		error = null;

		try {
			const response = await fetch('/api/scheduling-config/requirements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clerkshipId: data.configuration.clerkshipId,
					requirementType: newRequirement.requirementType,
					requiredDays: newRequirement.requiredDays,
					allowCrossSystem: false,
					overrideMode: 'inherit'
				})
			});

			const result = await response.json();

			if (!response.ok) {
				error = result.error?.message || 'Failed to create requirement';
				return;
			}

			// Reset form and close modal
			showAddRequirementModal = false;
			newRequirement = {
				requirementType: 'outpatient',
				requiredDays: 20
			};

			// Refresh data
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create requirement';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteRequirement(requirementId: string) {
		if (!confirm('Are you sure you want to delete this requirement?')) return;

		try {
			const response = await fetch(`/api/scheduling-config/requirements/${requirementId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				alert(result.error?.message || 'Failed to delete requirement');
				return;
			}

			await invalidateAll();
		} catch (err) {
			alert('Failed to delete requirement');
		}
	}

	function handleCancelRequirement() {
		showAddRequirementModal = false;
		error = null;
	}

	function formatRequirementType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}
</script>

<div class="container mx-auto py-8">
	<!-- Header -->
	<div class="mb-6">
		<Button variant="ghost" onclick={() => goto('/clerkships')} class="mb-4">
			← Back to Clerkships
		</Button>
		<h1 class="text-3xl font-bold">{data.configuration.clerkshipName}</h1>
		<p class="mt-2 text-muted-foreground">
			Configure scheduling requirements for this clerkship
		</p>
	</div>

	<!-- Summary Card -->
	<Card class="mb-6 p-6">
		<h2 class="text-xl font-semibold mb-4">Configuration Summary</h2>
		<div class="grid gap-4 md:grid-cols-3">
			<div>
				<p class="text-sm text-muted-foreground">Total Required Days</p>
				<p class="text-2xl font-bold">{data.configuration.totalRequiredDays}</p>
			</div>
			<div>
				<p class="text-sm text-muted-foreground">Requirements</p>
				<p class="text-2xl font-bold">{data.configuration.requirements.length}</p>
			</div>
			<div>
				<p class="text-sm text-muted-foreground">Teams</p>
				<p class="text-2xl font-bold">{data.configuration.teams?.length || 0}</p>
			</div>
		</div>
	</Card>

	<!-- Requirements Section -->
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-semibold">Requirements</h2>
			<Button onclick={handleAddRequirement}>Add Requirement</Button>
		</div>

		{#if data.configuration.requirements.length === 0}
			<Card class="p-12 text-center text-muted-foreground">
				<p>No requirements configured yet.</p>
				<p class="mt-2 text-sm">Add a requirement to specify how many days students need for this clerkship.</p>
			</Card>
		{:else}
			<div class="space-y-3">
				{#each data.configuration.requirements as req}
					<Card class="p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-4">
								<div class="rounded-full px-3 py-1 text-sm font-medium {
									req.requirement.requirement_type === 'inpatient'
										? 'bg-blue-100 text-blue-700'
										: req.requirement.requirement_type === 'outpatient'
											? 'bg-green-100 text-green-700'
											: 'bg-purple-100 text-purple-700'
								}">
									{formatRequirementType(req.requirement.requirement_type)}
								</div>
								<div>
									<p class="font-medium">{req.requirement.required_days} days required</p>
									<p class="text-sm text-muted-foreground">
										Strategy: {req.resolvedConfig.assignmentStrategy?.replace(/_/g, ' ') || 'Default'}
									</p>
								</div>
							</div>
							<Button
								size="sm"
								variant="destructive"
								onclick={() => handleDeleteRequirement(req.requirement.id)}
							>
								Delete
							</Button>
						</div>

						{#if req.electives && req.electives.length > 0}
							<div class="mt-4 border-t pt-4">
								<p class="text-sm font-medium mb-2">Electives ({req.electives.length})</p>
								<div class="flex flex-wrap gap-2">
									{#each req.electives as elective}
										<span class="rounded-full bg-muted px-3 py-1 text-xs">
											{elective.name} ({elective.minimum_days} days min)
										</span>
									{/each}
								</div>
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Teams Link -->
	<Card class="mt-6 p-6">
		<h2 class="text-xl font-semibold mb-2">Preceptor Teams</h2>
		<p class="text-muted-foreground mb-4">
			Manage preceptor teams for this clerkship from the Preceptors page.
		</p>
		<Button variant="outline" onclick={() => goto('/preceptors')}>
			Manage Teams
		</Button>
	</Card>
</div>

<!-- Add Requirement Modal -->
{#if showAddRequirementModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={handleCancelRequirement}
		role="presentation"
	>
		<div
			class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
		>
			<h2 class="mb-4 text-xl font-bold">Add Requirement</h2>

			{#if error}
				<div class="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleSubmitRequirement(); }} class="space-y-4">
				<!-- Requirement Type -->
				<div class="space-y-2">
					<Label for="requirementType">Type</Label>
					<select
						id="requirementType"
						bind:value={newRequirement.requirementType}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
					>
						<option value="outpatient">Outpatient</option>
						<option value="inpatient">Inpatient</option>
						<option value="elective">Elective</option>
					</select>
				</div>

				<!-- Required Days -->
				<div class="space-y-2">
					<Label for="requiredDays">Required Days</Label>
					<Input
						id="requiredDays"
						type="number"
						bind:value={newRequirement.requiredDays}
						min="1"
						required
					/>
				</div>

				<!-- Action Buttons -->
				<div class="flex justify-end gap-2 pt-4">
					<Button
						type="button"
						variant="outline"
						onclick={handleCancelRequirement}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'Creating...' : 'Add Requirement'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
