<script lang="ts">
	import { authClient } from "$lib/auth-client";
	import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { LogOut } from "lucide-svelte";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	async function handleSignOut() {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/login";
				},
			},
		});
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Welcome!</Card.Title>
			<Card.Description>You are successfully signed in</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.user}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="space-y-2">
						{#if data.user.name}
							<div>
								<p class="text-sm font-medium text-muted-foreground">Name</p>
								<p class="text-base">{data.user.name}</p>
							</div>
						{/if}
						<div>
							<p class="text-sm font-medium text-muted-foreground">Email</p>
							<p class="text-base">{data.user.email}</p>
						</div>
					</div>
				</div>

				<Button onclick={handleSignOut} variant="outline" class="w-full">
					<LogOut class="size-4" />
					Sign out
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
