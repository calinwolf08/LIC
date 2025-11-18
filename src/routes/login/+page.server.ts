import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	// No server-side form initialization needed
	// Forms use client-side validation with better-auth
	return {};
};
