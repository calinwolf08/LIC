<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { goto, invalidateAll } from '$app/navigation';
	import { teamsClient, formatApiError } from '$lib/features/scheduling-config/clients/teams-client';
	import { createClientLogger } from '$lib/utils/logger.client';

	const log = createClientLogger('team-edit');

	interface Props {
		data: {
			team: any;
			sites: Array<{ id: string; name: string }>;
			preceptors: Array<{ id: string; name: string; sites?: Array<{ id: string; name: string }> }>;
			teamId: string;
		};
	}

	let { data }: Props = $props();

	let isEditing = $state(false);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// Editable form data
	let formData = $state({
		name: data.team?.name || '',
		requireSameHealthSystem: data.team?.requireSameHealthSystem || false,
		requireSameSite: data.team?.requireSameSite || false
	});

	let selectedSiteIds = $state<string[]>(data.team?.sites?.map((s: any) => s.id) || []);

	// Team members with preceptor details
	let members = $state<any[]>(data.team?.members || []);

	function toggleSite(siteId: string) {
		if (selectedSiteIds.includes(siteId)) {
			selectedSiteIds = selectedSiteIds.filter((id) => id !== siteId);
		} else {
			selectedSiteIds = [...selectedSiteIds, siteId];
		}
	}

	function getPreceptorName(preceptorId: string): string {
		return data.preceptors.find((p) => p.id === preceptorId)?.name || 'Unknown';
	}

	async function handleSave() {
		error = null;

		// Validate before saving
		if (members.length === 0) {
			log.warn('Attempted to save team with no members');
			error = 'Team must have at least 1 member';
			return;
		}

		isSaving = true;
		log.debug('Saving team', { teamId: data.teamId, memberCount: members.length });

		try {
			// Prepare payload - extract only needed fields from members
			const payload = {
				...formData,
				siteIds: [...selectedSiteIds],
				members: members.map((m: any) => ({
					preceptorId: m.preceptorId,
					role: m.role || undefined,
					priority: m.priority
				}))
			};

			log.trace('Update payload', { payload });

			const result = await teamsClient.update(data.teamId, payload);

			if (!result.success) {
				log.error('Failed to save team', { error: result.error });
				error = formatApiError(result.error);
				return;
			}

			log.info('Team saved successfully', { teamId: data.teamId });
			isEditing = false;
			await invalidateAll();
		} catch (err) {
			log.error('Unexpected save error', { error: err });
			error = err instanceof Error ? err.message : 'Failed to save team';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
			return;
		}

		log.debug('Deleting team', { teamId: data.teamId });

		try {
			const result = await teamsClient.delete(data.teamId);

			if (!result.success) {
				log.error('Failed to delete team', { error: result.error });
				error = formatApiError(result.error);
				return;
			}

			log.info('Team deleted successfully', { teamId: data.teamId });
			goto('/preceptors');
		} catch (err) {
			log.error('Unexpected delete error', { error: err });
			error = err instanceof Error ? err.message : 'Failed to delete team';
		}
	}

	function cancelEdit() {
		formData = {
			name: data.team?.name || '',
			requireSameHealthSystem: data.team?.requireSameHealthSystem || false,
			requireSameSite: data.team?.requireSameSite || false
		};
		selectedSiteIds = data.team?.sites?.map((s: any) => s.id) || [];
		members = [...(data.team?.members || [])];
		isEditing = false;
		error = null;
	}

	// Member management
	let selectedPreceptorId = $state('');
	let newMemberRole = $state('');

	function addMember() {
		if (!selectedPreceptorId) return;

		if (members.find((m: any) => m.preceptorId === selectedPreceptorId)) {
			error = 'This preceptor is already in the team';
			return;
		}

		const preceptor = data.preceptors.find((p) => p.id === selectedPreceptorId);
		const maxPriority = members.reduce((max: number, m: any) => Math.max(max, m.priority || 0), 0);

		members = [
			...members,
			{
				preceptorId: selectedPreceptorId,
				preceptorName: preceptor?.name || 'Unknown',
				role: newMemberRole || undefined,
				priority: maxPriority + 1
			}
		];

		selectedPreceptorId = '';
		newMemberRole = '';
		error = null;
	}

	function removeMember(preceptorId: string) {
		members = members.filter((m: any) => m.preceptorId !== preceptorId);
	}

	function moveMemberUp(index: number) {
		if (index === 0) return;
		const temp = members[index - 1].priority;
		members[index - 1].priority = members[index].priority;
		members[index].priority = temp;
		members = [...members].sort((a: any, b: any) => a.priority - b.priority);
	}

	function moveMemberDown(index: number) {
		if (index === members.length - 1) return;
		const temp = members[index + 1].priority;
		members[index + 1].priority = members[index].priority;
		members[index].priority = temp;
		members = [...members].sort((a: any, b: any) => a.priority - b.priority);
	}

	// Preceptors at selected sites, not already in team
	let filteredPreceptors = $derived(
		data.preceptors.filter((p) => {
			const preceptorSites = p.sites?.map((s) => s.id) || [];
			const atSelectedSite = selectedSiteIds.some((siteId) => preceptorSites.includes(siteId));
			const inTeam = members.some((m: any) => m.preceptorId === p.id);
			return atSelectedSite && !inTeam;
		})
	);
