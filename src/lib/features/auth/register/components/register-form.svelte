<script lang="ts">
	import { registerSchema } from "../utils";
	import { authClient } from "$lib/auth-client";
	import { FormField } from "$lib/components/forms";
	import { useForm } from "$lib/components/forms";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import * as Alert from "$lib/components/ui/alert";
	import PasswordInput from "$lib/features/auth/components/password-input.svelte";
	import { AlertCircle, Loader2 } from "lucide-svelte";

	interface Props {
		serverErrors?: Record<string, string[]>;
	}

	let { serverErrors }: Props = $props();

	let errorMessage = $state<string | null>(null);

	const formManager = useForm({
		initialValues: {
			name: '',
			email: '',
			password: '',
			confirmPassword: ''
		},
		validationSchema: registerSchema,
		validateOnBlur: true,
		validateOnChange: false,
		async onSubmit(values) {
			errorMessage = null;

			await authClient.signUp.email(
				{
					name: values.name,
					email: values.email,
					password: values.password,
				},
				{
					onSuccess: () => {
						window.location.href = "/";
					},
					onError: (ctx) => {
						errorMessage = ctx.error.message || "Failed to create account. Please try again.";
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
			label="Name"
			name="name"
			error={getFieldErrors('name')}
			required
		>
			<Input
				id="name"
				type="text"
				placeholder="John Doe"
				disabled={formManager.isSubmitting}
				autocomplete="name"
				aria-invalid={getFieldErrors('name').length > 0}
				bind:value={formManager.values.name}
				onblur={() => formManager.handleBlur('name')}
			/>
		</FormField>

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
			description="Password must be at least 8 characters"
			required
		>
			<PasswordInput
				id="password"
				placeholder="••••••••"
				disabled={formManager.isSubmitting}
				autocomplete="new-password"
				aria-invalid={getFieldErrors('password').length > 0}
				bind:value={formManager.values.password}
				onblur={() => formManager.handleBlur('password')}
			/>
		</FormField>

		<FormField
			label="Confirm Password"
			name="confirmPassword"
			error={getFieldErrors('confirmPassword')}
			required
		>
			<PasswordInput
				id="confirmPassword"
				placeholder="••••••••"
				disabled={formManager.isSubmitting}
				autocomplete="new-password"
				aria-invalid={getFieldErrors('confirmPassword').length > 0}
				bind:value={formManager.values.confirmPassword}
				onblur={() => formManager.handleBlur('confirmPassword')}
			/>
		</FormField>

		<Button type="submit" class="w-full" disabled={formManager.isSubmitting}>
			{#if formManager.isSubmitting}
				<Loader2 class="size-4 animate-spin" />
				Creating account...
			{:else}
				Create account
			{/if}
		</Button>

		<div class="text-center text-sm">
			Already have an account?
			<a href="/login" class="text-primary hover:underline" tabindex={formManager.isSubmitting ? -1 : 0}>
				Sign in
			</a>
		</div>
	</form>
</div>
