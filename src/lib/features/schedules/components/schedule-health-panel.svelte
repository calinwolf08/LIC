<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { OVERRIDE_LABELS } from '$lib/features/scheduling/services/assignment-validation';

	export interface OverrideRow {
		assignmentId: string;
		date: string;
		studentId: string;
		studentName: string;
		clerkshipId: string;
		clerkshipName: string;
		preceptorId: string;
		preceptorName: string;
		codes: string[];
		note: string | null;
		createdAt: string;
	}

	interface Props {
		/** Whole-schedule violations, grouped by code, from /api/schedules/validation. */
		countsByCode: Record<string, number>;
		violationCount: number;
		/** Accepted overrides, from /api/schedules/overrides. */
		overrides: OverrideRow[];
		/** Open the edit dialog for an assignment (health rows link back to it). */
		onOpenAssignment?: (assignmentId: string) => void;
	}

	let { countsByCode, violationCount, overrides, onOpenAssignment }: Props = $props();

	let open = $state(false);

	function label(code: string): string {
		return (OVERRIDE_LABELS as Record<string, string>)[code] ?? code;
	}

	let codeRows = $derived(
		Object.entries(countsByCode)
			.filter(([, n]) => n > 0)
			.sort((a, b) => b[1] - a[1])
	);
</script>

<Card class="mb-4 p-4" data-testid="schedule-health">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-lg font-semibold">Schedule health</h2>
			{#if violationCount === 0}
				<Badge class="bg-green-600">No conflicts</Badge>
			{:else}
				<Badge variant="destructive" data-testid="health-violation-count">
					{violationCount} conflict{violationCount === 1 ? '' : 's'}
				</Badge>
			{/if}
			{#if overrides.length > 0}
				<Badge variant="secondary" data-testid="health-override-count">
					{overrides.length} override{overrides.length === 1 ? '' : 's'}
				</Badge>
			{/if}
		</div>
		<Button size="sm" variant="outline" onclick={() => (open = !open)}>
			{open ? 'Hide details' : 'Show details'}
		</Button>
	</div>

	{#if open}
		<div class="mt-4 grid gap-6 md:grid-cols-2">
			<!-- Violations grouped by code -->
			<div>
				<h3 class="mb-2 text-sm font-medium">Conflicts by type</h3>
				{#if codeRows.length === 0}
					<p class="text-sm text-muted-foreground">Nothing to fix — this schedule is clean.</p>
				{:else}
					<ul class="space-y-1 text-sm">
						{#each codeRows as [code, n] (code)}
							<li class="flex items-center justify-between rounded border px-3 py-2">
								<span>{label(code)}</span>
								<Badge variant="outline">{n}</Badge>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Accepted overrides, each linking back to its assignment -->
			<div>
				<h3 class="mb-2 text-sm font-medium">Overrides</h3>
				{#if overrides.length === 0}
					<p class="text-sm text-muted-foreground">
						No overrides yet. Accepting a warning when assigning records it here.
					</p>
				{:else}
					<ul class="space-y-2 text-sm" data-testid="override-list">
						{#each overrides as o (o.assignmentId)}
							<li class="rounded border px-3 py-2">
								<div class="flex items-start justify-between gap-2">
									<div>
										<p class="font-medium">{o.studentName} · {o.date}</p>
										<p class="text-xs text-muted-foreground">
											{o.clerkshipName} · {o.preceptorName}
										</p>
										<div class="mt-1 flex flex-wrap gap-1">
											{#each o.codes as code (code)}
												<Badge variant="secondary" class="text-xs">{label(code)}</Badge>
											{/each}
										</div>
										{#if o.note}
											<p class="mt-1 text-xs italic text-muted-foreground">“{o.note}”</p>
										{/if}
									</div>
									{#if onOpenAssignment}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onOpenAssignment?.(o.assignmentId)}
										>
											Review
										</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</Card>
