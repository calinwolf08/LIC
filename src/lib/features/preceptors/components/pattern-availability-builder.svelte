<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import PatternForm from './pattern-form.svelte';
	import PatternList from './pattern-list.svelte';
	import CalendarPreview from './calendar-preview.svelte';
	import type {
		Pattern,
		CreatePattern,
		PatternGenerationResult
	} from '$lib/features/preceptors/pattern-schemas';

	// Accept any preceptor-like object with id
	interface PreceptorLike {
		id: string;
		name: string;
	}

	interface Props {
		preceptor: PreceptorLike;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, onSuccess, onCancel }: Props = $props();

	// Local state for patterns (not yet saved to database)
	let localPatterns = $state<Pattern[]>([]);
	let nextTempId = $state(1);
	let generationResult = $state<PatternGenerationResult | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let error = $state<string | null>(null);
	let showPatternForm = $state(false);
	let editingPattern = $state<Pattern | null>(null);
	let editingIndex = $state<number | null>(null);

	// Load existing patterns from database
	$effect(() => {
		loadPatterns();
	});

	async function loadPatterns() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns`);
			if (!response.ok) {
				throw new Error('Failed to load patterns');
			}

			const result = await response.json();
			localPatterns = result.data;

			// Auto-generate preview if patterns exist
			if (localPatterns.length > 0) {
				await generatePreviewLocal();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load patterns';
		} finally {
			isLoading = false;
		}
	}

	// Generate preview from local patterns (client-side)
	async function generatePreviewLocal() {
		if (localPatterns.length === 0) {
			generationResult = null;
			return;
		}

		isGenerating = true;
		error = null;

		try {
			// Import the pattern generator functions
			const { applyPatternsBySpecificity } = await import('../services/pattern-generators');

			// Convert Pattern[] to CreatePattern[]
			const createPatterns: CreatePattern[] = localPatterns
				.filter(p => p.enabled)
				.map(p => ({
					preceptor_id: p.preceptor_id,
					pattern_type: p.pattern_type as any,
					is_available: p.is_available === 1,
					specificity: p.specificity,
					date_range_start: p.date_range_start,
					date_range_end: p.date_range_end,
					config: p.config,
					reason: p.reason || undefined,
					enabled: p.enabled === 1
				}));

			// Generate dates locally
			const generatedDates = applyPatternsBySpecificity(createPatterns);

			// Calculate stats
			const availableDates = generatedDates.filter(d => d.is_available).length;
			const unavailableDates = generatedDates.filter(d => !d.is_available).length;

			generationResult = {
				generated_dates: generatedDates.length,
				available_dates: availableDates,
				unavailable_dates: unavailableDates,
				preview: generatedDates
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate preview';
			generationResult = null;
		} finally {
			isGenerating = false;
		}
	}

	// Add pattern to local state only
	function handleAddPattern(pattern: CreatePattern) {
		error = null;

		// Create a temporary ID for the pattern
		const tempId = `temp-${nextTempId}`;
		nextTempId++;

		const newPattern: Pattern = {
			id: tempId,
			preceptor_id: pattern.preceptor_id,
			pattern_type: pattern.pattern_type,
			is_available: pattern.is_available ? 1 : 0,
			specificity: pattern.specificity,
			date_range_start: pattern.date_range_start,
			date_range_end: pattern.date_range_end,
			config: pattern.config,
			reason: pattern.reason || null,
			enabled: pattern.enabled ? 1 : 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		localPatterns = [...localPatterns, newPattern];
		showPatternForm = false;
		generatePreviewLocal();
	}

	// Update pattern in local state only
	function handleUpdatePattern(pattern: CreatePattern) {
		if (editingIndex === null) return;

		error = null;

		const updated: Pattern = {
			...localPatterns[editingIndex],
			pattern_type: pattern.pattern_type,
			is_available: pattern.is_available ? 1 : 0,
			specificity: pattern.specificity,
			date_range_start: pattern.date_range_start,
			date_range_end: pattern.date_range_end,
			config: pattern.config,
			reason: pattern.reason || null,
			enabled: pattern.enabled ? 1 : 0,
			updated_at: new Date().toISOString()
		};

		localPatterns = [
			...localPatterns.slice(0, editingIndex),
			updated,
			...localPatterns.slice(editingIndex + 1)
		];

		editingPattern = null;
		editingIndex = null;
		generatePreviewLocal();
	}

	// Delete pattern from local state only
	function handleDeletePattern(patternId: string) {
		if (!confirm('Are you sure you want to delete this pattern?')) {
			return;
		}

		error = null;
		localPatterns = localPatterns.filter(p => p.id !== patternId);
		generatePreviewLocal();
	}

	// Toggle enabled in local state only
	function handleToggleEnabled(patternId: string, enabled: boolean) {
		error = null;

		localPatterns = localPatterns.map(p =>
			p.id === patternId
				? { ...p, enabled: enabled ? 1 : 0, updated_at: new Date().toISOString() }
				: p
		);

		generatePreviewLocal();
	}

	function handleEdit(pattern: Pattern) {
		// Find the index
		const index = localPatterns.findIndex(p => p.id === pattern.id);
		if (index === -1) return;

		editingPattern = pattern;
		editingIndex = index;
		showPatternForm = false; // Hide add form
	}

	// Save all patterns and generate availability dates
	async function handleSaveAll() {
		if (!generationResult || generationResult.generated_dates === 0) {
			error = 'No patterns to save. Add patterns first.';
			return;
		}

		if (!confirm(`Save ${generationResult.generated_dates} availability dates?`)) {
			return;
		}

		isSaving = true;
		error = null;

		try {
			// Step 1: Delete all existing patterns
			const existingResponse = await fetch(`/api/preceptors/${preceptor.id}/patterns`);
			if (existingResponse.ok) {
				const existingData = await existingResponse.json();
				const existingPatterns = existingData.data || [];

				for (const existing of existingPatterns) {
					await fetch(`/api/preceptors/${preceptor.id}/patterns/${existing.id}`, {
						method: 'DELETE'
					});
				}
			}

			// Step 2: Create all local patterns (skip temp ones, create new)
			for (const pattern of localPatterns) {
				// Skip temporary patterns, create new ones
				if (pattern.id?.startsWith('temp-')) {
					const createData: CreatePattern = {
						preceptor_id: pattern.preceptor_id,
						pattern_type: pattern.pattern_type as any,
						is_available: pattern.is_available === 1,
						specificity: pattern.specificity,
						date_range_start: pattern.date_range_start,
						date_range_end: pattern.date_range_end,
						config: pattern.config,
						reason: pattern.reason || undefined,
						enabled: pattern.enabled === 1
					};

					const response = await fetch(`/api/preceptors/${preceptor.id}/patterns`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(createData)
					});

					if (!response.ok) {
						const result = await response.json();
						throw new Error(result.error?.message || 'Failed to save pattern');
					}
				} else {
					// For existing patterns, also recreate them
					const createData: CreatePattern = {
						preceptor_id: pattern.preceptor_id,
						pattern_type: pattern.pattern_type as any,
						is_available: pattern.is_available === 1,
						specificity: pattern.specificity,
						date_range_start: pattern.date_range_start,
						date_range_end: pattern.date_range_end,
						config: pattern.config,
						reason: pattern.reason || undefined,
						enabled: pattern.enabled === 1
					};

					const response = await fetch(`/api/preceptors/${preceptor.id}/patterns`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(createData)
					});

					if (!response.ok) {
						const result = await response.json();
						throw new Error(result.error?.message || 'Failed to save pattern');
					}
				}
			}

			// Step 3: Generate and save availability dates
			const saveResponse = await fetch(`/api/preceptors/${preceptor.id}/patterns/save`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					clear_existing: true
				})
			});

			if (!saveResponse.ok) {
				const result = await saveResponse.json();
				throw new Error(result.error?.message || 'Failed to save availability dates');
			}

			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save patterns';
		} finally {
			isSaving = false;
		}
	}

	// Get date range from patterns for calendar preview
	let dateRange = $derived(() => {
		if (localPatterns.length === 0) {
			const today = new Date().toISOString().split('T')[0];
			return { start: today, end: today };
		}

		const startDates = localPatterns.map(p => p.date_range_start);
		const endDates = localPatterns.map(p => p.date_range_end);

		return {
			start: startDates.sort()[0],
			end: endDates.sort().reverse()[0]
		};
	});

	// Track if there are unsaved changes
	let hasUnsavedChanges = $derived(localPatterns.some(p => p.id?.startsWith('temp-')));
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-lg font-semibold">Availability Patterns for {preceptor.name}</h3>
		<p class="text-sm text-muted-foreground mt-1">
			Create patterns to define year-long availability schedules
			{#if hasUnsavedChanges}
				<span class="text-orange-600 dark:text-orange-400">• Unsaved changes</span>
			{/if}
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if isLoading}
		<Card class="p-6">
			<p class="text-sm text-muted-foreground">Loading patterns...</p>
		</Card>
	{:else}
		<!-- Pattern Form (Add or Edit) -->
		{#if showPatternForm || editingPattern}
			<PatternForm
				preceptorId={preceptor.id!}
				editPattern={editingPattern}
				onSuccess={editingPattern ? handleUpdatePattern : handleAddPattern}
				onCancel={() => {
					showPatternForm = false;
					editingPattern = null;
					editingIndex = null;
				}}
			/>
		{:else}
			<Button onclick={() => (showPatternForm = true)}>
				+ Add Pattern
			</Button>
		{/if}

		<!-- Existing Patterns -->
		{#if localPatterns.length > 0}
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">Patterns ({localPatterns.length})</h4>
					{#if !isGenerating}
						<Button size="sm" variant="outline" onclick={generatePreviewLocal}>
							Refresh Preview
						</Button>
					{/if}
				</div>

				<PatternList
					patterns={localPatterns}
					onEdit={handleEdit}
					onDelete={handleDeletePattern}
					onToggleEnabled={handleToggleEnabled}
				/>
			</div>
		{/if}

		<!-- Calendar Preview -->
		{#if generationResult}
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">
						Preview ({generationResult.generated_dates} dates)
					</h4>
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<span>{generationResult.available_dates} available</span>
						<span>•</span>
						<span>{generationResult.unavailable_dates} unavailable</span>
					</div>
				</div>

				{#if isGenerating}
					<Card class="p-6">
						<p class="text-sm text-muted-foreground">Generating preview...</p>
					</Card>
				{:else}
					<CalendarPreview
						generatedDates={generationResult.preview}
						startDate={dateRange().start}
						endDate={dateRange().end}
					/>
				{/if}
			</div>
		{:else if localPatterns.length > 0}
			<Card class="p-6">
				<div class="text-center">
					<p class="text-sm text-muted-foreground mb-4">
						Click "Refresh Preview" to see generated availability
					</p>
					<Button size="sm" onclick={generatePreviewLocal} disabled={isGenerating}>
						{isGenerating ? 'Generating...' : 'Generate Preview'}
					</Button>
				</div>
			</Card>
		{/if}

		<!-- Actions -->
		<div class="flex justify-end gap-3 pt-4 border-t">
			{#if onCancel}
				<Button type="button" variant="outline" onclick={onCancel} disabled={isSaving}>
					Cancel
				</Button>
			{/if}
			<Button
				onclick={handleSaveAll}
				disabled={isSaving || !generationResult || generationResult.generated_dates === 0}
			>
				{#if isSaving}
					Saving...
				{:else if generationResult}
					Save {generationResult.generated_dates} Dates
				{:else}
					Save All
				{/if}
			</Button>
		</div>
	{/if}
</div>
