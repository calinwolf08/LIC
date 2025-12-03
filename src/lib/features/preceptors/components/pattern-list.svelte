<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';

	// Generic pattern interface that works with both Pattern and LocalPattern
	interface PatternLike {
		id: string;
		pattern_type: string;
		is_available: number | boolean;
		enabled: number | boolean;
		specificity: number;
		date_range_start: string;
		date_range_end: string;
		config: any;
		reason?: string | null;
	}

	interface Props {
		patterns: PatternLike[];
		onEdit?: (pattern: PatternLike) => void;
		onDelete?: (patternId: string) => void;
		onToggleEnabled?: (patternId: string, enabled: boolean) => void;
	}

	let { patterns, onEdit, onDelete, onToggleEnabled }: Props = $props();

	function getPatternTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			weekly: 'Weekly',
			monthly: 'Monthly',
			block: 'Block',
			individual: 'Individual'
		};
		return labels[type] || type;
	}

	function getPatternDescription(pattern: PatternLike): string {
		try {
			const config = pattern.config;

			switch (pattern.pattern_type) {
				case 'weekly': {
					const days = config?.days_of_week || [];
					const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
					const dayLabels = days.map((d: number) => dayNames[d]).join(', ');
					return dayLabels || 'No days selected';
				}

				case 'monthly': {
					const monthlyType = config?.monthly_type || '';
					const typeLabels: Record<string, string> = {
						first_week: 'First week of month',
						last_week: 'Last week of month',
						first_business_week: 'First business week',
						last_business_week: 'Last business week',
						specific_days: `Days: ${config?.specific_days?.join(', ') || ''}`
					};
					return typeLabels[monthlyType] || monthlyType;
				}

				case 'block': {
					const excludeWeekends = config?.exclude_weekends || false;
					return excludeWeekends ? 'Excluding weekends' : 'All days';
				}

				case 'individual': {
					return pattern.reason || 'Single date';
				}

				default:
					return '';
			}
		} catch (e) {
			return 'Invalid configuration';
		}
	}

	function formatDate(dateStr: string): string {
		try {
			const date = new Date(dateStr + 'T00:00:00');
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
		} catch {
			return dateStr;
		}
	}

	function getSpecificityLabel(specificity: number): string {
		const labels: Record<number, string> = {
			1: 'Repeating',
			2: 'Block',
			3: 'Override'
		};
		return labels[specificity] || `Level ${specificity}`;
	}

	function getSpecificityColor(specificity: number): string {
		const colors: Record<number, string> = {
			1: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			2: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
			3: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
		};
		return colors[specificity] || 'bg-gray-100 text-gray-800';
	}
</script>

{#if patterns.length === 0}
	<Card class="p-6">
		<div class="text-center py-8">
			<p class="text-muted-foreground">
				No patterns yet. Add your first pattern to get started.
			</p>
		</div>
	</Card>
{:else}
	<div class="space-y-3">
		{#each patterns as pattern (pattern.id)}
			<Card class={`p-4 transition-opacity ${pattern.enabled ? '' : 'opacity-50'}`}>
				<div class="flex items-start justify-between gap-4">
					<!-- Pattern Info -->
					<div class="flex-1 space-y-2">
						<!-- Header -->
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-semibold">
								{getPatternTypeLabel(pattern.pattern_type)}
							</span>
							<span class="text-sm text-muted-foreground">•</span>
							<span
								class={`px-2 py-0.5 text-xs font-medium rounded ${
									pattern.is_available
										? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
										: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
								}`}
							>
								{pattern.is_available ? 'Available' : 'Unavailable'}
							</span>
							<span class="text-sm text-muted-foreground">•</span>
							<span class={`px-2 py-0.5 text-xs font-medium rounded ${getSpecificityColor(pattern.specificity)}`}>
								{getSpecificityLabel(pattern.specificity)}
							</span>
							{#if !pattern.enabled}
								<span class="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
									Disabled
								</span>
							{/if}
						</div>

						<!-- Description -->
						<p class="text-sm text-muted-foreground">
							{getPatternDescription(pattern)}
						</p>

						<!-- Date Range -->
						<div class="text-xs text-muted-foreground">
							{#if pattern.date_range_start === pattern.date_range_end}
								{formatDate(pattern.date_range_start)}
							{:else}
								{formatDate(pattern.date_range_start)} → {formatDate(pattern.date_range_end)}
							{/if}
						</div>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-2">
						{#if onToggleEnabled}
							<Button
								size="sm"
								variant="outline"
								onclick={() => onToggleEnabled?.(pattern.id!, !pattern.enabled)}
							>
								{pattern.enabled ? 'Disable' : 'Enable'}
							</Button>
						{/if}
						{#if onEdit}
							<Button
								size="sm"
								variant="outline"
								onclick={() => onEdit?.(pattern)}
							>
								Edit
							</Button>
						{/if}
						{#if onDelete}
							<Button
								size="sm"
								variant="destructive"
								onclick={() => onDelete?.(pattern.id!)}
							>
								Delete
							</Button>
						{/if}
					</div>
				</div>
			</Card>
		{/each}
	</div>
{/if}
