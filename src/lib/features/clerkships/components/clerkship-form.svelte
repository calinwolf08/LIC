<script lang="ts">
	import type { Clerkships } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { createClerkshipSchema } from '../schemas.js';
	import { ZodError } from 'zod';

	interface Site {
		id: string;
		name: string;
	}

	interface Props {
		clerkship?: Clerkships;
		sites: Site[];
		initialSiteIds?: string[];
		onSuccess?: () => void;
		onCancel?: () => void;
	}

	let { clerkship, sites, initialSiteIds = [], onSuccess, onCancel }: Props = $props();

	let formData = $state({
		name: clerkship?.name || '',
		clerkship_type: (clerkship?.clerkship_type as 'inpatient' | 'outpatient') || 'inpatient',
		required_days: clerkship?.required_days || 1,
		description: clerkship?.description || ''
	});

	let selectedSiteIds = $state<string[]>(initialSiteIds);

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let generalError = $state<string | null>(null);

	function toggleSite(siteId: string) {
		if (selectedSiteIds.includes(siteId)) {
			selectedSiteIds = selectedSiteIds.filter((id) => id !== siteId);
		} else {
			selectedSiteIds = [...selectedSiteIds, siteId];
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errors = {};
		generalError = null;
		isSubmitting = true;

		try {
			// Validate form data with site_ids
			const validatedData = createClerkshipSchema.parse({
				...formData,
				site_ids: selectedSiteIds
			});

			// Determine endpoint and method
			const url = clerkship ? `/api/clerkships/${clerkship.id}` : '/api/clerkships';
			const method = clerkship ? 'PATCH' : 'POST';

			// Submit to API
			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(validatedData)
			});

			const result = await response.json();

			if (!response.ok) {
				if (result.error?.details) {
					// Handle field-specific errors
					const fieldErrors: Record<string, string> = {};
					for (const detail of result.error.details) {
						fieldErrors[detail.field] = detail.message;
					}
					errors = fieldErrors;
				} else {
					generalError = result.error?.message || 'An error occurred';
				}
				return;
			}

			// Success
			onSuccess?.();
		} catch (error) {
			if (error instanceof ZodError) {
				const fieldErrors: Record<string, string> = {};
				for (const issue of error.issues) {
					const field = issue.path[0]?.toString();
					if (field) {
						fieldErrors[field] = issue.message;
					}
				}
				errors = fieldErrors;
			} else {
				generalError = 'An unexpected error occurred';
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Card class="p-6">
	<form onsubmit={handleSubmit}>
		<div class="space-y-4">
			{#if generalError}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{generalError}
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input
					id="name"
					type="text"
					bind:value={formData.name}
					placeholder="Internal Medicine"
					disabled={isSubmitting}
					class={errors.name ? 'border-destructive' : ''}
				/>
				{#if errors.name}
					<p class="text-sm text-destructive">{errors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label>Clerkship Type</Label>
				<div class="flex gap-6">
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="clerkship_type"
							value="inpatient"
							bind:group={formData.clerkship_type}
							disabled={isSubmitting}
							class="h-4 w-4"
						/>
						<span>Inpatient</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="clerkship_type"
							value="outpatient"
							bind:group={formData.clerkship_type}
							disabled={isSubmitting}
							class="h-4 w-4"
						/>
						<span>Outpatient</span>
					</label>
				</div>
				{#if errors.clerkship_type}
					<p class="text-sm text-destructive">{errors.clerkship_type}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="required_days">Required Days</Label>
				<Input
					id="required_days"
					type="number"
					bind:value={formData.required_days}
					min="1"
					disabled={isSubmitting}
					class={errors.required_days ? 'border-destructive' : ''}
				/>
				{#if errors.required_days}
					<p class="text-sm text-destructive">{errors.required_days}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="description">Description (optional)</Label>
				<Input
					id="description"
					type="text"
					bind:value={formData.description}
					placeholder="Four-week rotation in internal medicine"
					disabled={isSubmitting}
					class={errors.description ? 'border-destructive' : ''}
				/>
				{#if errors.description}
					<p class="text-sm text-destructive">{errors.description}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label>Sites <span class="text-destructive">*</span></Label>
				<p class="text-sm text-muted-foreground">Select at least one site where this clerkship takes place</p>
				{#if sites.length === 0}
					<p class="text-sm text-muted-foreground italic">No sites available. Please create a site first.</p>
				{:else}
					<div class="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
						{#each sites as site}
							<label class="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
								<Checkbox
									checked={selectedSiteIds.includes(site.id)}
									onCheckedChange={() => toggleSite(site.id)}
									disabled={isSubmitting}
								/>
								<span class="text-sm">{site.name}</span>
							</label>
						{/each}
					</div>
				{/if}
				{#if errors.site_ids}
					<p class="text-sm text-destructive">{errors.site_ids}</p>
				{/if}
			</div>

			<div class="flex gap-3 pt-4">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : clerkship ? 'Update' : 'Create'}
				</Button>
				{#if onCancel}
					<Button type="button" variant="outline" onclick={onCancel} disabled={isSubmitting}>
						Cancel
					</Button>
				{/if}
			</div>
		</div>
	</form>
</Card>
