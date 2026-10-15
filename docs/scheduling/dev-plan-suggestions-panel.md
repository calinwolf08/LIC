# Dev Plan: Actionable Suggestions Panel

**Feature**: Auto-generate fix suggestions based on constraint violations
**Priority**: High
**Effort**: Medium (3-4 hours)
**Value**: Very High - Guides users to solutions

## Overview

Analyze violation data to generate actionable suggestions that tell users exactly what to fix. Transform "something's wrong" into "increase Dr. Smith's capacity by 1".

## Current State

Users see:

- "3 students have unmet requirements"
- No guidance on what to do

## Goal

Add a suggestions panel that provides:

- Specific actionable fixes
- Why each suggestion would help
- Direct links to make the change
- Priority ordering

Example:

```
┌─────────────────────────────────────────────────┐
│ Suggested Fixes                                  │
├─────────────────────────────────────────────────┤
│ 🔴 High Impact                                   │
│                                                  │
│ 1. Increase Preceptor Capacity                  │
│    Dr. Smith reached max 23 times               │
│    Dr. Jones reached max 22 times               │
│    → Increase from 2 to 3 students              │
│    [Edit Dr. Smith →]                            │
│                                                  │
│ 2. Add Friday Availability                      │
│    Downtown Clinic unavailable 15 times         │
│    → Add Friday to site availability            │
│    [Edit Downtown Clinic →]                      │
│                                                  │
│ 🟡 Medium Impact                                 │
│                                                  │
│ 3. Add Pediatric Preceptor                      │
│    Specialty mismatch blocked 12 assignments    │
│    → Add 1 more pediatrics preceptor            │
│    [Add Preceptor →]                             │
└─────────────────────────────────────────────────┘
```

## Implementation

### 1. Create Suggestion Generator Service

**New File**: `src/lib/features/scheduling/services/suggestion-generator.ts`

```typescript
import type { ViolationStat } from '../types';

export interface Suggestion {
	id: string;
	title: string;
	description: string;
	action: string;
	impact: 'high' | 'medium' | 'low';
	constraintType: string;
	violationCount: number;
	actionLink?: {
		href: string;
		label: string;
	};
}

/**
 * Generate actionable suggestions from violation statistics
 */
export function generateSuggestions(violations: ViolationStat[]): Suggestion[] {
	const suggestions: Suggestion[] = [];

	for (const violation of violations) {
		const suggestion = analyzeSingleViolation(violation);
		if (suggestion) {
			suggestions.push(suggestion);
		}
	}

	// Sort by impact then violation count
	return suggestions.sort((a, b) => {
		const impactOrder = { high: 0, medium: 1, low: 2 };
		if (impactOrder[a.impact] !== impactOrder[b.impact]) {
			return impactOrder[a.impact] - impactOrder[b.impact];
		}
		return b.violationCount - a.violationCount;
	});
}

/**
 * Analyze a single constraint violation and generate suggestion
 */
function analyzeSingleViolation(violation: ViolationStat): Suggestion | null {
	const { constraintName, count } = violation;

	// Determine impact level
	const impact = count > 30 ? 'high' : count > 15 ? 'medium' : 'low';

	switch (constraintName) {
		case 'preceptor-capacity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Increase Preceptor Capacity',
				description: `Preceptors reached max capacity ${count} times. Consider increasing capacity limits for busy preceptors.`,
				action: 'Review preceptor capacity settings and increase where possible',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors',
					label: 'View Preceptors'
				}
			};

		case 'site-availability':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Site Availability',
				description: `Sites were unavailable ${count} times. Add more days or sites to increase availability.`,
				action: 'Add availability days to sites or activate more sites',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/sites',
					label: 'View Sites'
				}
			};

		case 'preceptor-availability':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Preceptor Availability',
				description: `Preceptors were unavailable ${count} times. Update preceptor schedules to add more available days.`,
				action: 'Review and update preceptor availability patterns',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors',
					label: 'View Preceptors'
				}
			};

		case 'specialty-match':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Add Specialized Preceptors',
				description: `Specialty requirements couldn't be met ${count} times. Need more preceptors in specific specialties.`,
				action: 'Add preceptors with needed specialty certifications',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/preceptors?action=add',
					label: 'Add Preceptor'
				}
			};

		case 'no-double-booking':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Schedule Conflicts Detected',
				description: `Students had conflicting assignments ${count} times. This is usually a data issue.`,
				action: 'Review existing assignments for conflicts',
				impact,
				constraintType: constraintName,
				violationCount: count
			};

		case 'blackout-date':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Reduce Blackout Dates',
				description: `Blackout dates prevented ${count} assignments. Consider reducing unnecessary blackouts.`,
				action: 'Review blackout date list and remove unnecessary dates',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/calendar',
					label: 'Manage Blackout Dates'
				}
			};

		case 'site-capacity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Increase Site Capacity',
				description: `Sites reached max capacity ${count} times. Increase site limits or add more sites.`,
				action: 'Update site capacity settings or add new clinical sites',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/sites',
					label: 'View Sites'
				}
			};

		case 'health-system-continuity':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Health System Continuity Issues',
				description: `Could not maintain health system continuity ${count} times. Consider relaxing continuity requirements or adding capacity.`,
				action: 'Review continuity settings or increase preceptor capacity',
				impact: 'low', // Usually lower priority
				constraintType: constraintName,
				violationCount: count
			};

		case 'valid-site-for-clerkship':
			return {
				id: `suggestion-${constraintName}`,
				title: 'Associate Sites with Clerkships',
				description: `Sites were invalid for clerkships ${count} times. Configure which sites support which clerkship types.`,
				action: 'Update clerkship-site associations in configuration',
				impact,
				constraintType: constraintName,
				violationCount: count,
				actionLink: {
					href: '/clerkships',
					label: 'Configure Clerkships'
				}
			};

		default:
			// Generic suggestion for unknown constraints
			return {
				id: `suggestion-${constraintName}`,
				title: `Address ${formatConstraintName(constraintName)}`,
				description: `This constraint blocked ${count} assignments.`,
				action: 'Review constraint configuration',
				impact,
				constraintType: constraintName,
				violationCount: count
			};
	}
}

