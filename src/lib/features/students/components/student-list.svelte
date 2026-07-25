<script lang="ts">
	import type { Students } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import type { StudentStatus } from '$lib/features/scheduling/services/requirement-status';
	import { completionPercent } from '$lib/features/scheduling/services/requirement-status';

	interface Props {
		students: Students[];
		statuses?: Record<string, StudentStatus>;
		loading?: boolean;
		onDelete?: (student: Students) => void;
	}

	let { students, statuses = {}, loading = false, onDelete }: Props = $props();

	function completionColor(pct: number): string {
		if (pct >= 100) return 'bg-green-500';
		if (pct >= 50) return 'bg-amber-500';
		return 'bg-red-500';
	}

	function stateBadge(state?: StudentStatus['scheduling_state']) {
		switch (state) {
			case 'full':
				return { label: 'Fully scheduled', variant: 'default' as const };
			case 'partial':
				return { label: 'Partially scheduled', variant: 'secondary' as const };
			default:
				return { label: 'Unscheduled', variant: 'outline' as const };
		}
	}

	function handleView(student: Students) {
		goto(`/students/${student.id}`);
	}

	let sortColumn = $state<'name' | 'email' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedStudents = $derived.by(() => {
		if (!sortColumn) return students;
		const column = sortColumn;
		return [...students].sort((a, b) => {
			const aVal = a[column];
			const bVal = b[column];
			if (aVal === bVal) return 0;
			const comparison = aVal! < bVal! ? -1 : 1;
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: 'name' | 'email') {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					<th
						class="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted"
						onclick={() => handleSort('name')}
					>
						Name {#if sortColumn === 'name'}<span class="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>{/if}
					</th>
					<th
						class="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted"
						onclick={() => handleSort('email')}
					>
						Email {#if sortColumn === 'email'}<span class="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>{/if}
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Requirements</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Status</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr><td colspan="5" class="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
				{:else if sortedStudents.length === 0}
					<tr><td colspan="5" class="px-4 py-8 text-center text-muted-foreground">No students found</td></tr>
				{:else}
					{#each sortedStudents as student (student.id)}
						{@const status = student.id ? statuses[student.id] : undefined}
						{@const pct = status ? completionPercent(status.overall) : 0}
						{@const badge = stateBadge(status?.scheduling_state)}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">
								<button onclick={() => handleView(student)} class="text-left font-medium text-primary hover:underline">
									{student.name}
								</button>
							</td>
							<td class="px-4 py-3 text-sm">{student.email}</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex items-center gap-2">
									<div class="h-2 w-16 rounded-full bg-gray-200">
										<div class="h-2 rounded-full {completionColor(pct)}" style="width: {Math.min(pct, 100)}%"></div>
									</div>
									<span class="text-muted-foreground">{pct}%</span>
									{#if status && status.overall.unscheduled > 0}
										<span class="text-xs text-amber-700">· {status.overall.unscheduled}d left</span>
									{/if}
								</div>
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex items-center gap-2">
									<Badge variant={badge.variant}>{badge.label}</Badge>
									{#if status && status.conflict_count > 0}
										<Badge variant="destructive">{status.conflict_count} conflict{status.conflict_count > 1 ? 's' : ''}</Badge>
									{/if}
								</div>
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
									<Button size="sm" variant="ghost" onclick={() => handleView(student)}>Manage</Button>
									{#if onDelete}
										<Button size="sm" variant="destructive" onclick={() => onDelete?.(student)}>Delete</Button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</Card>
