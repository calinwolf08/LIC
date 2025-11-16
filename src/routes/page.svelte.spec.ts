import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		const mockData = {
			stats: {
				total_students: 10,
				total_preceptors: 5,
				total_clerkships: 3,
				total_assignments: 20,
				fully_scheduled_students: 5,
				partially_scheduled_students: 3,
				unscheduled_students: 2
			}
		};

		render(Page, { props: { data: mockData } });

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
		await expect.element(heading).toHaveTextContent('Dashboard');
	});
});
