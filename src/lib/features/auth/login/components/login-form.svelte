<script lang="ts">
	import { superForm } from "sveltekit-superforms";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { loginSchema } from "../utils";
	import { authClient } from "$lib/auth-client";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Alert from "$lib/components/ui/alert";
	import PasswordInput from "$lib/features/auth/components/password-input.svelte";
	import { AlertCircle, Loader2 } from "lucide-svelte";

	interface Props {
		data: any;
	}

	let { data }: Props = $props();

	let errorMessage = $state<string | null>(null);
	let isLoading = $state(false);

	const form = superForm(data.form, {
		validators: zod4Client(loginSchema),
		async onUpdate({ form }) {
			if (!form.valid) return;

			isLoading = true;
			errorMessage = null;

			const { email, password, rememberMe } = form.data;

			await authClient.signIn.email(
				{
					email,
					password,
					rememberMe,
				},
				{
					onRequest: () => {
						isLoading = true;
					},
					onSuccess: () => {
						window.location.href = "/";
					},
					onError: (ctx) => {
						isLoading = false;
						errorMessage = ctx.error.message || "Failed to sign in. Please try again.";
					},
				}
			);
		},
	});

	const { form: formData, enhance } = form;
</script>

<div class="w-full">
	{#if errorMessage}
		<Alert.Root variant="destructive" class="mb-4">
			<AlertCircle class="size-4" />
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{errorMessage}</Alert.Description>
		</Alert.Root>
	{/if}

	<form method="POST" use:enhance class="space-y-4">
		<Form.Field {form} name="email">
			{#snippet children({ constraints, errors, tainted, value })}
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input
							{...props}
							type="email"
							placeholder="you@example.com"
							bind:value={$formData.email}
							disabled={isLoading}
							autocomplete="email"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			{/snippet}
		</Form.Field>

		<Form.Field {form} name="password">
			{#snippet children({ constraints, errors, tainted, value })}
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Password</Form.Label>
						<PasswordInput
							{...props}
							bind:value={$formData.password}
							placeholder="••••••••"
							disabled={isLoading}
							autocomplete="current-password"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			{/snippet}
		</Form.Field>

		<div class="flex items-center justify-between">
			<Form.Field {form} name="rememberMe" class="flex-row items-center space-x-2 space-y-0">
				{#snippet children({ constraints, errors, tainted, value })}
					<Form.Control>
						{#snippet children({ props })}
							<Checkbox {...props} bind:checked={$formData.rememberMe} disabled={isLoading} />
							<Form.Label class="text-sm font-normal">Remember me</Form.Label>
						{/snippet}
					</Form.Control>
				{/snippet}
			</Form.Field>

			<a
				href="/forgot-password"
				class="text-sm text-primary hover:underline"
				tabindex={isLoading ? -1 : 0}
			>
				Forgot password?
			</a>
		</div>

		<Button type="submit" class="w-full" disabled={isLoading}>
			{#if isLoading}
				<Loader2 class="size-4 animate-spin" />
				Signing in...
			{:else}
				Sign in
			{/if}
		</Button>

		<div class="text-center text-sm">
			Don't have an account?
			<a href="/register" class="text-primary hover:underline" tabindex={isLoading ? -1 : 0}>
				Sign up
			</a>
		</div>
	</form>
</div>
