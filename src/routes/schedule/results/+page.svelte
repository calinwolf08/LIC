<script lang="ts">
	import type { ScheduleResultsSummary } from '$lib/features/schedules/types/schedule-views';
	import {
		ScheduleStatsCard,
		UnmetRequirementsTable,
		ClerkshipBreakdownTable,
		ViolationStatsCard,
		SuggestionsPanel
	} from '$lib/features/schedules/components';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { createClientLogger } from '$lib/utils/logger.client';
	import { generateSuggestions } from '$lib/features/scheduling/services/suggestion-generator';

	const log = createClientLogger('schedule-results');

	interface Props {
		data: {
			summary: ScheduleResultsSummary;
		};
	}

	let { data }: Props = $props();

	let suggestions = $derived(
		data.summary.violationStats ? generateSuggestions(data.summary.violationStats) : []
	);

	function handleStudentClick(studentId: string) {
		log.debug('Navigating to student schedule', { studentId });
		goto(`/students/${studentId}/schedule`);
	}

	log.info('Schedule results loaded', {
		isComplete: data.summary.isComplete,
		totalStudents: data.summary.stats.totalStudents,
		unmetCount: data.summary.studentsWithUnmetRequirements.length
	});
</script>

<svelte:head>
	<title>Schedule Results | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Schedule Results</h1>
		{#if data.summary.period}
			<p class="text-muted-foreground">
				{data.summary.period.name}
				({data.summary.period.startDate} - {data.summary.period.endDate})
			</p>
		{:else}
			<p class="text-muted-foreground">No active scheduling period</p>
		{/if}
	</div>

	{#if !data.summary.period}
		<div class="rounded-lg border p-12 text-center">
			<p class="text-lg text-muted-foreground">
				No scheduling period is currently active. Create a scheduling period to view results.
			</p>
			<Button class="mt-4" onclick={() => goto('/calendar')}>Go to Calendar</Button>
		</div>
	{:else}
		<div class="space-y-6">
			<!-- Stats Overview -->
			<ScheduleStatsCard stats={data.summary.stats} isComplete={data.summary.isComplete} />

			<!-- Violations and Suggestions (only show if schedule incomplete) -->
			{#if !data.summary.isComplete}
				<div class="grid gap-6 lg:grid-cols-2">
					<!-- Violation Stats -->
					{#if data.summary.violationStats && data.summary.violationStats.length > 0}
						<ViolationStatsCard violations={data.summary.violationStats} />
					{/if}

					<!-- Suggestions -->
					{#if suggestions.length > 0}
						<SuggestionsPanel {suggestions} />
					{/if}
				</div>
			{/if}

			<!-- Unmet Requirements and Clerkship Breakdown -->
			<div class="grid gap-6 lg:grid-cols-2">
				<!-- Unmet Requirements -->
				<div class="lg:col-span-1">
					<UnmetRequirementsTable
						students={data.summary.studentsWithUnmetRequirements}
						onStudentClick={handleStudentClick}
					/>
				</div>

				<!-- Clerkship Breakdown -->
				<div class="lg:col-span-1">
					<ClerkshipBreakdownTable breakdown={data.summary.clerkshipBreakdown} />
				</div>
			</div>
		</div>
	{/if}
</div>
