<script lang="ts">
	import { loginSchema } from "../utils";
	import { authClient } from "$lib/auth-client";
	import { FormField } from "$lib/components/forms";
	import { useForm } from "$lib/components/forms";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import * as Alert from "$lib/components/ui/alert";
	import PasswordInput from "$lib/features/auth/components/password-input.svelte";
	import { AlertCircle, Loader2 } from "lucide-svelte";

	interface Props {
		serverErrors?: Record<string, string[]>;
		redirectTo?: string;
	}

	let { serverErrors, redirectTo = '/' }: Props = $props();

	let errorMessage = $state<string | null>(null);

	const formManager = useForm({
		initialValues: {
			email: '',
			password: '',
			rememberMe: false
		},
		validationSchema: loginSchema,
		validateOnBlur: true,
		validateOnChange: false,
		async onSubmit(values) {
			errorMessage = null;

			await authClient.signIn.email(
				{
					email: values.email,
					password: values.password,
					rememberMe: values.rememberMe,
				},
				{
					onSuccess: () => {
						window.location.href = redirectTo;
					},
					onError: (ctx) => {
						errorMessage = ctx.error.message || "Failed to sign in. Please try again.";
					},
				}
			);
		}
	});

	// Merge server errors with client errors
	const getFieldErrors = (fieldName: keyof typeof formManager.values) => {
		const clientErrors = formManager.fields[fieldName]?.errors || [];
		const serverFieldErrors = serverErrors?.[fieldName] || [];
		return [...clientErrors, ...serverFieldErrors];
	};
</script>

<div class="w-full">
	{#if errorMessage}
		<Alert.Root variant="destructive" class="mb-4">
			<AlertCircle class="size-4" />
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{errorMessage}</Alert.Description>
		</Alert.Root>
	{/if}

	<form method="POST" onsubmit={formManager.handleSubmit} class="space-y-4">
		<FormField
			label="Email"
			name="email"
			error={getFieldErrors('email')}
			required
		>
			<Input
				id="email"
				type="email"
				placeholder="you@example.com"
				disabled={formManager.isSubmitting}
				autocomplete="email"
				aria-invalid={getFieldErrors('email').length > 0}
				bind:value={formManager.values.email}
				onblur={() => formManager.handleBlur('email')}
			/>
		</FormField>

		<FormField
			label="Password"
			name="password"
			error={getFieldErrors('password')}
			required
		>
			<PasswordInput
				id="password"
				placeholder="••••••••"
				disabled={formManager.isSubmitting}
				autocomplete="current-password"
				aria-invalid={getFieldErrors('password').length > 0}
				bind:value={formManager.values.password}
				onblur={() => formManager.handleBlur('password')}
			/>
		</FormField>

		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<Checkbox
					id="rememberMe"
					disabled={formManager.isSubmitting}
					bind:checked={formManager.values.rememberMe}
				/>
				<Label
					for="rememberMe"
					class="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
				>
					Remember me
				</Label>
			</div>

			<a
				href="/forgot-password"
				class="text-sm text-primary hover:underline"
				tabindex={formManager.isSubmitting ? -1 : 0}
			>
				Forgot password?
			</a>
		</div>

		<Button type="submit" class="w-full" disabled={formManager.isSubmitting}>
			{#if formManager.isSubmitting}
				<Loader2 class="size-4 animate-spin" />
				Signing in...
			{:else}
				Sign in
			{/if}
		</Button>

		<div class="text-center text-sm">
			Don't have an account?
			<a href="/register" class="text-primary hover:underline" tabindex={formManager.isSubmitting ? -1 : 0}>
				Sign up
			</a>
		</div>
	</form>
</div>
