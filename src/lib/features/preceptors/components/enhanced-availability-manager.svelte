<script lang="ts">
	import type { Preceptors } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';

	interface Props {
		preceptor: Preceptors;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, onSuccess, onCancel }: Props = $props();

	// State
	let selectedDates = $state<Set<string>>(new Set());
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let activeTab = $state<'pattern' | 'range' | 'individual'>('pattern');

	// Pattern input
	let patternStartDate = $state('');
	let patternEndDate = $state('');
	let selectedDaysOfWeek = $state<Set<number>>(new Set([1, 2, 3, 4, 5])); // Mon-Fri by default

	// Range input
	let rangeStartDate = $state('');
	let rangeEndDate = $state('');
	let includeWeekends = $state(false);

	// Individual date input
	let singleDate = $state('');

	// Initialize dates
	$effect(() => {
		const today = new Date().toISOString().split('T')[0];
		const threeMonthsFromNow = new Date();
		threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
		const threeMonthsStr = threeMonthsFromNow.toISOString().split('T')[0];

		patternStartDate = today;
		patternEndDate = threeMonthsStr;
		rangeStartDate = today;
		rangeEndDate = threeMonthsStr;
		singleDate = today;
	});

	// Load existing availability
	async function loadAvailability() {
		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/availability`);
			if (!response.ok) {
				throw new Error('Failed to load availability');
			}

			const result = await response.json();
			const data = result.data;

			// Load dates where is_available = 1
			selectedDates = new Set(
				data
					.filter((item: any) => (item.is_available as unknown as number) === 1)
					.map((item: any) => item.date)
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load availability';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		loadAvailability();
	});

	// Utility: Generate dates from pattern
	function generatePatternDates(): string[] {
		if (!patternStartDate || !patternEndDate) return [];
		if (selectedDaysOfWeek.size === 0) return [];

		const dates: string[] = [];
		const start = new Date(patternStartDate);
		const end = new Date(patternEndDate);

		let current = new Date(start);
		while (current <= end) {
			const dayOfWeek = current.getDay();
			if (selectedDaysOfWeek.has(dayOfWeek)) {
				dates.push(current.toISOString().split('T')[0]);
			}
			current.setDate(current.getDate() + 1);
		}

		return dates;
	}

	// Utility: Generate dates from range
	function generateRangeDates(): string[] {
		if (!rangeStartDate || !rangeEndDate) return [];

		const dates: string[] = [];
		const start = new Date(rangeStartDate);
		const end = new Date(rangeEndDate);

		let current = new Date(start);
		while (current <= end) {
			const dayOfWeek = current.getDay();
			const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

			if (includeWeekends || !isWeekend) {
				dates.push(current.toISOString().split('T')[0]);
			}
			current.setDate(current.getDate() + 1);
		}

		return dates;
	}

	// Actions
	function addPatternDates() {
		const dates = generatePatternDates();
		selectedDates = new Set([...selectedDates, ...dates]);
	}

	function addRangeDates() {
		const dates = generateRangeDates();
		selectedDates = new Set([...selectedDates, ...dates]);
	}

	function addSingleDate() {
		if (singleDate) {
			selectedDates = new Set([...selectedDates, singleDate]);
		}
	}

	function removeDate(date: string) {
		const newSet = new Set(selectedDates);
		newSet.delete(date);
		selectedDates = newSet;
	}

	function clearAll() {
		selectedDates = new Set();
	}

	function toggleDayOfWeek(day: number) {
		const newSet = new Set(selectedDaysOfWeek);
		if (newSet.has(day)) {
			newSet.delete(day);
		} else {
			newSet.add(day);
		}
		selectedDaysOfWeek = newSet;
	}

	async function handleSave() {
		error = null;
		isSaving = true;

		try {
			const availability = Array.from(selectedDates).map((date) => ({
				date,
				is_available: true
			}));

			const response = await fetch(`/api/preceptors/${preceptor.id}/availability`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					availability
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to save availability');
			}

			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save availability';
		} finally {
			isSaving = false;
		}
	}

	// Computed values
	let sortedDates = $derived(Array.from(selectedDates).sort());
	let dateCount = $derived(selectedDates.size);

	const daysOfWeek = [
		{ value: 0, label: 'Sun' },
		{ value: 1, label: 'Mon' },
		{ value: 2, label: 'Tue' },
		{ value: 3, label: 'Wed' },
		{ value: 4, label: 'Thu' },
		{ value: 5, label: 'Fri' },
		{ value: 6, label: 'Sat' }
	];
</script>

<Card class="p-6">
	<div class="space-y-6">
		<div>
			<h3 class="text-lg font-semibold">Availability for {preceptor.name}</h3>
			<p class="text-sm text-muted-foreground mt-1">
				Select dates when this preceptor is available for teaching
			</p>
		</div>

		{#if error}
			<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if isLoading}
			<p class="text-sm text-muted-foreground">Loading...</p>
		{:else}
			<!-- Tabs -->
			<div class="border-b">
				<nav class="-mb-px flex space-x-4">
					<button
						type="button"
						onclick={() => (activeTab = 'pattern')}
						class={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium ${
							activeTab === 'pattern'
								? 'border-primary text-primary'
								: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
						}`}
					>
						Repeating Pattern
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'range')}
						class={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium ${
							activeTab === 'range'
								? 'border-primary text-primary'
								: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
						}`}
					>
						Date Range
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'individual')}
						class={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium ${
							activeTab === 'individual'
								? 'border-primary text-primary'
								: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
						}`}
					>
						Individual Dates
					</button>
				</nav>
			</div>

			<!-- Tab Content -->
			<div class="space-y-4">
				{#if activeTab === 'pattern'}
					<!-- Repeating Pattern Tab -->
					<div class="space-y-4">
						<p class="text-sm text-muted-foreground">
							Select days of the week and a date range to generate repeating availability
						</p>

						<!-- Days of Week Selector -->
						<div>
							<Label>Days of Week</Label>
							<div class="flex gap-2 mt-2">
								{#each daysOfWeek as day}
									<button
										type="button"
										onclick={() => toggleDayOfWeek(day.value)}
										class={`px-3 py-2 text-sm font-medium rounded border transition-colors ${
											selectedDaysOfWeek.has(day.value)
												? 'bg-primary text-primary-foreground border-primary'
												: 'bg-background border-input hover:bg-accent'
										}`}
									>
										{day.label}
									</button>
								{/each}
							</div>
						</div>

						<!-- Date Range -->
						<div class="grid grid-cols-2 gap-4">
							<div>
								<Label for="pattern-start">Start Date</Label>
								<Input id="pattern-start" type="date" bind:value={patternStartDate} />
							</div>
							<div>
								<Label for="pattern-end">End Date</Label>
								<Input id="pattern-end" type="date" bind:value={patternEndDate} />
							</div>
						</div>

						<Button onclick={addPatternDates} disabled={isSaving}>
							Add Pattern ({generatePatternDates().length} dates)
						</Button>
					</div>
				{:else if activeTab === 'range'}
					<!-- Date Range Tab -->
					<div class="space-y-4">
						<p class="text-sm text-muted-foreground">
							Select all dates within a range, optionally excluding weekends
						</p>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<Label for="range-start">Start Date</Label>
								<Input id="range-start" type="date" bind:value={rangeStartDate} />
							</div>
							<div>
								<Label for="range-end">End Date</Label>
								<Input id="range-end" type="date" bind:value={rangeEndDate} />
							</div>
						</div>

						<div class="flex items-center gap-2">
							<Checkbox
								id="include-weekends"
								checked={includeWeekends}
								onCheckedChange={(checked) => {
									includeWeekends = checked === true;
								}}
							/>
							<Label for="include-weekends">Include Weekends</Label>
						</div>

						<Button onclick={addRangeDates} disabled={isSaving}>
							Add Range ({generateRangeDates().length} dates)
						</Button>
					</div>
				{:else if activeTab === 'individual'}
					<!-- Individual Date Tab -->
					<div class="space-y-4">
						<p class="text-sm text-muted-foreground">Add or remove specific dates</p>

						<div class="flex gap-2">
							<div class="flex-1">
								<Label for="single-date" class="sr-only">Date</Label>
								<Input id="single-date" type="date" bind:value={singleDate} />
							</div>
							<Button onclick={addSingleDate} disabled={isSaving}>Add Date</Button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Selected Dates Preview -->
			<div class="border-t pt-4">
				<div class="flex items-center justify-between mb-3">
					<h4 class="text-sm font-semibold">
						Selected Dates ({dateCount} {dateCount === 1 ? 'date' : 'dates'})
					</h4>
					{#if dateCount > 0}
						<Button size="sm" variant="outline" onclick={clearAll} disabled={isSaving}>
							Clear All
						</Button>
					{/if}
				</div>

				{#if dateCount === 0}
					<p class="text-sm text-muted-foreground py-4">
						No dates selected. Use the tabs above to add availability dates.
					</p>
				{:else}
					<div class="max-h-60 overflow-y-auto border rounded-md p-3 space-y-1">
						{#each sortedDates as date}
							<div class="flex items-center justify-between text-sm py-1">
								<span>{new Date(date + 'T00:00:00').toLocaleDateString()}</span>
								<Button
									size="sm"
									variant="ghost"
									onclick={() => removeDate(date)}
									disabled={isSaving}
								>
									Remove
								</Button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-3 pt-4 border-t">
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSaving}>
						Cancel
					</Button>
				{/if}
				<Button onclick={handleSave} disabled={isSaving || dateCount === 0}>
					{isSaving ? 'Saving...' : `Save ${dateCount} ${dateCount === 1 ? 'Date' : 'Dates'}`}
				</Button>
			</div>
		{/if}
	</div>
</Card>
