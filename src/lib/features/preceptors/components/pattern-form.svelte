<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import type {
		CreatePattern,
		WeeklyConfig,
		MonthlyConfig,
		BlockConfig
	} from '$lib/features/preceptors/pattern-schemas';

	interface Props {
		preceptorId: string;
		onSuccess?: (pattern: CreatePattern) => void;
		onCancel?: () => void;
		editPattern?: CreatePattern | null;
	}

	let { preceptorId, onSuccess, onCancel, editPattern = null }: Props = $props();

	// Form state
	let patternType = $state<'weekly' | 'monthly' | 'block' | 'individual'>('weekly');
	let isAvailable = $state(true);
	let startDate = $state('');
	let endDate = $state('');
	let reason = $state('');

	// Weekly config
	let selectedDays = $state<Set<number>>(new Set([1, 2, 3, 4, 5])); // Mon-Fri default

	// Monthly config
	let monthlyType = $state<'first_week' | 'last_week' | 'first_business_week' | 'last_business_week' | 'specific_days'>('first_week');
	let weekDefinition = $state<'seven_days' | 'calendar' | 'business'>('seven_days');
	let specificDays = $state<string>('1,15'); // Comma-separated

	// Block config
	let excludeWeekends = $state(false);

	// Initialize dates
	$effect(() => {
		if (!startDate) {
			const today = new Date().toISOString().split('T')[0];
			startDate = today;
			endDate = today;
		}
	});

	// Load edit pattern
	$effect(() => {
		if (editPattern) {
			patternType = editPattern.pattern_type;
			isAvailable = editPattern.is_available;
			startDate = editPattern.date_range_start;
			endDate = editPattern.date_range_end;
			reason = editPattern.reason || '';

			if (editPattern.pattern_type === 'weekly' && editPattern.config) {
				selectedDays = new Set((editPattern.config as WeeklyConfig).days_of_week);
			} else if (editPattern.pattern_type === 'monthly' && editPattern.config) {
				const config = editPattern.config as MonthlyConfig;
				monthlyType = config.monthly_type;
				if (config.week_definition) {
					weekDefinition = config.week_definition;
				}
				if (config.specific_days) {
					specificDays = config.specific_days.join(',');
				}
			} else if (editPattern.pattern_type === 'block' && editPattern.config) {
				excludeWeekends = (editPattern.config as BlockConfig).exclude_weekends;
			}
		}
	});

	function toggleDay(day: number) {
		const newSet = new Set(selectedDays);
		if (newSet.has(day)) {
			newSet.delete(day);
		} else {
			newSet.add(day);
		}
		selectedDays = newSet;
	}

	function buildPattern(): CreatePattern {
		let config: any = null;
		let specificity = 1;

		switch (patternType) {
			case 'weekly':
				config = {
					days_of_week: Array.from(selectedDays).sort()
				} satisfies WeeklyConfig;
				specificity = 1;
				break;

			case 'monthly':
				const monthlyConfig: MonthlyConfig = {
					monthly_type: monthlyType
				};
				if (monthlyType === 'first_week' || monthlyType === 'last_week') {
					monthlyConfig.week_definition = weekDefinition;
				}
				if (monthlyType === 'specific_days') {
					monthlyConfig.specific_days = specificDays
						.split(',')
						.map(d => parseInt(d.trim()))
						.filter(d => !isNaN(d) && d >= 1 && d <= 31)
						.sort((a, b) => a - b);
				}
				config = monthlyConfig;
				specificity = 1;
				break;

			case 'block':
				config = {
					exclude_weekends: excludeWeekends
				} satisfies BlockConfig;
				specificity = 2;
				break;

			case 'individual':
				config = null;
				specificity = 3;
				break;
		}

		return {
			preceptor_id: preceptorId,
			pattern_type: patternType,
			is_available: isAvailable,
			specificity,
			date_range_start: startDate,
			date_range_end: patternType === 'individual' ? startDate : endDate,
			config,
			reason: reason || undefined,
			enabled: true
		};
	}

	function handleSubmit() {
		const pattern = buildPattern();
		onSuccess?.(pattern);
	}

	// Computed values
	let isValid = $derived(() => {
		if (!startDate) return false;
		if (patternType !== 'individual' && !endDate) return false;
		if (patternType === 'weekly' && selectedDays.size === 0) return false;
		if (patternType === 'monthly' && monthlyType === 'specific_days') {
			const days = specificDays.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
			if (days.length === 0) return false;
		}
		return true;
	});

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
			<h3 class="text-lg font-semibold">
				{editPattern ? 'Edit Pattern' : 'Add Availability Pattern'}
			</h3>
			<p class="text-sm text-muted-foreground mt-1">
				Create a pattern to define when this preceptor is available
			</p>
		</div>

		<!-- Pattern Type Selector -->
		<div class="space-y-2">
			<Label>Pattern Type</Label>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
				<button
					type="button"
					onclick={() => (patternType = 'weekly')}
					class={`px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						patternType === 'weekly'
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Weekly
				</button>
				<button
					type="button"
					onclick={() => (patternType = 'monthly')}
					class={`px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						patternType === 'monthly'
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Monthly
				</button>
				<button
					type="button"
					onclick={() => (patternType = 'block')}
					class={`px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						patternType === 'block'
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Block
				</button>
				<button
					type="button"
					onclick={() => (patternType = 'individual')}
					class={`px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						patternType === 'individual'
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Individual
				</button>
			</div>
		</div>

		<!-- Availability Toggle -->
		<div class="space-y-2">
			<Label>Availability</Label>
			<div class="flex gap-3">
				<button
					type="button"
					onclick={() => (isAvailable = true)}
					class={`flex-1 px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						isAvailable
							? 'bg-green-100 text-green-900 border-green-300 dark:bg-green-900 dark:text-green-100'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Available
				</button>
				<button
					type="button"
					onclick={() => (isAvailable = false)}
					class={`flex-1 px-4 py-3 text-sm font-medium rounded-md border transition-colors ${
						!isAvailable
							? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-900 dark:text-red-100'
							: 'bg-background border-input hover:bg-accent'
					}`}
				>
					Unavailable
				</button>
			</div>
		</div>

		<!-- Pattern-specific configuration -->
		<div class="space-y-4">
			{#if patternType === 'weekly'}
				<!-- Weekly Pattern -->
				<div class="space-y-2">
					<Label>Days of Week</Label>
					<div class="flex gap-2">
						{#each daysOfWeek as day}
							<button
								type="button"
								onclick={() => toggleDay(day.value)}
								class={`px-3 py-2 text-sm font-medium rounded border transition-colors ${
									selectedDays.has(day.value)
										? 'bg-primary text-primary-foreground border-primary'
										: 'bg-background border-input hover:bg-accent'
								}`}
							>
								{day.label}
							</button>
						{/each}
					</div>
				</div>
			{:else if patternType === 'monthly'}
				<!-- Monthly Pattern -->
				<div class="space-y-3">
					<div class="space-y-2">
						<Label>Monthly Pattern</Label>
						<select
							bind:value={monthlyType}
							class="w-full px-3 py-2 border rounded-md bg-background"
						>
							<option value="first_week">First Week</option>
							<option value="last_week">Last Week</option>
							<option value="first_business_week">First Business Week (5 days)</option>
							<option value="last_business_week">Last Business Week (5 days)</option>
							<option value="specific_days">Specific Days of Month</option>
						</select>
					</div>

					{#if monthlyType === 'first_week' || monthlyType === 'last_week'}
						<div class="space-y-2">
							<Label>Week Definition</Label>
							<select
								bind:value={weekDefinition}
								class="w-full px-3 py-2 border rounded-md bg-background"
							>
								<option value="seven_days">First/Last 7 Days</option>
								<option value="calendar">Calendar Week (Sun-Sat)</option>
								<option value="business">Business Week (Mon-Fri)</option>
							</select>
						</div>
					{/if}

					{#if monthlyType === 'specific_days'}
						<div class="space-y-2">
							<Label>Specific Days (comma-separated)</Label>
							<Input
								type="text"
								bind:value={specificDays}
								placeholder="1, 15, 30"
							/>
							<p class="text-xs text-muted-foreground">
								Example: 1,15 for 1st and 15th of each month
							</p>
						</div>
					{/if}
				</div>
			{:else if patternType === 'block'}
				<!-- Block Pattern -->
				<div class="flex items-center gap-2">
					<input
						type="checkbox"
						id="exclude-weekends"
						bind:checked={excludeWeekends}
						class="w-4 h-4 rounded border-input"
					/>
					<Label for="exclude-weekends">Exclude Weekends</Label>
				</div>
			{/if}

			<!-- Date Range -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="start-date">
						{patternType === 'individual' ? 'Date' : 'Start Date'}
					</Label>
					<Input id="start-date" type="date" bind:value={startDate} />
				</div>
				{#if patternType !== 'individual'}
					<div class="space-y-2">
						<Label for="end-date">End Date</Label>
						<Input id="end-date" type="date" bind:value={endDate} />
					</div>
				{/if}
			</div>

			<!-- Optional Reason -->
			{#if patternType === 'individual'}
				<div class="space-y-2">
					<Label for="reason">Reason (optional)</Label>
					<Input
						id="reason"
						type="text"
						bind:value={reason}
						placeholder="e.g., Conference attendance"
					/>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-3 pt-4 border-t">
			{#if onCancel}
				<Button type="button" variant="outline" onclick={onCancel}>
					Cancel
				</Button>
			{/if}
			<Button onclick={handleSubmit} disabled={!isValid()}>
				{editPattern ? 'Update Pattern' : 'Add Pattern'}
			</Button>
		</div>
	</div>
</Card>
