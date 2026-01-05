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

	function getImpactClass(impact: string): string {
		switch (impact) {
			case 'high':
				return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
			case 'medium':
				return 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800';
			case 'low':
				return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
			default:
				return 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800';
		}
	}
</script>

<Card class="overflow-hidden">
	<div class="bg-muted/50 px-4 py-3 border-b">
		<h3 class="font-semibold">Suggested Fixes</h3>
		<p class="text-sm text-muted-foreground mt-1">
			Actions that could improve schedule completeness
		</p>
	</div>

	{#if suggestions.length === 0}
		<div class="p-8 text-center">
			<div class="text-green-600 text-lg font-medium dark:text-green-400">
				No Suggestions Available
			</div>
			<p class="text-sm text-muted-foreground mt-1">
				Either the schedule is complete or no clear fixes were identified.
			</p>
		</div>
	{:else}
		<div class="p-4 space-y-4">
			<!-- High Impact Suggestions -->
			{#if highImpact.length > 0}
				<div class="space-y-3">
					<h4 class="text-sm font-semibold text-red-700 flex items-center gap-2 dark:text-red-400">
						🔴 High Impact Fixes
					</h4>
					{#each highImpact as suggestion, index}
						<div class={`p-3 rounded-lg border ${getImpactClass(suggestion.impact)}`}>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1">
									<h5 class="font-medium">
										{index + 1}. {suggestion.title}
									</h5>
									<p class="text-sm mt-1 text-muted-foreground">
										{suggestion.description}
									</p>
									<p class="text-sm mt-2 font-medium">
										→ {suggestion.action}
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
			{/if}

			<!-- Medium Impact Suggestions -->
			{#if mediumImpact.length > 0}
				<div class="space-y-3">
					<h4
						class="text-sm font-semibold text-orange-700 flex items-center gap-2 dark:text-orange-400"
					>
						🟡 Medium Impact Fixes
					</h4>
					{#each mediumImpact as suggestion, index}
						<div class={`p-3 rounded-lg border ${getImpactClass(suggestion.impact)}`}>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1">
									<h5 class="font-medium">
										{highImpact.length + index + 1}. {suggestion.title}
									</h5>
									<p class="text-sm mt-1 text-muted-foreground">
										{suggestion.description}
									</p>
									<p class="text-sm mt-2 font-medium">
										→ {suggestion.action}
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
			{/if}

			<!-- Low Impact (collapsed by default) -->
			{#if lowImpact.length > 0}
				<details class="space-y-3">
					<summary
						class="text-sm font-semibold text-blue-700 flex items-center gap-2 cursor-pointer dark:text-blue-400"
					>
						🔵 Low Priority ({lowImpact.length} more)
					</summary>
					<div class="space-y-3 mt-3">
						{#each lowImpact as suggestion}
							<div class={`p-3 rounded-lg border ${getImpactClass(suggestion.impact)}`}>
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1">
										<h5 class="font-medium">{suggestion.title}</h5>
										<p class="text-sm mt-1 text-muted-foreground">
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
