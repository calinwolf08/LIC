<script lang="ts">
	import { superForm } from "sveltekit-superforms";
	import { zodClient } from "sveltekit-superforms/adapters";
	import { registerSchema } from "$lib/schemas/auth";
	import * as Card from "$lib/components/ui/card";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import * as Alert from "$lib/components/ui/alert";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const form = superForm(data.form, {
		validators: zodClient(registerSchema),
	});

	const { form: formData, enhance, errors, message, submitting } = form;
</script>

<div class="flex min-h-screen items-center justify-center p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">Create an account</Card.Title>
			<Card.Description>Enter your information to get started</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if message}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{message}</Alert.Description>
				</Alert.Root>
			{/if}

			<form method="POST" use:enhance>
				<Form.Field {form} name="name">
					{#snippet children({ constraints })}
						<Form.Label>Name</Form.Label>
						<Form.Control let:attrs>
							<Input
								{...attrs}
								type="text"
								placeholder="John Doe"
								bind:value={$formData.name}
								{...constraints}
							/>
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="email">
					{#snippet children({ constraints })}
						<Form.Label>Email</Form.Label>
						<Form.Control let:attrs>
							<Input
								{...attrs}
								type="email"
								placeholder="you@example.com"
								bind:value={$formData.email}
								{...constraints}
							/>
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="password">
					{#snippet children({ constraints })}
						<Form.Label>Password</Form.Label>
						<Form.Control let:attrs>
							<Input
								{...attrs}
								type="password"
								placeholder="••••••••"
								bind:value={$formData.password}
								{...constraints}
							/>
						</Form.Control>
						<Form.Description>Must be at least 8 characters</Form.Description>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="confirmPassword">
					{#snippet children({ constraints })}
						<Form.Label>Confirm Password</Form.Label>
						<Form.Control let:attrs>
							<Input
								{...attrs}
								type="password"
								placeholder="••••••••"
								bind:value={$formData.confirmPassword}
								{...constraints}
							/>
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Button type="submit" class="mt-4 w-full" disabled={$submitting}>
					{$submitting ? "Creating account..." : "Create account"}
				</Button>
			</form>

			<div class="mt-4 text-center text-sm">
				Already have an account?
				<a href="/login" class="text-primary underline-offset-4 hover:underline"> Login </a>
			</div>
		</Card.Content>
	</Card.Root>
</div>
