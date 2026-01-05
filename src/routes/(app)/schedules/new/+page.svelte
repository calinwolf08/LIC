<script lang="ts">
	import NewScheduleWizard from '$lib/features/schedules/components/new-schedule-wizard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let isDuplicating = $derived(!!data.sourceScheduleId);
</script>

<svelte:head>
	<title>{isDuplicating ? 'Duplicate Schedule' : 'New Schedule'} | LIC Scheduler</title>
</svelte:head>

<div class="py-8">
	<div class="mb-6">
		{#if isDuplicating && data.sourceSchedule}
			<h1 class="text-2xl font-bold text-gray-900">Duplicate Schedule</h1>
			<p class="text-gray-600 mt-1">
				Creating new schedule based on <strong>{data.sourceSchedule.name}</strong>.
				Entities will be pre-selected from the source schedule.
			</p>
		{:else}
			<h1 class="text-2xl font-bold text-gray-900">Create New Schedule</h1>
			<p class="text-gray-600 mt-1">Set up a new scheduling period and select which entities to include.</p>
		{/if}
	</div>

	<NewScheduleWizard
		sourceScheduleId={data.sourceScheduleId}
		sourceSchedule={data.sourceSchedule}
		sourceEntityIds={data.sourceEntityIds}
		entityData={data.entityData}
	/>
</div>