</script>

<svelte:head>
	<title>{data.team?.name || 'Team Configuration'} | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<!-- Breadcrumb -->
	<nav class="mb-6 text-sm text-muted-foreground">
		<a href="/preceptors" class="hover:underline">Preceptors</a>
		<span class="mx-2">/</span>
		<span>Team Configuration</span>
	</nav>

	{#if !data.team}
		<Card class="p-12 text-center">
			<p class="text-muted-foreground">Team not found.</p>
			<Button class="mt-4" onclick={() => goto('/preceptors')}>Back to Preceptors</Button>
		</Card>
	{:else}
		<!-- Header -->
		<div class="mb-6 flex items-start justify-between">
			<div>
				<h1 class="text-3xl font-bold">{data.team.name || 'Unnamed Team'}</h1>
				{#if data.team.clerkshipName}
					<p class="text-muted-foreground">
						Clerkship: <a href="/clerkships/{data.team.clerkshipId}/config" class="text-blue-600 hover:underline">
							{data.team.clerkshipName}
						</a>
					</p>
				{/if}
			</div>
			<div class="flex gap-2">
				{#if isEditing}
					<Button variant="outline" onclick={cancelEdit} disabled={isSaving}>Cancel</Button>
					<Button onclick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</Button>
				{:else}
					<Button variant="outline" onclick={() => (isEditing = true)}>Edit</Button>
					<Button variant="destructive" onclick={handleDelete}>Delete</Button>
				{/if}
			</div>
		</div>

		{#if error}
			<div class="mb-6 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		<div class="space-y-6">
			<!-- Team Settings -->
			<Card class="p-6">
				<h2 class="mb-4 text-xl font-semibold">Team Settings</h2>

				{#if isEditing}
					<div class="space-y-4">
						<div>
							<Label for="name">Team Name</Label>
							<Input
								id="name"
								type="text"
								bind:value={formData.name}
								placeholder="e.g., Cardiology Team A"
								disabled={isSaving}
							/>
						</div>

						<div class="space-y-2">
							<Label>Formation Rules</Label>
							<div class="space-y-2">
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										bind:checked={formData.requireSameHealthSystem}
										disabled={isSaving}
										class="h-4 w-4"
									/>
									<span class="text-sm">Require Same Health System</span>
								</label>
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										bind:checked={formData.requireSameSite}
										disabled={isSaving}
										class="h-4 w-4"
									/>
									<span class="text-sm">Require Same Site</span>
								</label>
							</div>
						</div>
					</div>
				{:else}
					<div class="space-y-3">
						<div>
							<span class="text-sm text-muted-foreground">Team Name:</span>
							<span class="ml-2 font-medium">{data.team.name || 'Not set'}</span>
						</div>
						<div>
							<span class="text-sm text-muted-foreground">Formation Rules:</span>
							<ul class="ml-4 mt-1 list-disc text-sm">
								{#if data.team.requireSameHealthSystem}
									<li>Same health system required</li>
								{/if}
								{#if data.team.requireSameSite}
									<li>Same site required</li>
								{/if}
								{#if !data.team.requireSameHealthSystem && !data.team.requireSameSite}
									<li class="text-muted-foreground">No special rules</li>
								{/if}
							</ul>
						</div>
					</div>
				{/if}
			</Card>

			<!-- Team Sites -->
			<Card class="p-6">
				<h2 class="mb-4 text-xl font-semibold">Sites</h2>

				{#if isEditing}
					<div class="max-h-48 overflow-y-auto space-y-1">
						{#each data.sites as site}
							<label class="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-1 cursor-pointer">
								<input
									type="checkbox"
									checked={selectedSiteIds.includes(site.id)}
									onchange={() => toggleSite(site.id)}
									disabled={isSaving}
									class="h-4 w-4"
								/>
								<span class="text-sm">{site.name}</span>
							</label>
						{/each}
					</div>
				{:else if data.team.sites && data.team.sites.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each data.team.sites as site}
							<a
								href="/sites/{site.id}/edit"
								class="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/80"
							>
								{site.name}
							</a>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No sites assigned to this team.</p>
				{/if}
			</Card>

			<!-- Team Members -->
			<Card class="p-6">
				<h2 class="mb-4 text-xl font-semibold">Team Members</h2>

				{#if isEditing}
					<!-- Add Member -->
					{#if selectedSiteIds.length > 0}
						<div class="flex gap-2 mb-4">
							<div class="flex-1">
								<select
									bind:value={selectedPreceptorId}
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									disabled={isSaving}
								>
									<option value="">Select preceptor to add...</option>
									{#each filteredPreceptors as preceptor}
										<option value={preceptor.id}>{preceptor.name}</option>
									{/each}
								</select>
							</div>
							<div class="w-48">
								<Input
									type="text"
									bind:value={newMemberRole}
									placeholder="Role (optional)"
									disabled={isSaving}
								/>
							</div>
							<Button type="button" variant="outline" onclick={addMember} disabled={isSaving || !selectedPreceptorId}>
								Add
							</Button>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground mb-4">Select sites first to see available preceptors.</p>
					{/if}

					<!-- Editable Member List -->
					{#if members.length > 0}
						<div class="space-y-2">
							{#each members as member, index}
								<div class="flex items-center justify-between rounded border p-3">
									<div class="flex-1">
										<p class="font-medium">
											{index + 1}. {member.preceptorName || getPreceptorName(member.preceptorId)}
										</p>
										<div class="text-xs text-muted-foreground">
											{#if member.role}
												<span>Role: {member.role}</span>
												<span class="mx-1">•</span>
											{/if}
											<span>Priority: {member.priority}</span>
										</div>
									</div>
									<div class="flex gap-1">
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onclick={() => moveMemberUp(index)}
											disabled={index === 0 || isSaving}
										>
											&uarr;
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onclick={() => moveMemberDown(index)}
											disabled={index === members.length - 1 || isSaving}
										>
											&darr;
										</Button>
										<Button
											type="button"
											size="sm"
											variant="destructive"
											onclick={() => removeMember(member.preceptorId)}
											disabled={isSaving}
										>
											Remove
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No members. Add at least one member.</p>
					{/if}
				{:else if members.length > 0}
					<div class="space-y-2">
						{#each members as member, index}
							<div class="flex items-center justify-between rounded border p-3">
								<div>
									<p class="font-medium">
										{index + 1}. {member.preceptorName || getPreceptorName(member.preceptorId)}
									</p>
									<div class="text-xs text-muted-foreground">
										{#if member.role}
											<span>Role: {member.role}</span>
											<span class="mx-1">•</span>
										{/if}
										<span>Priority: {member.priority}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No members in this team.</p>
				{/if}
			</Card>
		</div>
	{/if}
</div>
