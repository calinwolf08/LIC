<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import { selectSchedule, formatDateRange } from '$lib/stores/schedule-store';

	let { data }: { data: PageData } = $props();

	let settingActive = $state<string | null>(null);
	let deleteConfirm = $state<string | null>(null);
	let deleting = $state(false);

	async function setActiveSchedule(scheduleId: string) {
		settingActive = scheduleId;
		try {
			const response = await fetch('/api/user/active-schedule', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduleId })
			});

			if (response.ok) {
				// Update local store
				selectSchedule(scheduleId);
				// Refresh page data
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to set active schedule:', error);
		} finally {
			settingActive = null;
		}
	}

	async function handleDelete(scheduleId: string) {
		deleting = true;
		try {
			const response = await fetch(`/api/scheduling-periods/${scheduleId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				deleteConfirm = null;
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to delete schedule:', error);
		} finally {
			deleting = false;
		}
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Schedules | LIC Scheduler</title>
</svelte:head>

<div class="container mx-auto py-8">
	<!-- Header -->
	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">Schedules</h1>
			<p class="text-gray-600 mt-1">Manage your scheduling periods</p>
		</div>
		<Button onclick={() => goto('/schedules/new')}>
			+ New Schedule
		</Button>
	</div>

	<!-- Schedule List -->
	{#if data.schedules.length === 0}
		<Card class="p-12 text-center">
			<div class="text-6xl mb-4">📅</div>
			<h2 class="text-xl font-semibold text-gray-900 mb-2">No Schedules Yet</h2>
			<p class="text-gray-600 mb-6">
				Create your first schedule to start managing clerkship assignments.
			</p>
			<Button onclick={() => goto('/schedules/new')}>Create Schedule</Button>
		</Card>
	{:else}
		<div class="grid gap-4">
			{#each data.schedules as schedule}
				{@const isActive = schedule.id === data.activeScheduleId}
				<Card class="p-6 {isActive ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-3">
								<h3 class="text-lg font-semibold text-gray-900">{schedule.name}</h3>
								{#if isActive}
									<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
										Active
									</span>
								{/if}
								{#if schedule.is_active === 1}
									<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
										Server Active
									</span>
								{/if}
							</div>
							<p class="text-sm text-gray-600 mt-1">
								{formatDateRange(schedule.start_date, schedule.end_date)}
								{#if schedule.year}
									<span class="ml-2">Year {schedule.year}</span>
								{/if}
							</p>
							<div class="flex gap-6 mt-3 text-sm text-gray-500">
								<span>{schedule.studentCount} students</span>
								<span>{schedule.preceptorCount} preceptors</span>
								<span>{schedule.clerkshipCount} clerkships</span>
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#if !isActive}
								<Button
									variant="outline"
									size="sm"
									onclick={() => setActiveSchedule(schedule.id!)}
									disabled={settingActive === schedule.id}
								>
									{settingActive === schedule.id ? 'Setting...' : 'Set Active'}
								</Button>
							{/if}
							<Button
								variant="outline"
								size="sm"
								onclick={() => goto(`/schedules/${schedule.id}/edit`)}
							>
								Edit
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => goto(`/schedules/new?source=${schedule.id}`)}
							>
								Duplicate
							</Button>
							{#if deleteConfirm === schedule.id}
								<div class="flex items-center gap-2 ml-2">
									<span class="text-sm text-red-600">Delete?</span>
									<Button
										variant="destructive"
										size="sm"
										onclick={() => handleDelete(schedule.id!)}
										disabled={deleting}
									>
										{deleting ? 'Deleting...' : 'Yes'}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => (deleteConfirm = null)}
									>
										No
									</Button>
								</div>
							{:else}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (deleteConfirm = schedule.id!)}
									class="text-red-600 hover:text-red-700 hover:bg-red-50"
								>
									Delete
								</Button>
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Info Box -->
	<Card class="mt-8 p-6 bg-blue-50 border-blue-200">
		<h3 class="font-semibold text-blue-900 mb-2">About Schedules</h3>
		<ul class="text-sm text-blue-800 space-y-1">
			<li>Each schedule defines a scheduling period with its own set of entities.</li>
			<li>Your <strong>active schedule</strong> is the one you're currently working with.</li>
			<li>Entities (students, preceptors, etc.) are shared across schedules by default.</li>
			<li>Use <strong>Duplicate</strong> to create a new schedule based on an existing one.</li>
		</ul>
	</Card>
</div>
