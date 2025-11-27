<script lang="ts">
	import type { ClerkshipProgress } from '../types/schedule-views';
	import { getClerkshipColor } from '../clients/schedule-views-client';

	interface Props {
		progress: ClerkshipProgress;
	}

	let { progress }: Props = $props();

	const color = $derived(getClerkshipColor(progress.specialty));
	const progressWidth = $derived(`${Math.min(100, progress.percentComplete)}%`);
</script>

<div class="border rounded-lg p-4 space-y-3">
	<div class="flex items-start justify-between">
		<div>
			<h4 class="font-semibold" style="color: {color};">
				{progress.clerkshipName}
			</h4>
			<p class="text-xs text-muted-foreground">{progress.specialty}</p>
		</div>
		<div class="text-right">
			<span class="text-lg font-bold {progress.isComplete ? 'text-green-600' : 'text-amber-600'}">
				{progress.percentComplete}%
			</span>
		</div>
	</div>

	<!-- Progress bar -->
	<div class="space-y-1">
		<div class="h-2 bg-muted rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-300"
				style="width: {progressWidth}; background-color: {progress.isComplete ? '#16a34a' : color};"
			></div>
		</div>
		<div class="flex justify-between text-xs text-muted-foreground">
			<span>{progress.assignedDays} / {progress.requiredDays} days</span>
			{#if progress.remainingDays > 0}
				<span class="text-amber-600">{progress.remainingDays} remaining</span>
			{:else}
				<span class="text-green-600">Complete</span>
			{/if}
		</div>
	</div>

	<!-- Preceptors assigned -->
	{#if progress.preceptors.length > 0}
		<div class="pt-2 border-t">
			<p class="text-xs font-medium text-muted-foreground mb-1">Preceptors:</p>
			<div class="flex flex-wrap gap-1">
				{#each progress.preceptors as preceptor}
					<span class="inline-flex items-center text-xs bg-muted px-2 py-0.5 rounded">
						{preceptor.name}
						<span class="ml-1 text-muted-foreground">({preceptor.daysAssigned}d)</span>
					</span>
				{/each}
			</div>
		</div>
	{:else}
		<div class="pt-2 border-t">
			<p class="text-xs text-amber-600">No assignments yet</p>
		</div>
	{/if}

	<!-- Sites -->
	{#if progress.sites.length > 0}
		<div class="text-xs text-muted-foreground">
			Sites: {progress.sites.map((s) => s.name).join(', ')}
		</div>
	{/if}
</div>
