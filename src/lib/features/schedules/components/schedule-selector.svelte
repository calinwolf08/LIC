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
			data-testid="schedule-switcher"
			data-schedule-id={$activeSchedule.id}
			onclick={toggleDropdown}
			class="flex w-full items-center justify-between rounded-lg bg-gray-800 px-4 py-3 text-left transition-colors hover:bg-gray-700"
		>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-lg">📆</span>
					<span class="truncate font-medium text-white">{$activeSchedule.name}</span>
					{#if $activeSchedule.is_active === 1}
						<span
							class="inline-flex items-center rounded bg-green-900 px-1.5 py-0.5 text-xs font-medium text-green-300"
						>
							Active
						</span>
					{/if}
				</div>
				<div class="mt-0.5 ml-7 text-xs text-gray-400">
					{formatDateRange($activeSchedule.start_date, $activeSchedule.end_date)}
				</div>
			</div>
			<svg
				class="h-4 w-4 text-gray-400 transition-transform {dropdownOpen ? 'rotate-180' : ''}"
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
				class="absolute right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-lg"
			>
				{#each $scheduleStore.schedules as schedule}
					<button
						type="button"
						data-testid="schedule-switcher-option"
						data-schedule-id={schedule.id}
						onclick={() => handleScheduleChange(schedule)}
						class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-gray-700 {schedule.id ===
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

						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm text-white">{schedule.name}</span>
								{#if schedule.is_active === 1}
									<span
										class="inline-flex items-center rounded bg-green-900 px-1.5 py-0.5 text-[10px] font-medium text-green-300"
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
					<div class="px-4 py-3 text-center text-sm text-gray-400">No schedules available</div>
				{/if}

				<!-- Schedule actions: create a new one or manage the full list -->
				<div class="border-t border-gray-700">
					<a
						href="/schedules/new"
						class="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-400 transition-colors hover:bg-gray-700"
						onclick={closeDropdown}
					>
						<span>+</span>
						<span>New Schedule</span>
					</a>
					<a
						href="/schedules"
						class="flex w-full items-center gap-2 rounded-b-lg px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
						onclick={closeDropdown}
					>
						<span>⚙️</span>
						<span>Manage schedules</span>
					</a>
				</div>
			</div>
		{/if}
	{:else}
		<!-- No schedules available -->
		<div class="px-4 py-3">
			<div class="text-sm text-gray-400">No schedule selected</div>
			<a href="/schedules/new" class="text-sm text-blue-400 transition-colors hover:text-blue-300">
				+ Create Schedule
			</a>
		</div>
	{/if}
</div>
