import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoActiveSchedule from './no-active-schedule.svelte';

describe('NoActiveSchedule', () => {
	it('names the state and links to schedule management', () => {
		const { container } = render(NoActiveSchedule, {});
		const c = container as HTMLElement;
		expect(c.textContent).toContain('No active schedule');

		const cta = c.querySelector('[data-testid="no-schedule-cta"]') as HTMLAnchorElement | null;
		expect(cta).not.toBeNull();
		expect(cta!.getAttribute('href')).toBe('/schedules');
	});

	it('folds the surface name into the copy when given', () => {
		const { container } = render(NoActiveSchedule, { surface: 'calendar' });
		expect((container as HTMLElement).textContent).toContain('calendar');
	});
});
