<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import type { GeneratedDate } from '$lib/features/preceptors/pattern-schemas';

	interface Props {
		generatedDates: GeneratedDate[];
		startDate: string;
		endDate: string;
		onDateClick?: (date: string) => void;
	}

	let { generatedDates, startDate, endDate, onDateClick }: Props = $props();

	// Create date map for quick lookup
	let dateMap = $derived(() => {
		const map = new Map<string, { is_available: boolean; source_type?: string }>();
		for (const d of generatedDates) {
			map.set(d.date, {
				is_available: d.is_available,
				source_type: d.source_pattern_type
			});
		}
		return map;
	});

	// Helper function to parse YYYY-MM-DD strings without timezone issues
	function parseLocalDate(dateStr: string): Date {
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	// Helper function to format date as YYYY-MM-DD
	function formatLocalDate(year: number, month: number, day: number): string {
		const yearStr = year.toString();
		const monthStr = (month + 1).toString().padStart(2, '0');
		const dayStr = day.toString().padStart(2, '0');
		return `${yearStr}-${monthStr}-${dayStr}`;
	}

	// Get months to display
	let monthsToDisplay = $derived(() => {
		const months: Array<{ year: number; month: number }> = [];
		const start = parseLocalDate(startDate);
		const end = parseLocalDate(endDate);

		const current = new Date(start);
		current.setDate(1); // First day of month

		while (current <= end) {
			months.push({
				year: current.getFullYear(),
				month: current.getMonth()
			});
			current.setMonth(current.getMonth() + 1);
		}

		return months.slice(0, 12); // Limit to 12 months
	});

	// Generate calendar days for a month
	function getMonthDays(year: number, month: number): Array<{ date: string; inMonth: boolean }> {
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const firstDayOfWeek = firstDay.getDay();

		const days: Array<{ date: string; inMonth: boolean }> = [];

		// Add previous month padding
		for (let i = 0; i < firstDayOfWeek; i++) {
			days.push({ date: '', inMonth: false });
		}

		// Add current month days
		for (let day = 1; day <= lastDay.getDate(); day++) {
			const dateStr = formatLocalDate(year, month, day);
			days.push({ date: dateStr, inMonth: true });
		}

		return days;
	}

	function getMonthName(month: number): string {
		const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return names[month];
	}

	function getDayClass(dateStr: string): string {
		if (!dateStr) return '';

		const dateInfo = dateMap().get(dateStr);
		if (!dateInfo) {
			return 'bg-gray-100 dark:bg-gray-800 text-gray-400';
		}

		if (dateInfo.is_available) {
			return 'bg-green-500 text-white hover:bg-green-600';
		} else {
			return 'bg-red-500 text-white hover:bg-red-600';
		}
	}

	// Calculate statistics
	let stats = $derived(() => {
		const start = parseLocalDate(startDate);
		const end = parseLocalDate(endDate);
		const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

		const availableDates = generatedDates.filter(d => d.is_available).length;
		const unavailableDates = generatedDates.filter(d => !d.is_available).length;
		const notSetDates = totalDays - generatedDates.length;

		return {
			totalDays,
			availableDates,
			unavailableDates,
			notSetDates
		};
	});
</script>

<Card class="p-4">
	<div class="space-y-4">
		<!-- Header with Stats -->
		<div class="flex items-center justify-between">
			<h4 class="text-sm font-semibold">Calendar Preview</h4>
			<div class="flex items-center gap-4 text-xs">
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-green-500"></div>
					<span>{stats().availableDates} available</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-red-500"></div>
					<span>{stats().unavailableDates} unavailable</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-gray-300 dark:bg-gray-700"></div>
					<span>{stats().notSetDates} not set</span>
				</div>
			</div>
		</div>

		<!-- Calendar Grid -->
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each monthsToDisplay() as { year, month }}
				<div class="space-y-2">
					<!-- Month Header -->
					<div class="text-center text-sm font-medium">
						{getMonthName(month)} {year}
					</div>

					<!-- Day Labels -->
					<div class="grid grid-cols-7 gap-0.5 text-xs text-center text-muted-foreground mb-1">
						<div>S</div>
						<div>M</div>
						<div>T</div>
						<div>W</div>
						<div>T</div>
						<div>F</div>
						<div>S</div>
					</div>

					<!-- Days Grid -->
					<div class="grid grid-cols-7 gap-0.5">
						{#each getMonthDays(year, month) as day}
							{#if day.inMonth && day.date}
								<button
									type="button"
									class={`aspect-square text-xs rounded transition-colors ${getDayClass(day.date)} ${onDateClick ? 'cursor-pointer' : 'cursor-default'}`}
									onclick={() => onDateClick?.(day.date)}
									disabled={!onDateClick}
									title={day.date}
								>
									{parseLocalDate(day.date).getDate()}
								</button>
							{:else}
								<div class="aspect-square"></div>
							{/if}
						{/each}
					</div>
				</div>
			{/each}
		</div>

		{#if monthsToDisplay().length === 0}
			<div class="text-center py-8 text-sm text-muted-foreground">
				Set a date range to preview availability
			</div>
		{/if}
	</div>
</Card>
