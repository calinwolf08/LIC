<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { FormField } from '$lib/components/forms';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Loader2 } from '@lucide/svelte';

	let { data, form } = $props();

	let submitting = $state(false);
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	const values = $derived(form?.values ?? data.schedule);
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head>
	<title>Set up your schedule | LIC Scheduler</title>
</svelte:head>

<div class="container mx-auto flex justify-center py-8">
	<Card.Root class="w-full max-w-lg">
		<Card.Header>
			<Card.Title class="text-2xl">
				{data.onboarding ? 'Set up your schedule' : 'Schedule name and dates'}
			</Card.Title>
			<Card.Description>
				This is the schedule you'll build in. Give it a name your team will recognize — for example
				“2026–27 LIC” — and set the dates it covers. You can change these later from Schedules.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				data-hydrated={hydrated}
				data-testid="schedule-setup-form"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<FormField label="Schedule name" name="name" error={errors.name ?? []} required>
					<Input
						id="name"
						name="name"
						value={values.name}
						disabled={submitting}
						aria-invalid={(errors.name?.length ?? 0) > 0}
					/>
				</FormField>
				<div class="grid grid-cols-2 gap-4">
					<FormField label="Start date" name="start_date" error={errors.start_date ?? []} required>
						<Input
							id="start_date"
							name="start_date"
							type="date"
							value={values.start_date}
							disabled={submitting}
							aria-invalid={(errors.start_date?.length ?? 0) > 0}
						/>
					</FormField>
					<FormField label="End date" name="end_date" error={errors.end_date ?? []} required>
						<Input
							id="end_date"
							name="end_date"
							type="date"
							value={values.end_date}
							disabled={submitting}
							aria-invalid={(errors.end_date?.length ?? 0) > 0}
						/>
					</FormField>
				</div>

				<div class="flex items-center justify-between gap-2 pt-2">
					<a href="/dashboard" class="text-sm text-muted-foreground hover:underline">
						{data.onboarding ? 'Skip for now' : 'Cancel'}
					</a>
					<Button type="submit" disabled={submitting} data-testid="schedule-setup-submit">
						{#if submitting}
							<Loader2 class="size-4 animate-spin" />
							Saving...
						{:else}
							{data.onboarding ? 'Save and continue' : 'Save'}
						{/if}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
