<script lang="ts">
	import { onMount } from 'svelte';

	interface Schedule {
		id: string;
		name: string;
		startDate: string;
		endDate: string;
		isActive: boolean;
	}

	interface Props {
		entityType: 'students' | 'preceptors' | 'sites' | 'health_systems' | 'clerkships' | 'teams';
		entityId: string;
		entityName?: string;
	}

	let { entityType, entityId, entityName = '' }: Props = $props();

	let schedules = $state<Schedule[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let isShared = $derived(schedules.length > 1);

	onMount(async () => {
		try {
			const response = await fetch(`/api/entities/${entityType}/${entityId}/schedules`);
			const result = await response.json();

			if (result.success) {
				schedules = result.data.schedules;
			} else {
				error = result.error?.message || 'Failed to load schedule information';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load schedule information';
		} finally {
			loading = false;
		}
	});

	const entityTypeLabels: Record<string, string> = {
		students: 'student',
		preceptors: 'preceptor',
		sites: 'site',
		health_systems: 'health system',
		clerkships: 'clerkship',
		teams: 'team'
	};
</script>

{#if loading}
	<div class="text-sm text-gray-500">Checking schedule associations...</div>
{:else if error}
	<!-- Silently ignore errors - this is supplementary info -->
{:else if isShared}
	<div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
		<div class="flex gap-3">
			<div class="flex-shrink-0 text-yellow-600">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-6 h-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
					/>
				</svg>
			</div>
			<div>
				<h3 class="text-sm font-semibold text-yellow-800">Shared {entityTypeLabels[entityType]}</h3>
				<p class="mt-1 text-sm text-yellow-700">
					This {entityTypeLabels[entityType]}{entityName ? ` (${entityName})` : ''} is used in {schedules.length} schedules.
					Changes will affect all of them:
				</p>
				<ul class="mt-2 text-sm text-yellow-700 list-disc list-inside">
					{#each schedules as schedule}
						<li>
							<span class="font-medium">{schedule.name}</span>
							<span class="text-yellow-600">
								({schedule.startDate} - {schedule.endDate})
								{#if schedule.isActive}
									<span
										class="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full"
									>
										Active
									</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
{/if}
