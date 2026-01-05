<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		electives: ClerkshipElective[];
		onEdit?: (elective: ClerkshipElective) => void;
		onDelete?: (elective: ClerkshipElective) => void;
		onManageSites?: (elective: ClerkshipElective) => void;
		onManagePreceptors?: (elective: ClerkshipElective) => void;
	}

	let { electives, onEdit, onDelete, onManageSites, onManagePreceptors }: Props = $props();
</script>

{#if electives.length === 0}
	<div class="rounded-md border border-dashed p-8 text-center">
		<p class="text-muted-foreground">
			No electives configured. Create your first elective to get started.
		</p>
	</div>
{:else}
	<div class="rounded-md border overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-muted/50">
					<tr class="border-b">
						<th class="px-4 py-3 text-left text-sm font-medium">Name</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Specialty</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Minimum Days</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Type</th>
						<th class="px-4 py-3 text-right text-sm font-medium">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each electives as elective (elective.id)}
						<tr class="border-b last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 font-medium">{elective.name}</td>
							<td class="px-4 py-3">
								{#if elective.specialty}
									<Badge variant="outline">{elective.specialty}</Badge>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3">{elective.minimumDays} days</td>
							<td class="px-4 py-3">
								{#if elective.isRequired}
									<Badge variant="default">Required</Badge>
								{:else}
									<Badge variant="secondary">Optional</Badge>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex justify-end gap-2">
									{#if onManageSites}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => onManageSites?.(elective)}
										>
											Sites
										</Button>
									{/if}
									{#if onManagePreceptors}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => onManagePreceptors?.(elective)}
										>
											Preceptors
										</Button>
									{/if}
									{#if onEdit}
										<Button variant="ghost" size="sm" onclick={() => onEdit?.(elective)}>
											Edit
										</Button>
									{/if}
									{#if onDelete}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => onDelete?.(elective)}
											class="text-destructive hover:text-destructive"
										>
											Delete
										</Button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}
