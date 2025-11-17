import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { loginSchema } from "$lib/schemas/auth";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { auth } from "$lib/auth";

export const load: PageServerLoad = async () => {
	return {
		form: await superValidate(zod(loginSchema)),
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod(loginSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Attempt to sign in with better-auth
			const response = await auth.api.signInEmail({
				body: {
					email: form.data.email,
					password: form.data.password,
					rememberMe: form.data.rememberMe,
				},
			});

			if (!response) {
				return fail(401, {
					form,
					error: "Invalid email or password",
				});
			}

			// Redirect to home page on successful login
			throw redirect(303, "/");
		} catch (error) {
			if (error instanceof Response && error.status === 303) {
				throw error; // Re-throw redirects
			}

			console.error("Login error:", error);
			return fail(500, {
				form,
				error: "An error occurred during login. Please try again.",
			});
		}
	},
};
