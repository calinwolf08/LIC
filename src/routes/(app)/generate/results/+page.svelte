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

	/** Why the last generation left requirements unmet, by clerkship (then student). */
	const unmetReasons = $derived(
		[...(data.summary.lastRun?.result?.unmetRequirements ?? [])].sort(
			(a, b) =>
				a.clerkshipName.localeCompare(b.clerkshipName) || a.studentName.localeCompare(b.studentName)
		)
	);
	const fmt = (n: number) => String(Math.round(n * 100) / 100);

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
		<div
			class="space-y-6"
			data-testid="results"
			data-complete={data.summary.isComplete ? 'true' : 'false'}
		>
			<!-- Stats Overview -->
			<div data-testid="results-stats">
				<ScheduleStatsCard stats={data.summary.stats} isComplete={data.summary.isComplete} />
			</div>

			<!-- Violations and Suggestions (only show if schedule incomplete) -->
			{#if !data.summary.isComplete}
				<div class="grid gap-6 lg:grid-cols-2">
					<!-- Violation Stats -->
					{#if data.summary.violationStats && data.summary.violationStats.length > 0}
						<div data-testid="results-violations">
							<ViolationStatsCard violations={data.summary.violationStats} />
						</div>
					{/if}

					<!-- Suggestions -->
					{#if suggestions.length > 0}
						<div data-testid="results-suggestions">
							<SuggestionsPanel {suggestions} />
						</div>
					{/if}
				</div>
			{/if}

			<!-- Why the last generation fell short: what to fix -->
			{#if unmetReasons.length > 0}
				<div class="rounded-lg border" data-testid="results-unmet-reasons">
					<div class="border-b bg-muted/50 px-4 py-3">
						<h3 class="font-semibold">Why requirements weren't met ({unmetReasons.length})</h3>
						<p class="text-xs text-muted-foreground">
							From the last generation{data.summary.lastRun?.createdAt
								? ` (${new Date(data.summary.lastRun.createdAt).toLocaleString()})`
								: ''}. Fix what each one points at, then generate again.
						</p>
					</div>
					<ul class="max-h-[28rem] divide-y overflow-y-auto text-sm">
						{#each unmetReasons as u, i (i)}
							<li class="px-4 py-2" data-testid="results-unmet-reason">
								<div class="flex flex-wrap items-baseline justify-between gap-2">
									<span class="font-medium">{u.clerkshipName} · {u.studentName}</span>
									<span class="text-xs whitespace-nowrap text-red-700 dark:text-red-300">
										{fmt(u.assignedDays)} of {fmt(u.requiredDays)} days placed
									</span>
								</div>
								<p class="text-muted-foreground">{u.reason}</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Unmet Requirements and Clerkship Breakdown -->
			<div class="grid gap-6 lg:grid-cols-2">
				<!-- Unmet Requirements -->
				<div class="lg:col-span-1" data-testid="results-unmet">
					<UnmetRequirementsTable
						students={data.summary.studentsWithUnmetRequirements}
						onStudentClick={handleStudentClick}
					/>
				</div>

				<!-- Clerkship Breakdown -->
				<div class="lg:col-span-1" data-testid="results-breakdown">
					<ClerkshipBreakdownTable breakdown={data.summary.clerkshipBreakdown} />
				</div>
			</div>
		</div>
	{/if}
</div>
