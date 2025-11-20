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
		require_same_site: number;
		require_same_preceptor_team: number;
		override_mode: 'inherit' | 'override_fields' | 'override_section';
	}

	interface Props {
		clerkshipId: string;
		clerkshipName: string;
		clerkshipType: 'inpatient' | 'outpatient' | 'elective';
	}

	let { clerkshipId, clerkshipName, clerkshipType }: Props = $props();

	let requirement = $state<Requirement | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function loadRequirement() {
		loading = true;
		error = null;
		try {
			const response = await fetch(`/api/clerkships/${clerkshipId}/requirements`);
			if (!response.ok) throw new Error('Failed to load requirement');
			const result = await response.json();
			const requirements = result.data || [];

			// Should only be one requirement per clerkship matching its type
			requirement = requirements.find((r: Requirement) => r.requirement_type === clerkshipType) || null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleCrossSystem() {
		if (!requirement) return;
		try {
			const response = await fetch(`/api/requirements/${requirement.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					allow_cross_system: requirement.allow_cross_system === 1 ? 0 : 1
				})
			});

			if (!response.ok) throw new Error('Failed to update requirement');

			await loadRequirement();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	async function toggleSameSite() {
		if (!requirement) return;
		try {
			const response = await fetch(`/api/requirements/${requirement.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					require_same_site: requirement.require_same_site === 1 ? 0 : 1
				})
			});

			if (!response.ok) throw new Error('Failed to update requirement');

			await loadRequirement();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	async function toggleSamePreceptorTeam() {
		if (!requirement) return;
		try {
			const response = await fetch(`/api/requirements/${requirement.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					require_same_preceptor_team: requirement.require_same_preceptor_team === 1 ? 0 : 1
				})
			});

			if (!response.ok) throw new Error('Failed to update requirement');

			await loadRequirement();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	function formatType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}

	// Load on mount
	$effect(() => {
		loadRequirement();
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">{clerkshipName} Requirements</h2>
		<p class="text-sm text-muted-foreground mt-1">
			Configure continuity and scheduling constraints for this {formatType(clerkshipType)} clerkship
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading requirement...</p>
		</Card>
	{:else if !requirement}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No requirement configured for this clerkship.</p>
			<p class="mt-2 text-sm text-muted-foreground">
				The requirement should be automatically created with the clerkship.
			</p>
		</Card>
	{:else}
		<Card class="p-6">
			<div class="space-y-6">
				<!-- Header Info -->
				<div class="flex items-center justify-between border-b pb-4">
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
					</div>
					<Button size="sm" variant="outline" href={`/scheduling-config/requirements/${requirement.id}`}>
						Advanced Settings
					</Button>
				</div>

				<!-- Continuity Constraints -->
				<div>
					<h3 class="text-lg font-semibold mb-4">Continuity Constraints</h3>
					<div class="space-y-4">
						<!-- Allow Cross-System -->
						<div class="flex items-start gap-4 p-4 rounded-lg border">
							<div class="flex items-center gap-2 min-w-[280px]">
								<input
									type="checkbox"
									id="cross-system"
									checked={requirement.allow_cross_system === 1}
									onchange={() => toggleCrossSystem()}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<label
									for="cross-system"
									class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Allow Cross-System Assignments
								</label>
							</div>
							<div class="flex-1">
								{#if requirement.allow_cross_system === 1}
									<p class="text-sm text-muted-foreground">
										✓ Students can rotate between different health systems for this clerkship
									</p>
								{:else}
									<p class="text-sm text-muted-foreground">
										✗ Students must stay within the same health system throughout this clerkship
									</p>
								{/if}
							</div>
						</div>

						<!-- Require Same Site -->
						<div class="flex items-start gap-4 p-4 rounded-lg border">
							<div class="flex items-center gap-2 min-w-[280px]">
								<input
									type="checkbox"
									id="same-site"
									checked={requirement.require_same_site === 1}
									onchange={() => toggleSameSite()}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<label
									for="same-site"
									class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Require Same Site
								</label>
							</div>
							<div class="flex-1">
								{#if requirement.require_same_site === 1}
									<p class="text-sm text-muted-foreground">
										✓ Students must complete all {requirement.required_days} days at the same site
									</p>
								{:else}
									<p class="text-sm text-muted-foreground">
										✗ Students can rotate between different sites during this clerkship
									</p>
								{/if}
							</div>
						</div>

						<!-- Require Same Preceptor Team -->
						<div class="flex items-start gap-4 p-4 rounded-lg border">
							<div class="flex items-center gap-2 min-w-[280px]">
								<input
									type="checkbox"
									id="same-team"
									checked={requirement.require_same_preceptor_team === 1}
									onchange={() => toggleSamePreceptorTeam()}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<label
									for="same-team"
									class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Require Same Preceptor Team
								</label>
							</div>
							<div class="flex-1">
								{#if requirement.require_same_preceptor_team === 1}
									<p class="text-sm text-muted-foreground">
										✓ Students must work with preceptors from the same team throughout this clerkship
									</p>
								{:else}
									<p class="text-sm text-muted-foreground">
										✗ Students can work with preceptors from different teams during this clerkship
									</p>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Helpful Tips -->
				<div class="bg-muted/50 rounded-lg p-4">
					<h4 class="text-sm font-semibold mb-2">💡 Configuration Tips</h4>
					<ul class="text-sm text-muted-foreground space-y-1">
						<li>• <strong>Same Site</strong>: Enable for continuity-focused rotations where students benefit from staying at one location</li>
						<li>• <strong>Same Team</strong>: Enable for team-based learning models where consistent supervision is important</li>
						<li>• <strong>Cross-System</strong>: Disable to ensure students complete requirements within their assigned health system</li>
					</ul>
				</div>
			</div>
		</Card>
	{/if}
</div>
