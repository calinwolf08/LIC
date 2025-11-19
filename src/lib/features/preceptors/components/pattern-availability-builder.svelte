<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import PatternForm from './pattern-form.svelte';
	import PatternList from './pattern-list.svelte';
	import CalendarPreview from './calendar-preview.svelte';
	import type { Preceptors } from '$lib/db/types';
	import type {
		Pattern,
		CreatePattern,
		PatternGenerationResult
	} from '$lib/features/preceptors/pattern-schemas';

	interface Props {
		preceptor: Preceptors;
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { preceptor, onSuccess, onCancel }: Props = $props();

	// State
	let patterns = $state<Pattern[]>([]);
	let generationResult = $state<PatternGenerationResult | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let error = $state<string | null>(null);
	let showPatternForm = $state(false);
	let editingPattern = $state<Pattern | null>(null);

	// Load patterns on mount
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
			patterns = result.data;

			// Auto-generate preview if patterns exist
			if (patterns.length > 0) {
				await generatePreview();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load patterns';
		} finally {
			isLoading = false;
		}
	}

	async function generatePreview() {
		if (patterns.length === 0) {
			generationResult = null;
			return;
		}

		isGenerating = true;
		error = null;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns/generate`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to generate preview');
			}

			const result = await response.json();
			generationResult = result.data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate preview';
			generationResult = null;
		} finally {
			isGenerating = false;
		}
	}

	async function handleAddPattern(pattern: CreatePattern) {
		error = null;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(pattern)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to create pattern');
			}

			showPatternForm = false;
			await loadPatterns();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create pattern';
		}
	}

	async function handleUpdatePattern(pattern: CreatePattern) {
		if (!editingPattern?.id) return;

		error = null;

		try {
			const response = await fetch(
				`/api/preceptors/${preceptor.id}/patterns/${editingPattern.id}`,
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(pattern)
				}
			);

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to update pattern');
			}

			editingPattern = null;
			await loadPatterns();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update pattern';
		}
	}

	async function handleDeletePattern(patternId: string) {
		if (!confirm('Are you sure you want to delete this pattern?')) {
			return;
		}

		error = null;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns/${patternId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to delete pattern');
			}

			await loadPatterns();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete pattern';
		}
	}

	async function handleToggleEnabled(patternId: string, enabled: boolean) {
		error = null;

		try {
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns/${patternId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ enabled })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to update pattern');
			}

			await loadPatterns();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update pattern';
		}
	}

	function handleEdit(pattern: Pattern) {
		// Convert Pattern to CreatePattern format
		const createPattern: CreatePattern = {
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

		editingPattern = pattern;
		showPatternForm = false; // Hide add form
	}

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
			const response = await fetch(`/api/preceptors/${preceptor.id}/patterns/save`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					clear_existing: true
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to save patterns');
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
		if (patterns.length === 0) {
			const today = new Date().toISOString().split('T')[0];
			return { start: today, end: today };
		}

		const startDates = patterns.map(p => p.date_range_start);
		const endDates = patterns.map(p => p.date_range_end);

		return {
			start: startDates.sort()[0],
			end: endDates.sort().reverse()[0]
		};
	});
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-lg font-semibold">Availability Patterns for {preceptor.name}</h3>
		<p class="text-sm text-muted-foreground mt-1">
			Create patterns to define year-long availability schedules
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
				}}
			/>
		{:else}
			<Button onclick={() => (showPatternForm = true)}>
				+ Add Pattern
			</Button>
		{/if}

		<!-- Existing Patterns -->
		{#if patterns.length > 0}
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">Active Patterns ({patterns.length})</h4>
					{#if !isGenerating}
						<Button size="sm" variant="outline" onclick={generatePreview}>
							Refresh Preview
						</Button>
					{/if}
				</div>

				<PatternList
					{patterns}
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
		{:else if patterns.length > 0}
			<Card class="p-6">
				<div class="text-center">
					<p class="text-sm text-muted-foreground mb-4">
						Click "Refresh Preview" to see generated availability
					</p>
					<Button size="sm" onclick={generatePreview} disabled={isGenerating}>
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
