import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { registerSchema } from "$lib/features/auth/register/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return {
		// @ts-expect-error - Zod v4 type structure mismatch with sveltekit-superforms
		form: await superValidate(null, zod4(registerSchema)),
	};
};
