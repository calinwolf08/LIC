<script lang="ts">
	import type { PageData } from './$types';
	import type { CalendarEvent } from '$lib/features/schedules/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	let { data }: { data: PageData } = $props();

	// Current date range (default to current month)
	const today = new Date();
	const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

	let startDate = $state(formatDateForInput(firstDayOfMonth));
	let endDate = $state(formatDateForInput(lastDayOfMonth));

	// Filters
	let selectedStudent = $state<string>('');
	let selectedPreceptor = $state<string>('');
	let selectedClerkship = $state<string>('');

	// Calendar events
	let events = $state<CalendarEvent[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Load calendar data
	async function loadCalendar() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				start_date: startDate,
				end_date: endDate
			});

			if (selectedStudent) params.append('student_id', selectedStudent);
			if (selectedPreceptor) params.append('preceptor_id', selectedPreceptor);
			if (selectedClerkship) params.append('clerkship_id', selectedClerkship);

			const response = await fetch(`/api/calendar?${params.toString()}`);
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error?.message || 'Failed to load calendar');
			}

			events = result.data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			loading = false;
		}
	}

	// Load calendar on mount and when filters change
	$effect(() => {
		loadCalendar();
	});

	// Helper to format date for input
	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	// Group events by date
	let groupedEvents = $derived(() => {
		const grouped = new Map<string, CalendarEvent[]>();

		for (const event of events) {
			if (!grouped.has(event.date)) {
				grouped.set(event.date, []);
			}
			grouped.get(event.date)!.push(event);
		}

		// Convert to sorted array
		return Array.from(grouped.entries())
			.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
			.map(([date, events]) => ({ date, events }));
	});

	// Navigate months
	function previousMonth() {
		const date = new Date(startDate);
		date.setMonth(date.getMonth() - 1);
		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
		startDate = formatDateForInput(firstDay);
		endDate = formatDateForInput(lastDay);
	}

	function nextMonth() {
		const date = new Date(startDate);
		date.setMonth(date.getMonth() + 1);
		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
		startDate = formatDateForInput(firstDay);
		endDate = formatDateForInput(lastDay);
	}

	function formatDisplayDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function clearFilters() {
		selectedStudent = '';
		selectedPreceptor = '';
		selectedClerkship = '';
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Schedule Calendar</h1>
	</div>

	<!-- Filters -->
	<Card class="p-6 mb-6">
		<h2 class="text-lg font-semibold mb-4">Filters</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<!-- Date Range -->
			<div class="space-y-2">
				<Label for="start_date">Start Date</Label>
				<input
					id="start_date"
					type="date"
					bind:value={startDate}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				/>
			</div>

			<div class="space-y-2">
				<Label for="end_date">End Date</Label>
				<input
					id="end_date"
					type="date"
					bind:value={endDate}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				/>
			</div>

			<!-- Student Filter -->
			<div class="space-y-2">
				<Label for="student">Student</Label>
				<select
					id="student"
					bind:value={selectedStudent}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">All Students</option>
					{#each data.students as student}
						<option value={student.id}>{student.name}</option>
					{/each}
				</select>
			</div>

			<!-- Preceptor Filter -->
			<div class="space-y-2">
				<Label for="preceptor">Preceptor</Label>
				<select
					id="preceptor"
					bind:value={selectedPreceptor}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">All Preceptors</option>
					{#each data.preceptors as preceptor}
						<option value={preceptor.id}>{preceptor.name}</option>
					{/each}
				</select>
			</div>

			<!-- Clerkship Filter -->
			<div class="space-y-2">
				<Label for="clerkship">Clerkship</Label>
				<select
					id="clerkship"
					bind:value={selectedClerkship}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">All Clerkships</option>
					{#each data.clerkships as clerkship}
						<option value={clerkship.id}>{clerkship.name}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="flex gap-3 mt-4">
			<Button variant="outline" onclick={clearFilters}>Clear Filters</Button>
		</div>
	</Card>

	<!-- Month Navigation -->
	<div class="flex items-center justify-between mb-6">
		<Button variant="outline" onclick={previousMonth}>&larr; Previous Month</Button>
		<h2 class="text-xl font-semibold">
			{new Date(startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
		</h2>
		<Button variant="outline" onclick={nextMonth}>Next Month &rarr;</Button>
	</div>

	<!-- Calendar View -->
	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading calendar...</p>
		</Card>
	{:else if error}
		<Card class="p-8">
			<p class="text-destructive">{error}</p>
		</Card>
	{:else if groupedEvents().length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No assignments found for this date range</p>
		</Card>
	{:else}
		<div class="space-y-4">
			{#each groupedEvents() as { date, events }}
				<Card class="p-6">
					<h3 class="text-lg font-semibold mb-4">{formatDisplayDate(date)}</h3>
					<div class="space-y-3">
						{#each events as event}
							<div
								class="p-4 rounded-lg border-l-4"
								style="border-left-color: {event.color}; background-color: {event.color}10;"
							>
								<div class="flex items-start justify-between">
									<div>
										<p class="font-medium">{event.title}</p>
										<p class="text-sm text-muted-foreground mt-1">{event.description}</p>
										<div class="flex gap-4 mt-2 text-xs text-muted-foreground">
											<span>Status: {event.assignment.status}</span>
											<span>Specialty: {event.assignment.clerkship_specialty}</span>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
