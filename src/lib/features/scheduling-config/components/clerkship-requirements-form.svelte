<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';

	interface Requirement {
		id: string;
		requirement_type: 'inpatient' | 'outpatient' | 'elective';
		required_days: number;
		allow_cross_system: number;
		override_mode: 'inherit' | 'override_fields' | 'override_section';
	}

	interface Props {
		clerkshipId: string;
		clerkshipName: string;
	}

	let { clerkshipId, clerkshipName }: Props = $props();

	let requirements = $state<Requirement[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function loadRequirements() {
		loading = true;
		error = null;
		try {
			const response = await fetch(`/api/clerkships/${clerkshipId}/requirements`);
			if (!response.ok) throw new Error('Failed to load requirements');
			const result = await response.json();
			requirements = result.data || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleCrossSystem(requirement: Requirement) {
		try {
			const response = await fetch(`/api/requirements/${requirement.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					allow_cross_system: requirement.allow_cross_system === 1 ? 0 : 1
				})
			});

			if (!response.ok) throw new Error('Failed to update requirement');

			// Reload requirements
			await loadRequirements();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	async function addRequirement(type: 'inpatient' | 'outpatient' | 'elective') {
		try {
			const response = await fetch(`/api/clerkships/${clerkshipId}/requirements`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					requirement_type: type,
					required_days: 1,
					allow_cross_system: 0,
					override_mode: 'inherit'
				})
			});

			if (!response.ok) throw new Error('Failed to add requirement');

			await loadRequirements();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add requirement';
		}
	}

	function formatType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}

	function formatMode(mode: string): string {
		return mode
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	// Load on mount
	$effect(() => {
		loadRequirements();
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">Requirements for {clerkshipName}</h2>
			<p class="text-sm text-muted-foreground mt-1">
				Manage clerkship requirements and cross-system permissions
			</p>
		</div>
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => addRequirement('inpatient')}>
				+ Inpatient
			</Button>
			<Button size="sm" variant="outline" onclick={() => addRequirement('outpatient')}>
				+ Outpatient
			</Button>
			<Button size="sm" variant="outline" onclick={() => addRequirement('elective')}>
				+ Elective
			</Button>
		</div>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading requirements...</p>
		</Card>
	{:else if requirements.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No requirements configured for this clerkship.</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Add requirements using the buttons above.
			</p>
		</Card>
	{:else}
		<div class="grid gap-4">
			{#each requirements as requirement}
				<Card class="p-6">
					<div class="flex items-start justify-between">
						<div class="space-y-4 flex-1">
							<div class="flex items-center gap-3">
								<Badge
									variant={requirement.requirement_type === 'inpatient'
										? 'default'
										: requirement.requirement_type === 'outpatient'
											? 'secondary'
											: 'outline'}
								>
									{formatType(requirement.requirement_type)}
								</Badge>
								<span class="text-sm text-muted-foreground">
									{requirement.required_days} days required
								</span>
								<Badge variant="outline">{formatMode(requirement.override_mode)}</Badge>
							</div>

							<div class="flex items-center gap-4">
								<div class="flex items-center gap-2">
									<input
										type="checkbox"
										id={`cross-system-${requirement.id}`}
										checked={requirement.allow_cross_system === 1}
										onchange={() => toggleCrossSystem(requirement)}
										class="h-4 w-4 rounded border-gray-300"
									/>
									<label
										for={`cross-system-${requirement.id}`}
										class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										Allow Cross-System Assignments
									</label>
								</div>
								{#if requirement.allow_cross_system === 1}
									<span class="text-xs text-muted-foreground">
										Students can be assigned across different health systems
									</span>
								{:else}
									<span class="text-xs text-muted-foreground">
										Students must stay within same health system
									</span>
								{/if}
							</div>
						</div>

						<Button size="sm" variant="outline" href={`/scheduling-config/requirements/${requirement.id}`}>
							Configure
						</Button>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
