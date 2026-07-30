<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { NoActiveSchedule } from '$lib/components';
	import { goto } from '$app/navigation';
	import { Check, Circle } from '@lucide/svelte';

	let { data }: { data: PageData } = $props();
	let stats = $derived(data.stats);

	let checklistDone = $derived((data.checklist ?? []).every((i) => i.done));

	const violationLabels: Record<string, string> = {
		student_double_booked: 'Double-booked students',
		preceptor_unavailable: 'Preceptor unavailable',
		blackout_date: 'On a blackout date',
		preceptor_capacity: 'Preceptor over capacity',
		site_not_allowed: 'Site not allowed for clerkship',
		outside_schedule: 'Outside the schedule dates',
		not_onboarded: 'Student not onboarded',
		entity_missing: 'Missing entity'
	};

	function pct(value: number, total: number): string {
		if (total === 0) return '0';
		return ((value / total) * 100).toFixed(0);
	}
</script>

<div>
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
		<p class="mt-1 text-gray-600">
			{data.activeSchedule ? data.activeSchedule.name : 'Welcome to LICFlow'}
		</p>
	</div>

	{#if !data.hasActiveSchedule}
		<NoActiveSchedule />
	{:else}

	<!-- Setup checklist -->
	{#if data.checklist && data.checklist.length > 0 && !checklistDone}
		<Card class="mb-8 border-blue-200 bg-blue-50/50 p-6">
			<h2 class="mb-1 text-xl font-bold text-gray-900">Finish setting up</h2>
			<p class="mb-4 text-sm text-gray-600">Complete these steps to build a schedule.</p>
			<ul class="space-y-2">
				{#each data.checklist as item (item.id)}
					<li>
						<a
							href={item.href}
							class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/60"
						>
							{#if item.done}
								<Check class="h-5 w-5 text-green-600" />
								<span class="text-gray-500 line-through">{item.label}</span>
							{:else}
								<Circle class="h-5 w-5 text-gray-400" />
								<span class="font-medium text-gray-900">{item.label}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</Card>
	{:else if data.checklist && data.checklist.length > 0}
		<Card class="mb-8 border-green-200 bg-green-50/50 p-4">
			<div class="flex items-center gap-2">
				<Check class="h-5 w-5 text-green-600" />
				<span class="font-medium text-green-800">Setup complete — you're ready to schedule.</span>
			</div>
		</Card>
	{/if}

	<!-- Counts -->
	{#if stats}
		<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
			<button onclick={() => goto('/students')} class="text-left">
				<Card class="p-6 transition-shadow hover:shadow-md">
					<p class="text-sm font-medium text-gray-600">Total Students</p>
					<p class="mt-2 text-3xl font-bold">{stats.total_students}</p>
				</Card>
			</button>
			<button onclick={() => goto('/preceptors')} class="text-left">
				<Card class="p-6 transition-shadow hover:shadow-md">
					<p class="text-sm font-medium text-gray-600">Total Preceptors</p>
					<p class="mt-2 text-3xl font-bold">{stats.total_preceptors}</p>
				</Card>
			</button>
			<button onclick={() => goto('/clerkships')} class="text-left">
				<Card class="p-6 transition-shadow hover:shadow-md">
					<p class="text-sm font-medium text-gray-600">Clerkships</p>
					<p class="mt-2 text-3xl font-bold">{stats.total_clerkships}</p>
				</Card>
			</button>
			<button onclick={() => goto('/calendar')} class="text-left">
				<Card class="p-6 transition-shadow hover:shadow-md">
					<p class="text-sm font-medium text-gray-600">Assignments</p>
					<p class="mt-2 text-3xl font-bold">{stats.total_assignments}</p>
				</Card>
			</button>
		</div>

		<div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Schedule health -->
			<Card class="p-6">
				<h2 class="mb-4 text-lg font-bold text-gray-900">Schedule health</h2>
				{#if data.violationCount === 0}
					<div class="flex items-center gap-2 text-green-700">
						<Check class="h-5 w-5" /> No scheduling conflicts.
					</div>
				{:else}
					<p class="mb-3 text-sm text-gray-600">
						{data.violationCount} conflict{data.violationCount > 1 ? 's' : ''} to review.
					</p>
					<ul class="space-y-1 text-sm">
						{#each Object.entries(data.violationsByCode) as [code, count] (code)}
							<li class="flex items-center justify-between">
								<span class="text-gray-700">{violationLabels[code] ?? code}</span>
								<Badge variant="destructive">{count}</Badge>
							</li>
						{/each}
					</ul>
					<Button variant="outline" size="sm" class="mt-4" onclick={() => goto('/calendar')}>
						View on calendar
					</Button>
				{/if}
			</Card>

			<!-- Student status -->
			<Card class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-bold text-gray-900">Student status</h2>
					<Button variant="ghost" size="sm" onclick={() => goto('/students')}>View all</Button>
				</div>
				<div class="mb-4 grid grid-cols-3 gap-2 text-center">
					<div>
						<p class="text-2xl font-bold text-green-600">{stats.fully_scheduled_students}</p>
						<p class="text-xs text-gray-500">Fully</p>
					</div>
					<div>
						<p class="text-2xl font-bold text-amber-600">{stats.partially_scheduled_students}</p>
						<p class="text-xs text-gray-500">Partially</p>
					</div>
					<div>
						<p class="text-2xl font-bold text-red-600">{stats.unscheduled_students}</p>
						<p class="text-xs text-gray-500">Unscheduled</p>
					</div>
				</div>
				{#if data.atRisk.length > 0}
					<h3 class="mb-2 text-sm font-medium text-gray-700">Most days remaining</h3>
					<ul class="space-y-1">
						{#each data.atRisk as s (s.id)}
							<li>
								<a
									href="/students/{s.id}"
									class="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50"
								>
									<span class="text-primary">{s.name}</span>
									<span class="text-muted-foreground">{s.unscheduled} days left · {s.percent}%</span
									>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		</div>
	{/if}

	<!-- Quick actions -->
	<Card class="p-6">
		<h2 class="mb-4 text-lg font-bold text-gray-900">Quick actions</h2>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			<Button onclick={() => goto('/students/new')} variant="outline" class="h-16"
				>Add student</Button
			>
			<Button onclick={() => goto('/preceptors/new')} variant="outline" class="h-16"
				>Add preceptor</Button
			>
			<Button onclick={() => goto('/calendar')} class="h-16 bg-teal-600 hover:bg-teal-700"
				>Open calendar</Button
			>
			<Button onclick={() => goto('/schedules')} variant="outline" class="h-16"
				>Manage schedules</Button
			>
		</div>
	</Card>
	{/if}
</div>
