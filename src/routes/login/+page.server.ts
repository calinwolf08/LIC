import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { loginSchema } from "$lib/features/auth/login/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return {
		// @ts-expect-error - Zod v4 internal properties (~standard, ~validate) not in sveltekit-superforms types
		form: await superValidate(null, zod(loginSchema)),
	};
};
