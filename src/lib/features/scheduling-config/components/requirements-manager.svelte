<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Trash2, Plus, AlertCircle, CheckCircle } from 'lucide-svelte';

	interface Requirement {
		id: string;
		clerkshipId: string;
		requirementType: 'inpatient' | 'outpatient' | 'elective';
		requiredDays: number;
		overrideMode: string;
	}

	interface Props {
		clerkshipId: string;
		clerkshipName: string;
		clerkshipTotalDays: number;
	}

	let { clerkshipId, clerkshipName, clerkshipTotalDays }: Props = $props();

	let requirements = $state<Requirement[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let showAddForm = $state(false);

	// New requirement form
	let newRequirementType = $state<'outpatient' | 'inpatient' | 'elective'>('outpatient');
	let newRequirementDays = $state<number>(1);
	let formError = $state<string | null>(null);
	let creating = $state(false);

	// Derived calculations
	let totalAllocatedDays = $derived(requirements.reduce((sum, r) => sum + r.requiredDays, 0));
	let remainingDays = $derived(clerkshipTotalDays - totalAllocatedDays);
	let percentageAllocated = $derived((totalAllocatedDays / clerkshipTotalDays) * 100);
	let canAddMore = $derived(remainingDays > 0);

	// Validation
	let isNewRequirementValid = $derived.by(() => {
		if (newRequirementDays <= 0) return false;
		if (newRequirementDays > remainingDays) return false;
		return true;
	});

	let validationMessage = $derived.by(() => {
		if (newRequirementDays <= 0) return 'Days must be greater than 0';
		if (newRequirementDays > remainingDays) {
			return `Cannot exceed remaining ${remainingDays} days (would be ${totalAllocatedDays + newRequirementDays}/${clerkshipTotalDays})`;
		}
		return null;
	});

	async function loadRequirements() {
		loading = true;
		error = null;
		try {
			const response = await fetch(
				`/api/scheduling-config/requirements?clerkshipId=${clerkshipId}`
			);
			if (!response.ok) throw new Error('Failed to load requirements');
			const result = await response.json();
			requirements = result.data || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function createRequirement() {
		if (!isNewRequirementValid) return;

		creating = true;
		formError = null;
		try {
			const response = await fetch('/api/scheduling-config/requirements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clerkshipId,
					requirementType: newRequirementType,
					requiredDays: newRequirementDays,
					overrideMode: 'inherit'
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to create requirement');
			}

			// Reset form and reload
			newRequirementDays = 1;
			showAddForm = false;
			await loadRequirements();
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to create requirement';
		} finally {
			creating = false;
		}
	}

	async function deleteRequirement(requirementId: string) {
		if (!confirm('Are you sure you want to delete this requirement?')) return;

		try {
			const response = await fetch(
				`/api/scheduling-config/requirements/${requirementId}`,
				{
					method: 'DELETE'
				}
			);

			if (!response.ok) throw new Error('Failed to delete requirement');

			await loadRequirements();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete requirement';
		}
	}

	function formatType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}

	function getTypeColor(
		type: string
	): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (type) {
			case 'inpatient':
				return 'default';
			case 'outpatient':
				return 'secondary';
			case 'elective':
				return 'outline';
			default:
				return 'secondary';
		}
	}

	// Load on mount
	$effect(() => {
		loadRequirements();
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h2 class="text-2xl font-bold">{clerkshipName} - Requirements</h2>
		<p class="text-sm text-muted-foreground mt-1">
			Break down the {clerkshipTotalDays}-day clerkship into specific requirement types
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
			<AlertCircle class="h-4 w-4" />
			{error}
		</div>
	{/if}

	<!-- Progress Overview Card -->
	<Card class="p-6">
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Day Allocation</h3>
				<div class="text-sm text-muted-foreground">
					{totalAllocatedDays} / {clerkshipTotalDays} days allocated
				</div>
			</div>

			<!-- Progress Bar -->
			<div class="space-y-2">
				<div class="h-3 w-full bg-muted rounded-full overflow-hidden">
					<div
						class="h-full transition-all duration-300 {percentageAllocated >= 100
							? 'bg-green-500'
							: 'bg-primary'}"
						style="width: {Math.min(percentageAllocated, 100)}%"
					></div>
				</div>
				<div class="flex justify-between text-xs text-muted-foreground">
					<span>{percentageAllocated.toFixed(1)}% allocated</span>
					{#if remainingDays > 0}
						<span class="text-primary font-medium">{remainingDays} days remaining</span>
					{:else if remainingDays === 0}
						<span class="text-green-600 font-medium flex items-center gap-1">
							<CheckCircle class="h-3 w-3" />
							Fully allocated
						</span>
					{:else}
						<span class="text-destructive font-medium">Over by {Math.abs(remainingDays)} days!</span>
					{/if}
				</div>
			</div>

			<!-- Info box -->
			<div class="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
				<strong>How it works:</strong> Requirements are
				<strong>subsets</strong> of the clerkship total. For example, a 20-day clerkship could have
				15 outpatient days + 5 elective days.
			</div>
		</div>
	</Card>

	<!-- Requirements List -->
	<Card class="p-6">
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Current Requirements</h3>
				{#if canAddMore && !showAddForm}
					<Button size="sm" onclick={() => (showAddForm = true)}>
						<Plus class="h-4 w-4 mr-2" />
						Add Requirement
					</Button>
				{/if}
			</div>

			{#if loading}
				<p class="text-center text-muted-foreground py-8">Loading requirements...</p>
			{:else if requirements.length === 0}
				<div class="text-center py-8 space-y-3">
					<p class="text-muted-foreground">No requirements configured yet.</p>
					{#if !showAddForm}
						<Button variant="outline" onclick={() => (showAddForm = true)}>
							<Plus class="h-4 w-4 mr-2" />
							Add First Requirement
						</Button>
					{/if}
				</div>
			{:else}
				<div class="space-y-3">
					{#each requirements as requirement}
						<div class="flex items-center justify-between p-4 border rounded-lg">
							<div class="flex items-center gap-4">
								<Badge variant={getTypeColor(requirement.requirementType)}>
									{formatType(requirement.requirementType)}
								</Badge>
								<span class="font-medium">{requirement.requiredDays} days</span>
								<span class="text-sm text-muted-foreground">
									({((requirement.requiredDays / clerkshipTotalDays) * 100).toFixed(1)}% of total)
								</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => deleteRequirement(requirement.id)}
								class="text-destructive hover:text-destructive"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Add Requirement Form -->
			{#if showAddForm}
				<div class="border-t pt-4 mt-4">
					<h4 class="text-sm font-semibold mb-4">Add New Requirement</h4>

					{#if formError}
						<div
							class="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4 flex items-center gap-2"
						>
							<AlertCircle class="h-4 w-4" />
							{formError}
						</div>
					{/if}

					<div class="grid grid-cols-2 gap-4">
						<!-- Type Selection -->
						<div>
							<Label for="requirement-type">Type</Label>
							<select
								id="requirement-type"
								bind:value={newRequirementType}
								class="w-full mt-1 px-3 py-2 border rounded-md"
							>
								<option value="outpatient">Outpatient</option>
								<option value="inpatient">Inpatient</option>
								<option value="elective">Elective</option>
							</select>
						</div>

						<!-- Days Input -->
						<div>
							<Label for="requirement-days">Required Days</Label>
							<Input
								id="requirement-days"
								type="number"
								min="1"
								max={remainingDays}
								bind:value={newRequirementDays}
								class={validationMessage ? 'border-destructive' : ''}
							/>
							{#if validationMessage}
								<p class="text-xs text-destructive mt-1">{validationMessage}</p>
							{:else}
								<p class="text-xs text-muted-foreground mt-1">
									Max: {remainingDays} days remaining
								</p>
							{/if}
						</div>
					</div>

					<!-- Preview -->
					{#if isNewRequirementValid}
						<div class="mt-4 p-3 bg-primary/10 rounded-lg text-sm">
							<strong>Preview:</strong> Adding this requirement will allocate
							{totalAllocatedDays + newRequirementDays}/{clerkshipTotalDays} days
							({((
								((totalAllocatedDays + newRequirementDays) / clerkshipTotalDays) *
								100
							).toFixed(1))}%), leaving {remainingDays - newRequirementDays} days remaining
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex justify-end gap-2 mt-4">
						<Button variant="outline" onclick={() => (showAddForm = false)} disabled={creating}>
							Cancel
						</Button>
						<Button
							onclick={createRequirement}
							disabled={!isNewRequirementValid || creating}
						>
							{creating ? 'Creating...' : 'Create Requirement'}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</Card>

	<!-- Helpful Information -->
	<Card class="p-6 bg-muted/30">
		<h4 class="text-sm font-semibold mb-3">💡 Best Practices</h4>
		<ul class="text-sm text-muted-foreground space-y-2">
			<li>
				• <strong>Elective Requirements:</strong> Use for portions of the clerkship where students
				choose from specific elective options
			</li>
			<li>
				• <strong>Outpatient/Inpatient Split:</strong> Create separate requirements if students need
				dedicated time in each setting
			</li>
			<li>
				• <strong>Total Allocation:</strong> Requirements don't have to total 100% - you can leave
				some days unallocated for flexibility
			</li>
			<li>
				• <strong>Example:</strong> 20-day Family Medicine clerkship = 12 outpatient days + 5
				elective days + 3 days flexible
			</li>
		</ul>
	</Card>
</div>
