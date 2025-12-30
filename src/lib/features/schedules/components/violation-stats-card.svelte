<script lang="ts">
	import type { ViolationStat } from '../types/schedule-views';
	import { Card } from '$lib/components/ui/card';

	interface Props {
		violations: ViolationStat[];
	}

	let { violations }: Props = $props();

	// Format constraint names for display
	function formatConstraintName(name: string): string {
		return name
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	// Get severity class based on percentage
	function getSeverityClass(percentage: number): string {
		if (percentage > 30) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
		if (percentage > 15)
			return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
		return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
	}

	let topViolations = $derived(violations.slice(0, 5));
</script>

<Card class="overflow-hidden">
	<div class="bg-muted/50 px-4 py-3 border-b">
		<h3 class="font-semibold">Top Blocking Constraints</h3>
		<p class="text-sm text-muted-foreground mt-1">
			Constraints that prevented the most assignments
		</p>
	</div>

	{#if violations.length === 0}
		<div class="p-8 text-center">
			<div class="text-green-600 text-lg font-medium">No Constraint Violations</div>
			<p class="text-sm text-muted-foreground mt-1">
				All attempted assignments passed constraint validation.
			</p>
		</div>
	{:else}
		<div class="divide-y">
			{#each topViolations as violation, index}
				<div class="px-4 py-3 hover:bg-muted/30 transition-colors">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="text-lg font-bold text-muted-foreground">
								#{index + 1}
							</div>
							<div>
								<p class="font-medium">
									{formatConstraintName(violation.constraintName)}
								</p>
								<p class="text-sm text-muted-foreground">
									{violation.count} assignment{violation.count !== 1 ? 's' : ''} blocked
								</p>
							</div>
						</div>
						<div class="text-right">
							<span
								class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityClass(violation.percentage)}`}
							>
								{violation.percentage.toFixed(1)}%
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if violations.length > 5}
			<div class="px-4 py-3 bg-muted/30 text-sm text-muted-foreground text-center">
				+{violations.length - 5} more constraint type{violations.length - 5 !== 1 ? 's' : ''}
			</div>
		{/if}
	{/if}
</Card>
