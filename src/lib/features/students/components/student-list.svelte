<script lang="ts">
	import type { Students } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		students: Students[];
		loading?: boolean;
		onEdit?: (student: Students) => void;
		onDelete?: (student: Students) => void;
	}

	let { students, loading = false, onEdit, onDelete }: Props = $props();

	let sortColumn = $state<'name' | 'email' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedStudents = $derived(() => {
		if (!sortColumn) return students;

		return [...students].sort((a, b) => {
			const aVal = a[sortColumn];
			const bVal = b[sortColumn];

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
					<th class="px-4 py-3 text-left text-sm font-medium">Created</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedStudents().length === 0}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
							No students found
						</td>
					</tr>
				{:else}
					{#each sortedStudents() as student}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">{student.name}</td>
							<td class="px-4 py-3 text-sm">{student.email}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{formatDate(student.created_at)}
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
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
