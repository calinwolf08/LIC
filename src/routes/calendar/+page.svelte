<script lang="ts">
	import type { PageData } from './$types';
	import type { CalendarEvent, EnrichedAssignment } from '$lib/features/schedules/types';
	import type { CalendarMonth, CalendarDay, CalendarDayAssignment } from '$lib/features/schedules/types/schedule-views';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import EditAssignmentModal from '$lib/features/schedules/components/edit-assignment-modal.svelte';
	import ReassignModal from '$lib/features/schedules/components/reassign-modal.svelte';
	import RegenerateDialog from '$lib/features/schedules/components/regenerate-dialog.svelte';
	import ScheduleCalendarGrid from '$lib/features/schedules/components/schedule-calendar-grid.svelte';
	import { BlackoutDateManager } from '$lib/features/blackout-dates/components';
	import { invalidateAll, goto } from '$app/navigation';
	import {
		formatDisplayDate as formatDateDisplay,
		formatMonthYear,
		formatUTCDate,
		parseUTCDate,
		getMonthsBetween,
		getTodayUTC
	} from '$lib/features/scheduling/utils/date-utils';

	let { data }: { data: PageData } = $props();

	// Blackout dates state
	let blackoutDates = $state(data.blackoutDates || []);
	let showBlackoutPanel = $state(false);

	// Create a Set of blackout dates for efficient lookup
	let blackoutDateSet = $derived(new Set(blackoutDates.map(bd => bd.date)));

	// Refresh blackout dates
	async function refreshBlackoutDates() {
		try {
			const response = await fetch('/api/blackout-dates');
			const result = await response.json();
			if (result.data) {
				blackoutDates = result.data;
			}
		} catch (error) {
			console.error('Failed to refresh blackout dates:', error);
		}
		// Also reload calendar in case assignments were deleted
		loadCalendar();
	}

	// View mode toggle
	let viewMode = $state<'list' | 'calendar'>('list');

	// Current date range (default to current month)
	const today = new Date();
	const firstDayOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
	const lastDayOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

	let startDate = $state(formatUTCDate(firstDayOfMonth));
	let endDate = $state(formatUTCDate(lastDayOfMonth));

	// Filters
	let selectedStudent = $state<string>('');
	let selectedPreceptor = $state<string>('');
	let selectedClerkship = $state<string>('');

	// Calendar events
	let events = $state<CalendarEvent[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Modals
	let showEditModal = $state(false);
	let showReassignModal = $state(false);
	let showRegenerateDialog = $state(false);
	let selectedAssignment = $state<EnrichedAssignment | null>(null);

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

	// Navigate months - use UTC to avoid timezone shifts
	function previousMonth() {
		const date = new Date(startDate + 'T00:00:00.000Z');
		date.setUTCMonth(date.getUTCMonth() - 1);
		const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
		const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
		startDate = formatUTCDate(firstDay);
		endDate = formatUTCDate(lastDay);
	}

	function nextMonth() {
		const date = new Date(startDate + 'T00:00:00.000Z');
		date.setUTCMonth(date.getUTCMonth() + 1);
		const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
		const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
		startDate = formatUTCDate(firstDay);
		endDate = formatUTCDate(lastDay);
	}

	function clearFilters() {
		selectedStudent = '';
		selectedPreceptor = '';
		selectedClerkship = '';
	}

	// Edit assignment
	function handleEditClick(assignment: EnrichedAssignment) {
		selectedAssignment = assignment;
		showEditModal = true;
	}

	function handleEditSave() {
		showEditModal = false;
		selectedAssignment = null;
		loadCalendar();
	}

	function handleEditCancel() {
		showEditModal = false;
		selectedAssignment = null;
	}

	function handleEditDelete() {
		showEditModal = false;
		selectedAssignment = null;
		loadCalendar();
	}

	// Reassign
	function handleReassignClick(assignment: EnrichedAssignment) {
		selectedAssignment = assignment;
		showEditModal = false;
		showReassignModal = true;
	}

	function handleReassignSave() {
		showReassignModal = false;
		selectedAssignment = null;
		loadCalendar();
	}

	function handleReassignCancel() {
		showReassignModal = false;
		selectedAssignment = null;
	}

	// Regenerate schedule
	function handleRegenerateClick() {
		showRegenerateDialog = true;
	}

	function handleRegenerateConfirm() {
		showRegenerateDialog = false;
		loadCalendar();
		invalidateAll();
	}

	function handleRegenerateCancel() {
		showRegenerateDialog = false;
	}

	// Export to Excel
	let isExporting = $state(false);

	async function handleExport() {
		isExporting = true;

		try {
			// Build query params
			let queryParams = `start_date=${startDate}&end_date=${endDate}`;
			if (selectedStudent) queryParams += `&student_id=${selectedStudent}`;
			if (selectedPreceptor) queryParams += `&preceptor_id=${selectedPreceptor}`;
			if (selectedClerkship) queryParams += `&clerkship_id=${selectedClerkship}`;

			// Fetch Excel file
			const response = await fetch(`/api/schedules/export?${queryParams}`);

			if (!response.ok) {
				throw new Error('Export failed');
			}

			// Get filename from header
			const contentDisposition = response.headers.get('Content-Disposition');
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] || 'schedule.xlsx';

			// Download file
			const blob = await response.blob();
			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = downloadUrl;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(downloadUrl);
		} catch (error) {
			console.error('Export error:', error);
			alert('Failed to export schedule');
		} finally {
			isExporting = false;
		}
	}

	// Build calendar months for grid view
	let calendarMonths = $derived(() => {
		const todayStr = getTodayUTC();
		const months = getMonthsBetween(startDate, endDate);
		const result: CalendarMonth[] = [];

		// Build assignment map - collect all events per date
		const assignmentMap = new Map<string, CalendarEvent[]>();
		for (const event of events) {
			if (!assignmentMap.has(event.date)) {
				assignmentMap.set(event.date, []);
			}
			assignmentMap.get(event.date)!.push(event);
		}

		for (const { year, month, name } of months) {
			const weeks: Array<{ weekNumber: number; days: CalendarDay[] }> = [];
			const firstDay = new Date(Date.UTC(year, month - 1, 1));
			const lastDay = new Date(Date.UTC(year, month, 0));

			// Start from Sunday of the week containing the 1st
			const weekStart = new Date(firstDay);
			weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

			let weekNumber = 1;
			let currentDate = new Date(weekStart);

			while (currentDate <= lastDay || currentDate.getUTCDay() !== 0) {
				const days: CalendarDay[] = [];

				for (let i = 0; i < 7; i++) {
					const dateStr = formatUTCDate(currentDate);
					const dayOfMonth = currentDate.getUTCDate();
					const isCurrentMonth = currentDate.getUTCMonth() === month - 1;
					const dayOfWeek = currentDate.getUTCDay();
					const dayEvents = assignmentMap.get(dateStr) || [];

					// Convert events to CalendarDayAssignment array
					const assignments: CalendarDayAssignment[] = dayEvents.map((event) => ({
						id: event.assignment.id,
						clerkshipId: event.assignment.clerkship_id,
						clerkshipName: event.assignment.clerkship_name,
						preceptorId: event.assignment.preceptor_id,
						preceptorName: event.assignment.preceptor_name,
						studentId: event.assignment.student_id,
						studentName: event.assignment.student_name,
						color: event.color
					}));

					days.push({
						date: dateStr,
						dayOfMonth,
						dayOfWeek,
						isCurrentMonth,
						isToday: dateStr === todayStr,
						isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
						assignments,
						// Keep assignment for backward compatibility
						assignment: assignments[0]
					});

					currentDate.setUTCDate(currentDate.getUTCDate() + 1);
				}

				weeks.push({ weekNumber, days });
				weekNumber++;

				if (currentDate > lastDay && currentDate.getUTCDay() === 0) break;
			}

			result.push({ year, month, monthName: name, weeks });
		}

		return result;
	});

	// Handle day click in calendar grid (opens first assignment if any)
	function handleDayClick(day: CalendarDay) {
		if (day.assignments && day.assignments.length > 0) {
			// Find the full event to get the enriched assignment
			const event = events.find((e) => e.assignment.id === day.assignments[0].id);
			if (event) {
				handleEditClick(event.assignment);
			}
		}
	}

	// Handle clicking on a specific assignment in the calendar grid
	function handleAssignmentClick(_day: CalendarDay, assignment: CalendarDayAssignment) {
		const event = events.find((e) => e.assignment.id === assignment.id);
		if (event) {
			handleEditClick(event.assignment);
		}
	}
