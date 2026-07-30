import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScheduleColorLegend from './schedule-color-legend.svelte';
import { getStudentColor, getStudentInitials } from '../utils/entity-colors';

function entries(container: HTMLElement) {
	return Array.from(container.querySelectorAll('[data-testid="legend-entry"]'));
}

describe('ScheduleColorLegend', () => {
	it('lists exactly the students it is given, each with its deterministic colour', () => {
		const students = [
			{ id: 'stu-a', name: 'Alice Johnson' },
			{ id: 'stu-b', name: 'Bob Williams' }
		];
		const { container } = render(ScheduleColorLegend, { students });
		const c = container as HTMLElement;

		expect(entries(c)).toHaveLength(2);
		expect(c.textContent).toContain('Alice Johnson');
		expect(c.textContent).toContain('Bob Williams');

		const swatchColor = (id: string) =>
			(c.querySelector(`[data-student-id="${id}"] [data-testid="legend-swatch"]`) as HTMLElement)
				.getAttribute('data-color');
		expect(swatchColor('stu-a')).toBe(getStudentColor('stu-a'));
		// Different ids resolve to (here) different palette colours.
		expect(swatchColor('stu-a')).not.toBe(swatchColor('stu-b'));
		// The swatch carries the initials so identity is not hue-only.
		const swatchA = c.querySelector('[data-student-id="stu-a"] [data-testid="legend-swatch"]')!;
		expect(swatchA.textContent?.trim()).toBe(getStudentInitials('Alice Johnson'));
	});

	it('renders nothing when there are no students', () => {
		const { container } = render(ScheduleColorLegend, { students: [] });
		expect(
			(container as HTMLElement).querySelector('[data-testid="calendar-legend"]')
		).toBeNull();
	});

	it('collapses past the threshold and expands on demand', async () => {
		const students = Array.from({ length: 10 }, (_, i) => ({
			id: `s${i}`,
			name: `Student ${String.fromCharCode(65 + i)}`
		}));
		const { container } = render(ScheduleColorLegend, { students, collapseAfter: 4 });
		const c = container as HTMLElement;

		expect(entries(c)).toHaveLength(4);
		const toggle = Array.from(c.querySelectorAll('button')).find((b) =>
			/show all/i.test(b.textContent ?? '')
		)!;
		expect(toggle).toBeTruthy();
		toggle.click();
		await Promise.resolve();
		expect(entries(c)).toHaveLength(10);
	});
});
