import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { registerSchema } from "$lib/schemas/auth";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { auth } from "$lib/auth";

export const load: PageServerLoad = async () => {
	return {
		form: await superValidate(zod(registerSchema)),
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod(registerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Attempt to sign up with better-auth
			const response = await auth.api.signUpEmail({
				body: {
					name: form.data.name,
					email: form.data.email,
					password: form.data.password,
				},
			});

			if (!response) {
				return fail(400, {
					form,
					error: "Failed to create account. Please try again.",
				});
			}

			// Redirect to home page on successful registration
			throw redirect(303, "/");
		} catch (error) {
			if (error instanceof Response && error.status === 303) {
				throw error; // Re-throw redirects
			}

			console.error("Registration error:", error);

			// Check for common error types
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.includes("already exists") || errorMessage.includes("duplicate")) {
				return fail(400, {
					form,
					error: "An account with this email already exists.",
				});
			}

			return fail(500, {
				form,
				error: "An error occurred during registration. Please try again.",
			});
		}
	},
};
