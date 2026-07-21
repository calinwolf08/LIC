import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const tab = url.searchParams.get('tab');
	redirect(308, `/clerkships/${params.id}${tab ? `?tab=${tab}` : ''}`);
};