/**
 * Format constraint name for display
 */
function formatConstraintName(name: string): string {
	return name
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
```

### 2. Create Suggestions Panel Component

**New File**: `src/lib/features/schedules/components/suggestions-panel.svelte`

```svelte
<script lang="ts">
	import type { Suggestion } from '$lib/features/scheduling/services/suggestion-generator';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	interface Props {
		suggestions: Suggestion[];
	}

	let { suggestions }: Props = $props();

	let highImpact = $derived(suggestions.filter((s) => s.impact === 'high'));
	let mediumImpact = $derived(suggestions.filter((s) => s.impact === 'medium'));
	let lowImpact = $derived(suggestions.filter((s) => s.impact === 'low'));

	function handleActionClick(suggestion: Suggestion) {
		if (suggestion.actionLink) {
			goto(suggestion.actionLink.href);
		}
	}

	function getImpactIcon(impact: string): string {
		switch (impact) {
			case 'high':
				return '🔴';
			case 'medium':
				return '🟡';
			case 'low':
				return '🔵';
			default:
				return '⚪';
		}
	}

	function getImpactClass(impact: string): string {
		switch (impact) {
			case 'high':
				return 'bg-red-50 border-red-200';
			case 'medium':
				return 'bg-orange-50 border-orange-200';
			case 'low':
				return 'bg-blue-50 border-blue-200';
			default:
				return 'bg-gray-50 border-gray-200';
		}
	}
</script>

<Card class="overflow-hidden">
	<div class="border-b bg-muted/50 px-4 py-3">
		<h3 class="font-semibold">Suggested Fixes</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			Actions that could improve schedule completeness
		</p>
	</div>

	{#if suggestions.length === 0}
		<div class="p-8 text-center">
			<div class="text-lg font-medium text-green-600">No Suggestions Available</div>
			<p class="mt-1 text-sm text-muted-foreground">
				Either the schedule is complete or no clear fixes were identified.
			</p>
		</div>
	{:else}
		<div class="space-y-4 p-4">
			<!-- High Impact Suggestions -->
			{#if highImpact.length > 0}
				<div class="space-y-3">
					<h4 class="flex items-center gap-2 text-sm font-semibold text-red-700">
						🔴 High Impact Fixes
					</h4>
					{#each highImpact as suggestion, index}
						<div class={`rounded-lg border p-3 ${getImpactClass(suggestion.impact)}`}>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1">
									<h5 class="font-medium">
										{index + 1}. {suggestion.title}
									</h5>
									<p class="mt-1 text-sm text-muted-foreground">
										{suggestion.description}
									</p>
									<p class="mt-2 text-sm font-medium">
										→ {suggestion.action}
									</p>
								</div>
								{#if suggestion.actionLink}
									<Button size="sm" variant="outline" onclick={() => handleActionClick(suggestion)}>
										{suggestion.actionLink.label} →
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Medium Impact Suggestions -->
			{#if mediumImpact.length > 0}
				<div class="space-y-3">
					<h4 class="flex items-center gap-2 text-sm font-semibold text-orange-700">
						🟡 Medium Impact Fixes
					</h4>
					{#each mediumImpact as suggestion, index}
						<div class={`rounded-lg border p-3 ${getImpactClass(suggestion.impact)}`}>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1">
									<h5 class="font-medium">
										{highImpact.length + index + 1}. {suggestion.title}
									</h5>
									<p class="mt-1 text-sm text-muted-foreground">
										{suggestion.description}
									</p>
									<p class="mt-2 text-sm font-medium">
										→ {suggestion.action}
									</p>
								</div>
								{#if suggestion.actionLink}
									<Button size="sm" variant="outline" onclick={() => handleActionClick(suggestion)}>
										{suggestion.actionLink.label} →
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Low Impact (collapsed by default) -->
			{#if lowImpact.length > 0}
				<details class="space-y-3">
					<summary
						class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-blue-700"
					>
						🔵 Low Priority ({lowImpact.length} more)
					</summary>
					<div class="mt-3 space-y-3">
						{#each lowImpact as suggestion}
							<div class={`rounded-lg border p-3 ${getImpactClass(suggestion.impact)}`}>
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1">
										<h5 class="font-medium">{suggestion.title}</h5>
										<p class="mt-1 text-sm text-muted-foreground">
											{suggestion.description}
										</p>
									</div>
									{#if suggestion.actionLink}
										<Button
											size="sm"
											variant="outline"
											onclick={() => handleActionClick(suggestion)}
										>
											{suggestion.actionLink.label} →
										</Button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</details>
			{/if}
		</div>
	{/if}
</Card>
```

### 3. Integrate into Results Page

**File**: `src/routes/schedule/results/+page.svelte`

Import and use:

```svelte
<script lang="ts">
	import { generateSuggestions } from '$lib/features/scheduling/services/suggestion-generator';
	import SuggestionsPanel from '$lib/features/schedules/components/suggestions-panel.svelte';

	// ... existing code

	let suggestions = $derived(
		data.summary.violationStats ? generateSuggestions(data.summary.violationStats) : []
	);
</script>

<div class="space-y-6">
	<!-- Stats Overview -->
	<ScheduleStatsCard stats={data.summary.stats} isComplete={data.summary.isComplete} />

	<!-- Violations and Suggestions Side by Side -->
	{#if !data.summary.isComplete}
		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Violation Stats -->
			{#if data.summary.violationStats && data.summary.violationStats.length > 0}
				<ViolationStatsCard violations={data.summary.violationStats} />
			{/if}

			<!-- Suggestions -->
			{#if suggestions.length > 0}
				<SuggestionsPanel {suggestions} />
			{/if}
		</div>
	{/if}

	<!-- Unmet Requirements and Clerkship Breakdown -->
	<div class="grid gap-6 lg:grid-cols-2">
		<UnmetRequirementsTable
			students={data.summary.studentsWithUnmetRequirements}
			onStudentClick={handleStudentClick}
		/>
		<ClerkshipBreakdownTable breakdown={data.summary.clerkshipBreakdown} />
	</div>
</div>
```

### 4. Add Tests

**New File**: `src/lib/features/scheduling/services/suggestion-generator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateSuggestions } from './suggestion-generator';
import type { ViolationStat } from '../types';

describe('generateSuggestions', () => {
	it('should generate high impact suggestion for high violation count', () => {
		const violations: ViolationStat[] = [
			{ constraintName: 'preceptor-capacity', count: 45, percentage: 32.1 }
		];

		const suggestions = generateSuggestions(violations);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].impact).toBe('high');
		expect(suggestions[0].title).toContain('Preceptor Capacity');
		expect(suggestions[0].actionLink).toBeDefined();
	});

	it('should sort by impact then count', () => {
		const violations: ViolationStat[] = [
			{ constraintName: 'site-availability', count: 10, percentage: 15.0 },
			{ constraintName: 'preceptor-capacity', count: 45, percentage: 32.1 },
			{ constraintName: 'specialty-match', count: 25, percentage: 18.0 }
		];

		const suggestions = generateSuggestions(violations);

		expect(suggestions[0].constraintType).toBe('preceptor-capacity'); // High impact
		expect(suggestions[1].constraintType).toBe('specialty-match'); // High impact
		expect(suggestions[2].constraintType).toBe('site-availability'); // Medium impact
	});

	it('should handle unknown constraint types', () => {
		const violations: ViolationStat[] = [
			{ constraintName: 'unknown-constraint', count: 5, percentage: 5.0 }
		];

		const suggestions = generateSuggestions(violations);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].title).toContain('Unknown Constraint');
	});
});
```

## Files to Create/Modify

1. **Service (new)**: `src/lib/features/scheduling/services/suggestion-generator.ts`
2. **Component (new)**: `src/lib/features/schedules/components/suggestions-panel.svelte`
3. **Component exports**: `src/lib/features/schedules/components/index.ts`
4. **Results page**: `src/routes/schedule/results/+page.svelte`
5. **Tests (new)**: `src/lib/features/scheduling/services/suggestion-generator.test.ts`

## Success Criteria

- ✅ Suggestions generated automatically from violations
- ✅ High impact suggestions shown first
- ✅ Each suggestion has clear action
- ✅ Action links navigate to correct pages
- ✅ UI is clean and scannable
- ✅ Handles edge cases (no violations, unknown constraints)

## Timeline

- **Suggestion generator service**: 1.5 hours
- **Suggestions panel component**: 1 hour
- **Integration**: 30 min
- **Testing**: 1 hour

**Total**: ~4 hours
