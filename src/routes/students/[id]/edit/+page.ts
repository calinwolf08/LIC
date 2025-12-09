/**
 * Edit Student Page - Redirects to Student Detail Page
 *
 * The edit functionality has been moved to the Details tab on the student detail page.
 */

import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ params }) => {
	// Redirect to the student detail page (which now has the edit form in the Details tab)
	throw redirect(302, `/students/${params.id}`);
};
