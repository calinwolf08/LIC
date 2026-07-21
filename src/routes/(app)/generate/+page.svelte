<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { Check, Circle } from '@lucide/svelte';
	import RegenerateDialog from '$lib/features/schedules/components/regenerate-dialog.svelte';

	let { data }: { data: PageData } = $props();

	let showDialog = $state(false);
	let pending = $derived((data.checklist ?? []).filter((i) => !i.done));

	function onConfirm() {
		showDialog = false;
		goto('/generate/results');
	}
</script>

<div class="space-y-6">
	{#if pending.length > 0}
		<Card class="border-amber-200 bg-amber-50/50 p-6">
			<h2 class="mb-2 text-lg font-semibold">Before you generate</h2>
			<ul class="space-y-1 text-sm">
				{#each data.checklist as item (item.id)}
					<li class="flex items-center gap-2">
						{#if item.done}
							<Check class="h-4 w-4 text-green-600" /><span class="text-gray-500 line-through">{item.label}</span>
						{:else}
							<Circle class="h-4 w-4 text-gray-400" /><a href={item.href} class="text-primary hover:underline">{item.label}</a>
						{/if}
					</li>
				{/each}
			</ul>
		</Card>
	{/if}

	<Card class="p-6">
		<h2 class="mb-2 text-lg font-semibold">Generate a schedule</h2>
		<p class="mb-4 text-sm text-muted-foreground">
			The engine assigns students to preceptors to meet requirements. You can preview the impact
			before applying, and any assignments you've <strong>locked</strong> are preserved.
		</p>
		{#if data.activeSchedule}
			<p class="mb-4 text-sm text-muted-foreground">
				Active schedule: <strong>{data.activeSchedule.name}</strong>
				({data.activeSchedule.startDate} to {data.activeSchedule.endDate})
			</p>
			<Button onclick={() => (showDialog = true)}>Generate schedule…</Button>
		{:else}
			<p class="text-sm text-muted-foreground">No active schedule. Create one first.</p>
			<Button variant="outline" class="mt-2" onclick={() => goto('/schedules')}>Manage schedules</Button>
		{/if}
	</Card>
</div>

<RegenerateDialog
	open={showDialog}
	scheduleStartDate={data.activeSchedule?.startDate}
	scheduleEndDate={data.activeSchedule?.endDate}
	{onConfirm}
	onCancel={() => (showDialog = false)}
/>
