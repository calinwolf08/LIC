<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { invalidateAll } from '$app/navigation';

	interface TeamMember {
		preceptorId: string;
		role?: string;
		priority: number;
	}

	interface Props {
		open: boolean;
		clerkshipId: string;
		team?: any; // Existing team for editing
		preceptors: Array<{ id: string; name: string; specialty: string }>;
		onClose: () => void;
	}

	let { open, clerkshipId, team, preceptors, onClose }: Props = $props();

	let formData = $state({
		name: team?.name || '',
		requireSameHealthSystem: team?.requireSameHealthSystem || false,
		requireSameSite: team?.requireSameSite || false,
		requireSameSpecialty: team?.requireSameSpecialty || false,
		requiresAdminApproval: team?.requiresAdminApproval || false
	});

	let members = $state<TeamMember[]>(
		team?.members?.map((m: any) => ({
			preceptorId: m.preceptor_id || m.preceptorId,
			role: m.role || '',
			priority: m.priority || 1
		})) || []
	);

	let selectedPreceptorId = $state('');
	let newMemberRole = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Reset form when team or open changes
	$effect(() => {
		if (open) {
			formData = {
				name: team?.name || '',
				requireSameHealthSystem: team?.requireSameHealthSystem || false,
				requireSameSite: team?.requireSameSite || false,
				requireSameSpecialty: team?.requireSameSpecialty || false,
				requiresAdminApproval: team?.requiresAdminApproval || false
			};
			members =
				team?.members?.map((m: any) => ({
					preceptorId: m.preceptor_id || m.preceptorId,
					role: m.role || '',
					priority: m.priority || 1
				})) || [];
			selectedPreceptorId = '';
			newMemberRole = '';
			error = null;
		}
	});

	function addMember() {
		if (!selectedPreceptorId) return;

		// Check if already added
		if (members.find((m) => m.preceptorId === selectedPreceptorId)) {
			error = 'This preceptor is already in the team';
			return;
		}

		// Find next priority
		const maxPriority = members.reduce((max, m) => Math.max(max, m.priority), 0);

		members = [
			...members,
			{
				preceptorId: selectedPreceptorId,
				role: newMemberRole || undefined,
				priority: maxPriority + 1
			}
		];

		selectedPreceptorId = '';
		newMemberRole = '';
		error = null;
	}

	function removeMember(preceptorId: string) {
		members = members.filter((m) => m.preceptorId !== preceptorId);
	}

	function moveMemberUp(index: number) {
		if (index === 0) return;

		const temp = members[index - 1].priority;
		members[index - 1].priority = members[index].priority;
		members[index].priority = temp;

		// Re-sort by priority
		members = [...members].sort((a, b) => a.priority - b.priority);
	}

	function moveMemberDown(index: number) {
		if (index === members.length - 1) return;

		const temp = members[index + 1].priority;
		members[index + 1].priority = members[index].priority;
		members[index].priority = temp;

		// Re-sort by priority
		members = [...members].sort((a, b) => a.priority - b.priority);
	}

	function getPreceptorName(id: string): string {
		return preceptors.find((p) => p.id === id)?.name || 'Unknown';
	}

	function getPreceptorSpecialty(id: string): string {
		return preceptors.find((p) => p.id === id)?.specialty || '';
	}

	async function handleSubmit(e: Event) {
		console.log('[TeamForm] handleSubmit started', { team: team?.id, isSubmitting });
		e.preventDefault();
		error = null;

		// Validation
		if (members.length < 2) {
			console.log('[TeamForm] Validation failed: not enough members', members.length);
			error = 'Team must have at least 2 members';
			return;
		}

		console.log('[TeamForm] Setting isSubmitting = true');
		isSubmitting = true;

		try {
			const url = team
				? `/api/scheduling-config/teams/${team.id}`
				: `/api/scheduling-config/teams?clerkshipId=${clerkshipId}`;
			const method = team ? 'PATCH' : 'POST';

			const payload = {
				...formData,
				members: members.map((m) => ({
					preceptorId: m.preceptorId,
					role: m.role || undefined,
					priority: m.priority
				}))
			};

			console.log('[TeamForm] About to fetch', { method, url, payload });

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			console.log('[TeamForm] Fetch response received', {
				status: response.status,
				ok: response.ok
			});

			const result = await response.json();
			console.log('[TeamForm] Response parsed', { result });

			if (!response.ok) {
				console.log('[TeamForm] Response not OK, showing error');
				error = result.error?.message || 'Failed to save team';
				isSubmitting = false;
				return;
			}

			console.log('[TeamForm] Success! Resetting isSubmitting');
			// Reset submitting state before closing modal
			isSubmitting = false;

			console.log('[TeamForm] Calling onClose()');
			// Close modal immediately for better UX
			onClose();

			console.log('[TeamForm] Triggering invalidateAll()');
			// Refresh data in background (don't await to avoid blocking)
			invalidateAll().catch(console.error);
		} catch (err) {
			console.error('[TeamForm] Caught error in handleSubmit', err);
			error = err instanceof Error ? err.message : 'Failed to save team';
			isSubmitting = false;
		}
		console.log('[TeamForm] handleSubmit completed');
	}

	function handleCancel() {
		onClose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background p-6 shadow-lg">
			<h2 class="mb-4 text-2xl font-bold">{team ? 'Edit Team' : 'Create Team'}</h2>

			{#if error}
				<div class="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-6">
				<!-- Team Name -->
				<div>
					<Label for="name">Team Name (Optional)</Label>
					<Input
						id="name"
						type="text"
						bind:value={formData.name}
						placeholder="e.g., Cardiology Team A"
						disabled={isSubmitting}
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						If left blank, team will be auto-named based on members
					</p>
				</div>

				<!-- Formation Rules -->
				<div class="space-y-3 rounded-lg border p-4">
					<h3 class="font-semibold">Team Formation Rules</h3>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requireSameHealthSystem"
							bind:checked={formData.requireSameHealthSystem}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requireSameHealthSystem" class="cursor-pointer">
							Require Same Health System
							<span class="block text-xs font-normal text-muted-foreground">
								All team members must be from the same health system
							</span>
						</Label>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requireSameSite"
							bind:checked={formData.requireSameSite}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requireSameSite" class="cursor-pointer">
							Require Same Site
							<span class="block text-xs font-normal text-muted-foreground">
								All team members must work at the same site
							</span>
						</Label>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requireSameSpecialty"
							bind:checked={formData.requireSameSpecialty}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requireSameSpecialty" class="cursor-pointer">
							Require Same Specialty
							<span class="block text-xs font-normal text-muted-foreground">
								All team members must have the same specialty
							</span>
						</Label>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requiresAdminApproval"
							bind:checked={formData.requiresAdminApproval}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requiresAdminApproval" class="cursor-pointer">
							Requires Admin Approval
							<span class="block text-xs font-normal text-muted-foreground">
								Team assignments must be approved by admin
							</span>
						</Label>
					</div>
				</div>

				<!-- Team Members -->
				<div class="space-y-3 rounded-lg border p-4">
					<h3 class="font-semibold">Team Members (minimum 2 required)</h3>

					<!-- Add Member -->
					<div class="flex gap-2">
						<div class="flex-1">
							<select
								bind:value={selectedPreceptorId}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								disabled={isSubmitting}
							>
								<option value="">Select preceptor...</option>
								{#each preceptors.filter((p) => !members.find((m) => m.preceptorId === p.id)) as preceptor}
									<option value={preceptor.id}>{preceptor.name} - {preceptor.specialty}</option>
								{/each}
							</select>
						</div>
						<div class="w-48">
							<Input
								type="text"
								bind:value={newMemberRole}
								placeholder="Role (optional)"
								disabled={isSubmitting}
							/>
						</div>
						<Button type="button" variant="outline" onclick={addMember} disabled={isSubmitting}>
							Add
						</Button>
					</div>

					<!-- Member List -->
					{#if members.length > 0}
						<div class="mt-4 space-y-2">
							{#each members as member, index}
								<div class="flex items-center justify-between rounded border p-3">
									<div class="flex-1">
										<p class="font-medium">
											{index + 1}. {getPreceptorName(member.preceptorId)}
										</p>
										<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
											<span>{getPreceptorSpecialty(member.preceptorId)}</span>
											{#if member.role}
												<span>• Role: {member.role}</span>
											{/if}
											<span>• Priority: {member.priority}</span>
										</div>
									</div>
									<div class="flex gap-1">
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onclick={() => moveMemberUp(index)}
											disabled={index === 0 || isSubmitting}
										>
											↑
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onclick={() => moveMemberDown(index)}
											disabled={index === members.length - 1 || isSubmitting}
										>
											↓
										</Button>
										<Button
											type="button"
											size="sm"
											variant="destructive"
											onclick={() => removeMember(member.preceptorId)}
											disabled={isSubmitting}
										>
											Remove
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No members added yet. Add at least 2 members.</p>
					{/if}
				</div>

				<!-- Action Buttons -->
				<div class="flex justify-end gap-2 pt-4">
					<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting || members.length < 2}>
						{isSubmitting ? 'Saving...' : team ? 'Update Team' : 'Create Team'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
