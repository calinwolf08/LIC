<script lang="ts">
	import type { PreceptorSchedule } from '../types/schedule-views';

	interface Props {
		capacity: PreceptorSchedule['overallCapacity'];
		monthlyCapacity?: PreceptorSchedule['monthlyCapacity'];
	}

	let { capacity, monthlyCapacity = [] }: Props = $props();

	const utilizationColor = $derived(
		capacity.utilizationPercent >= 80
			? 'text-red-600'
			: capacity.utilizationPercent >= 50
				? 'text-amber-600'
				: 'text-green-600'
	);
</script>

<div class="border rounded-lg p-4 space-y-4">
	<h3 class="font-semibold text-lg">Capacity Overview</h3>

	<!-- Overall utilization -->
	<div class="space-y-2">
		<div class="flex justify-between text-sm">
			<span>Utilization</span>
			<span class="font-medium {utilizationColor}">{capacity.utilizationPercent}%</span>
		</div>
		<div class="h-3 bg-muted rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-300"
				class:bg-green-600={capacity.utilizationPercent < 50}
				class:bg-amber-500={capacity.utilizationPercent >= 50 && capacity.utilizationPercent < 80}
				class:bg-red-500={capacity.utilizationPercent >= 80}
				style="width: {Math.min(100, capacity.utilizationPercent)}%;"
			></div>
		</div>
	</div>

	<!-- Assigned outside availability (client feedback I1): a bypassable warning so
	     the coordinator can find and fix days scheduled when the preceptor isn't
	     marked available, instead of the numbers silently going wrong. -->
	{#if capacity.assignedOutsideAvailability > 0}
		<div
			role="alert"
			data-testid="assigned-outside-availability"
			class="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
		>
			{capacity.assignedOutsideAvailability}
			assigned {capacity.assignedOutsideAvailability === 1 ? 'day is' : 'days are'} outside this
			preceptor's availability. Review the calendar to confirm or fix these.
		</div>
	{/if}

	<!-- Stats grid -->
	<div class="grid grid-cols-3 gap-3 pt-2">
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold text-green-600">{capacity.availableDays}</div>
			<div class="text-xs text-muted-foreground">Available Days</div>
		</div>
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold text-blue-600">{capacity.assignedDays}</div>
			<div class="text-xs text-muted-foreground">Assigned Days</div>
		</div>
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold {capacity.openSlots > 0 ? 'text-amber-600' : 'text-muted-foreground'}">
				{capacity.openSlots}
			</div>
			<div class="text-xs text-muted-foreground">Open Slots</div>
		</div>
	</div>

	<!-- Monthly breakdown -->
	{#if monthlyCapacity.length > 0}
		<div class="pt-2 border-t">
			<p class="text-xs font-medium text-muted-foreground mb-2">Monthly Breakdown</p>
			<div class="space-y-2 max-h-48 overflow-y-auto">
				{#each monthlyCapacity as month}
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">{month.periodName}</span>
						<div class="flex items-center gap-3">
							<span class="text-xs">{month.assignedDays}/{month.availableDays}</span>
							<div class="w-20 h-2 bg-muted rounded-full overflow-hidden">
								<div
									class="h-full rounded-full"
									class:bg-green-500={month.utilizationPercent < 50}
									class:bg-amber-500={month.utilizationPercent >= 50 && month.utilizationPercent < 80}
									class:bg-red-500={month.utilizationPercent >= 80}
									style="width: {Math.min(100, month.utilizationPercent)}%;"
								></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
