<script lang="ts">
	import LoginForm from "$lib/features/auth/login/components/login-form.svelte";
	import * as Card from "$lib/components/ui/card";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Welcome back</Card.Title>
			<Card.Description>Sign in to your account to continue</Card.Description>
		</Card.Header>
		<Card.Content>
			<LoginForm {data} />
		</Card.Content>
	</Card.Root>
</div>
