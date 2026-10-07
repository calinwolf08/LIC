<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { FormField } from '$lib/components/forms';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { signOut } from '$lib/identity-client';
	import { Loader2 } from 'lucide-svelte';

	let { data, form } = $props();

	let submitting = $state(false);

	// Same explicit hydration signal as the auth forms, for e2e.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	async function handleSignOut() {
		const result = await signOut();
		if (result.ok) window.location.href = '/login';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Name your organization</Card.Title>
			<Card.Description>
				The program or school you schedule for. You'll be its owner, and can invite colleagues
				later.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				data-hydrated={hydrated}
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<FormField label="Organization name" name="name" error={form?.errors ?? []} required>
					<Input
						id="name"
						name="name"
						type="text"
						placeholder="e.g. University Medical School LIC"
						autocomplete="organization"
						value={form?.name ?? ''}
						disabled={submitting}
						aria-invalid={(form?.errors?.length ?? 0) > 0}
					/>
				</FormField>

				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						<Loader2 class="size-4 animate-spin" />
						Creating organization...
					{:else}
						Continue
					{/if}
				</Button>

				<p class="text-center text-sm text-muted-foreground">
					Signed in as {data.email}.
					<button type="button" class="text-primary hover:underline" onclick={handleSignOut}>
						Sign out
					</button>
				</p>
			</form>
		</Card.Content>
	</Card.Root>
</div>
