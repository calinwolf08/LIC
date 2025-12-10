<script lang="ts">
	import NewScheduleWizard from '$lib/features/schedules/components/new-schedule-wizard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>New Schedule | LIC Scheduler</title>
</svelte:head>

<div class="py-8">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Create New Schedule</h1>
		<p class="text-gray-600 mt-1">Set up a new scheduling period and select which entities to include.</p>
	</div>

	<NewScheduleWizard
		sourceScheduleId={data.sourceScheduleId}
		entityData={data.entityData}
	/>
</div>
