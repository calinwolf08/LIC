<script lang="ts">
	import RegisterForm from "$lib/features/auth/register/components/register-form.svelte";
	import * as Card from "$lib/components/ui/card";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Create an account</Card.Title>
			<Card.Description>Enter your information to get started</Card.Description>
		</Card.Header>
		<Card.Content>
			<RegisterForm {data} />
		</Card.Content>
	</Card.Root>
</div>
