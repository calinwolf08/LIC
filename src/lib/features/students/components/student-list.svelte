<script lang="ts">
	import type { Students } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';

	interface StudentWithOnboarding extends Students {
		completed_onboarding?: number;
		total_health_systems?: number;
	}

	interface Props {
		students: StudentWithOnboarding[];
		loading?: boolean;
		onEdit?: (student: StudentWithOnboarding) => void;
		onDelete?: (student: StudentWithOnboarding) => void;
	}

	let { students, loading = false, onEdit, onDelete }: Props = $props();

	function handleView(student: StudentWithOnboarding) {
		goto(`/students/${student.id}`);
	}

	let sortColumn = $state<'name' | 'email' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedStudents = $derived(() => {
		if (!sortColumn) return students;

		const column = sortColumn; // Capture non-null value
		return [...students].sort((a, b) => {
			const aVal = a[column];
			const bVal = b[column];

			if (aVal === bVal) return 0;

			const comparison = aVal < bVal ? -1 : 1;
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

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString();
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('name')}
					>
						<div class="flex items-center gap-2">
							Name
							{#if sortColumn === 'name'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('email')}
					>
						<div class="flex items-center gap-2">
							Email
							{#if sortColumn === 'email'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Onboarding</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Created</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="5" class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedStudents().length === 0}
					<tr>
						<td colspan="5" class="px-4 py-8 text-center text-muted-foreground">
							No students found
						</td>
					</tr>
				{:else}
					{#each sortedStudents() as student}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">
								<button
									onclick={() => handleView(student)}
									class="font-medium text-primary hover:underline text-left"
								>
									{student.name}
								</button>
							</td>
							<td class="px-4 py-3 text-sm">{student.email}</td>
							<td class="px-4 py-3 text-sm">
								{#if student.total_health_systems !== undefined && student.total_health_systems > 0}
									<Badge
										variant={student.completed_onboarding === student.total_health_systems
											? 'default'
											: 'secondary'}
									>
										{student.completed_onboarding || 0}/{student.total_health_systems}
									</Badge>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{formatDate(student.created_at as unknown as string)}
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
									<Button size="sm" variant="ghost" onclick={() => handleView(student)}>
										View
									</Button>
									{#if onEdit}
										<Button size="sm" variant="outline" onclick={() => onEdit?.(student)}>
											Edit
										</Button>
									{/if}
									{#if onDelete}
										<Button
											size="sm"
											variant="destructive"
											onclick={() => onDelete?.(student)}
										>
											Delete
										</Button>
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
