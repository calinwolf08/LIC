<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import WelcomeScheduleModal from '$lib/features/schedules/components/welcome-schedule-modal.svelte';

	let { data }: { data: PageData } = $props();

	let stats = $derived(data.stats);

	// Check if this is first visit (schedule not configured yet)
	let showWelcome = $state(false);

	$effect(() => {
		if (browser && data.activeSchedule) {
			const configured = localStorage.getItem('schedule_configured');
			// Show welcome if schedule has default name and not previously configured
			if (!configured && data.activeSchedule.name === 'My Schedule') {
				showWelcome = true;
			}
		}
	});

	function handleWelcomeComplete() {
		showWelcome = false;
		invalidateAll();
	}

	function navigateTo(path: string) {
		goto(path);
	}

	function getPercentage(value: number, total: number): string {
		if (total === 0) return '0';
		return ((value / total) * 100).toFixed(0);
	}
</script>

<div class="container mx-auto py-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-4xl font-bold">Dashboard</h1>
		<p class="text-gray-600 mt-2">Welcome to the LIC Scheduling System</p>
	</div>

	<!-- Main Statistics Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
		<!-- Total Students -->
		<Card class="p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Students</p>
					<p class="text-3xl font-bold mt-2">{stats.total_students}</p>
				</div>
				<div class="text-4xl">👨‍🎓</div>
			</div>
		</Card>

		<!-- Total Preceptors -->
		<Card class="p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Preceptors</p>
					<p class="text-3xl font-bold mt-2">{stats.total_preceptors}</p>
				</div>
				<div class="text-4xl">👨‍⚕️</div>
			</div>
		</Card>

		<!-- Clerkship Types -->
		<Card class="p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Clerkship Types</p>
					<p class="text-3xl font-bold mt-2">{stats.total_clerkships}</p>
				</div>
				<div class="text-4xl">📚</div>
			</div>
		</Card>

		<!-- Active Assignments -->
		<Card class="p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Active Assignments</p>
					<p class="text-3xl font-bold mt-2">{stats.total_assignments}</p>
				</div>
				<div class="text-4xl">📅</div>
			</div>
		</Card>
	</div>

	<!-- Student Scheduling Status -->
	<div class="mb-8">
		<h2 class="text-2xl font-bold mb-4">Student Scheduling Status</h2>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Fully Scheduled -->
			<Card class="p-6">
				<div class="flex items-center justify-between mb-2">
					<p class="text-sm font-medium text-gray-600">Fully Scheduled</p>
					<div class="text-2xl">✅</div>
				</div>
				<p class="text-3xl font-bold text-green-600">{stats.fully_scheduled_students}</p>
				<p class="text-sm text-gray-500 mt-1">
					{getPercentage(stats.fully_scheduled_students, stats.total_students)}% of students
				</p>
			</Card>

			<!-- Partially Scheduled -->
			<Card class="p-6">
				<div class="flex items-center justify-between mb-2">
					<p class="text-sm font-medium text-gray-600">Partially Scheduled</p>
					<div class="text-2xl">⚠️</div>
				</div>
				<p class="text-3xl font-bold text-amber-600">{stats.partially_scheduled_students}</p>
				<p class="text-sm text-gray-500 mt-1">
					{getPercentage(stats.partially_scheduled_students, stats.total_students)}% of students
				</p>
			</Card>

			<!-- Unscheduled -->
			<Card class="p-6">
				<div class="flex items-center justify-between mb-2">
					<p class="text-sm font-medium text-gray-600">Unscheduled</p>
					<div class="text-2xl">❌</div>
				</div>
				<p class="text-3xl font-bold text-red-600">{stats.unscheduled_students}</p>
				<p class="text-sm text-gray-500 mt-1">
					{getPercentage(stats.unscheduled_students, stats.total_students)}% of students
				</p>
			</Card>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="mb-8">
		<h2 class="text-2xl font-bold mb-4">Quick Actions</h2>
		<Card class="p-6">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<Button onclick={() => navigateTo('/calendar')} class="w-full h-20">
					<div class="flex flex-col items-center gap-2">
						<span class="text-2xl">📅</span>
						<span>View Calendar</span>
					</div>
				</Button>

				<Button onclick={() => navigateTo('/students')} variant="outline" class="w-full h-20">
					<div class="flex flex-col items-center gap-2">
						<span class="text-2xl">👨‍🎓</span>
						<span>Manage Students</span>
					</div>
				</Button>

				<Button onclick={() => navigateTo('/preceptors')} variant="outline" class="w-full h-20">
					<div class="flex flex-col items-center gap-2">
						<span class="text-2xl">👨‍⚕️</span>
						<span>Manage Preceptors</span>
					</div>
				</Button>

				<Button onclick={() => navigateTo('/clerkships')} variant="outline" class="w-full h-20">
					<div class="flex flex-col items-center gap-2">
						<span class="text-2xl">📚</span>
						<span>Manage Clerkships</span>
					</div>
				</Button>
			</div>
		</Card>
	</div>

	<!-- Getting Started -->
	{#if stats.total_students === 0 || stats.total_preceptors === 0 || stats.total_clerkships === 0}
		<Card class="p-6 bg-blue-50 border-blue-200">
			<h2 class="text-xl font-bold mb-2 text-blue-900">Getting Started</h2>
			<p class="text-blue-800 mb-4">
				To generate schedules, you need to add students, preceptors, and clerkships first.
			</p>
			<div class="space-y-2 text-sm text-blue-700">
				{#if stats.total_students === 0}
					<p>• Add students in the <strong>Students</strong> section</p>
				{/if}
				{#if stats.total_preceptors === 0}
					<p>• Add preceptors in the <strong>Preceptors</strong> section</p>
				{/if}
				{#if stats.total_clerkships === 0}
					<p>• Add clerkships in the <strong>Clerkships</strong> section</p>
				{/if}
			</div>
		</Card>
	{/if}
</div>

<!-- Welcome Modal for new users -->
{#if showWelcome && data.activeSchedule}
	<WelcomeScheduleModal
		open={showWelcome}
		schedule={data.activeSchedule}
		onComplete={handleWelcomeComplete}
	/>
{/if}
