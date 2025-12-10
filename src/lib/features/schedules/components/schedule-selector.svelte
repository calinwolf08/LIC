<script lang="ts">
	import { onMount } from 'svelte';
	import {
		scheduleStore,
		activeSchedule,
		loadSchedules,
		selectSchedule,
		formatDateRange,
		type Schedule
	} from '$lib/stores/schedule-store';

	let dropdownOpen = $state(false);

	onMount(() => {
		loadSchedules();
	});

	function handleScheduleChange(schedule: Schedule): void {
		selectSchedule(schedule.id);
		dropdownOpen = false;
	}

	function toggleDropdown(): void {
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown(): void {
		dropdownOpen = false;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closeDropdown();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative">
	{#if $scheduleStore.loading}
		<div class="px-4 py-3 text-sm text-gray-400">Loading schedules...</div>
	{:else if $scheduleStore.error}
		<div class="px-4 py-3 text-sm text-red-400">{$scheduleStore.error}</div>
	{:else if $activeSchedule}
		<!-- Schedule Selector Button -->
		<button
			type="button"
			onclick={toggleDropdown}
			class="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
		>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<span class="text-lg">📆</span>
					<span class="font-medium text-white truncate">{$activeSchedule.name}</span>
					{#if $activeSchedule.is_active === 1}
						<span
							class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300"
						>
							Active
						</span>
					{/if}
				</div>
				<div class="text-xs text-gray-400 mt-0.5 ml-7">
					{formatDateRange($activeSchedule.start_date, $activeSchedule.end_date)}
				</div>
			</div>
			<svg
				class="w-4 h-4 text-gray-400 transition-transform {dropdownOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		<!-- Dropdown Menu -->
		{#if dropdownOpen}
			<!-- Backdrop -->
			<button
				type="button"
				class="fixed inset-0 z-40"
				onclick={closeDropdown}
				aria-label="Close dropdown"
			></button>

			<!-- Dropdown Content -->
			<div
				class="absolute left-0 right-0 mt-1 z-50 bg-gray-800 rounded-lg shadow-lg border border-gray-700 max-h-64 overflow-y-auto"
			>
				{#each $scheduleStore.schedules as schedule}
					<button
						type="button"
						onclick={() => handleScheduleChange(schedule)}
						class="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg {schedule.id ===
						$activeSchedule?.id
							? 'bg-gray-700'
							: ''}"
					>
						<!-- Checkmark for selected -->
						<span class="w-4 text-green-400">
							{#if schedule.id === $activeSchedule?.id}
								✓
							{/if}
						</span>

						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="text-sm text-white truncate">{schedule.name}</span>
								{#if schedule.is_active === 1}
									<span
										class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-900 text-green-300"
									>
										Server Active
									</span>
								{/if}
							</div>
							<div class="text-xs text-gray-400">
								{formatDateRange(schedule.start_date, schedule.end_date)}
								{#if schedule.year}
									<span class="ml-1">• Year {schedule.year}</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}

				{#if $scheduleStore.schedules.length === 0}
					<div class="px-4 py-3 text-sm text-gray-400 text-center">No schedules available</div>
				{/if}

				<!-- New Schedule Link -->
				<div class="border-t border-gray-700">
					<a
						href="/schedules/new"
						class="w-full px-4 py-2 flex items-center gap-2 text-sm text-blue-400 hover:bg-gray-700 transition-colors rounded-b-lg"
						onclick={closeDropdown}
					>
						<span>+</span>
						<span>New Schedule</span>
					</a>
				</div>
			</div>
		{/if}
	{:else}
		<!-- No schedules available -->
		<div class="px-4 py-3">
			<div class="text-sm text-gray-400">No schedule selected</div>
			<a
				href="/schedules/new"
				class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
			>
				+ Create Schedule
			</a>
		</div>
	{/if}
</div>