</script>

<div class="container mx-auto py-8">
	<!-- Schedule completeness banner -->
	{#if data.scheduleSummary && !data.scheduleSummary.isComplete}
		<Card class="p-4 mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="text-amber-600 dark:text-amber-400">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<div>
						<p class="font-medium text-amber-800 dark:text-amber-200">Schedule Incomplete</p>
						<p class="text-sm text-amber-700 dark:text-amber-300">
							{data.scheduleSummary.studentsWithUnmetRequirements.length} student{data.scheduleSummary.studentsWithUnmetRequirements.length === 1 ? '' : 's'} with unmet requirements
						</p>
					</div>
				</div>
				<Button variant="outline" size="sm" onclick={() => goto('/schedule/results')}>
					View Details
				</Button>
			</div>
		</Card>
	{/if}

	<div class="mb-6 flex items-center justify-between flex-wrap gap-4">
		<h1 class="text-3xl font-bold">Schedule Calendar</h1>
		<div class="flex gap-3 flex-wrap">
			<Button
				variant={showBlackoutPanel ? 'default' : 'outline'}
				onclick={() => (showBlackoutPanel = !showBlackoutPanel)}
			>
				{showBlackoutPanel ? 'Hide' : 'Show'} Blackout Dates
				{#if blackoutDates.length > 0}
					<span class="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-xs">
						{blackoutDates.length}
					</span>
				{/if}
			</Button>
			<Button variant="outline" onclick={() => goto('/schedule/results')}>
				Schedule Results
			</Button>
			<Button variant="outline" onclick={handleExport} disabled={isExporting}>
				{isExporting ? 'Exporting...' : 'Export to Excel'}
			</Button>
			<Button variant="destructive" onclick={handleRegenerateClick}>
				Regenerate Schedule
			</Button>
		</div>
	</div>

	<!-- Blackout Dates Panel -->
	{#if showBlackoutPanel}
		<div class="mb-6">
			<BlackoutDateManager
				blackoutDates={blackoutDates}
				onAdd={refreshBlackoutDates}
				onDelete={refreshBlackoutDates}
				onRegenerateNeeded={() => (showRegenerateDialog = true)}
			/>
		</div>
	{/if}

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

	<!-- Month Navigation and View Toggle -->
	<div class="flex items-center justify-between mb-6 flex-wrap gap-4">
		<Button variant="outline" onclick={previousMonth}>&larr; Previous Month</Button>
		<div class="flex items-center gap-4">
			<h2 class="text-xl font-semibold">
				{formatMonthYear(startDate)}
			</h2>
			<!-- View Toggle -->
			<div class="flex rounded-md border">
				<button
					type="button"
					class="px-3 py-1.5 text-sm font-medium rounded-l-md transition-colors {viewMode === 'list'
						? 'bg-primary text-primary-foreground'
						: 'hover:bg-muted'}"
					onclick={() => (viewMode = 'list')}
				>
					List
				</button>
				<button
					type="button"
					class="px-3 py-1.5 text-sm font-medium rounded-r-md transition-colors {viewMode === 'calendar'
						? 'bg-primary text-primary-foreground'
						: 'hover:bg-muted'}"
					onclick={() => (viewMode = 'calendar')}
				>
					Calendar
				</button>
			</div>
		</div>
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
	{:else if viewMode === 'calendar'}
		<!-- Calendar Grid View -->
		{#if calendarMonths().length > 0}
			<ScheduleCalendarGrid months={calendarMonths()} mode="student" blackoutDates={blackoutDateSet} onDayClick={handleDayClick} onAssignmentClick={handleAssignmentClick} />
		{:else}
			<Card class="p-8 text-center">
				<p class="text-muted-foreground">No data to display</p>
			</Card>
		{/if}
	{:else if groupedEvents().length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No assignments found for this date range</p>
		</Card>
	{:else}
		<!-- List View -->
		<div class="space-y-4">
			{#each groupedEvents() as { date, events }}
				<Card class="p-6">
					<h3 class="text-lg font-semibold mb-4">{formatDateDisplay(date)}</h3>
					<div class="space-y-3">
						{#each events as event}
							<div
								class="p-4 rounded-lg border-l-4"
								style="border-left-color: {event.color}; background-color: {event.color}10;"
							>
								<div class="flex items-start justify-between flex-wrap gap-2">
									<div>
										<p class="font-medium">
											<button
												onclick={() => goto(`/students/${event.assignment.student_id}`)}
												class="text-primary hover:underline text-left"
											>
												{event.assignment.student_name}
											</button>
											<span class="text-muted-foreground mx-1">-</span>
											<span>{event.assignment.clerkship_name}</span>
										</p>
										<p class="text-sm text-muted-foreground mt-1">
											Preceptor:
											<button
												onclick={() => goto(`/preceptors/${event.assignment.preceptor_id}/schedule`)}
												class="text-primary hover:underline"
											>
												{event.assignment.preceptor_name}
											</button>
										</p>
										<div class="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
											<span>Status: {event.assignment.status}</span>
											<span>Specialty: {event.assignment.clerkship_specialty}</span>
										</div>
									</div>
									<div class="flex gap-2 flex-wrap">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => goto(`/students/${event.assignment.student_id}/schedule`)}
										>
											View Schedule
										</Button>
										<Button
											size="sm"
											variant="outline"
											onclick={() => handleEditClick(event.assignment)}
										>
											Edit
										</Button>
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

<!-- Modals -->
<EditAssignmentModal
	assignment={selectedAssignment}
	open={showEditModal}
	onSave={handleEditSave}
	onCancel={handleEditCancel}
	onReassign={handleReassignClick}
	onDelete={handleEditDelete}
/>

<ReassignModal
	assignment={selectedAssignment}
	preceptors={data.preceptors as any}
	open={showReassignModal}
	onSave={handleReassignSave}
	onCancel={handleReassignCancel}
/>

<RegenerateDialog
	open={showRegenerateDialog}
	onConfirm={handleRegenerateConfirm}
	onCancel={handleRegenerateCancel}
/>
