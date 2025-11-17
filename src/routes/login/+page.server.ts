import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { loginSchema } from "$lib/features/auth/login/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return {
		form: await superValidate(null, zod(loginSchema)),
	};
};
