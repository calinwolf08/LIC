import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AssignmentDatePicker from './assignment-date-picker.svelte';
import type { DayState } from '$lib/features/scheduling/services/assignment-day-state';

const MONTH = '2026-03';
const RANGE_START = '2026-03-03';
const RANGE_END = '2026-03-28';

function day(date: string, over: Partial<DayState> = {}): DayState {
	return {
		date,
		inRange: true,
		state: 'available',
		preceptorBookings: [],
		preceptorAtCapacity: false,
		studentBusy: false,
		isPast: false,
		...over
	};
}

/** One day per machine state the grid can produce. */
function baseStates(): Map<string, DayState> {
	return new Map<string, DayState>([
		['2026-03-04', day('2026-03-04', { state: 'available' })],
		[
			'2026-03-05',
			day('2026-03-05', {
				preceptorBookings: [{ assignmentId: 'a1', studentId: 's1', studentName: 'Bob Jones' }]
			})
		],
		['2026-03-06', day('2026-03-06', { preceptorAtCapacity: true })],
		['2026-03-07', day('2026-03-07', { studentBusy: true })],
		['2026-03-09', day('2026-03-09', { state: 'blackout' })],
		['2026-03-10', day('2026-03-10', { state: 'unavailable' })]
		// 2026-03-11 deliberately absent → 'unset'
	]);
}

function mount(overrides: {
	dayStates?: Map<string, DayState>;
	selected?: string[];
	mode?: 'single' | 'range' | 'individual';
}) {
	return render(AssignmentDatePicker, {
		rangeStart: RANGE_START,
		rangeEnd: RANGE_END,
		dayStates: overrides.dayStates ?? baseStates(),
		selected: overrides.selected ?? [],
		mode: overrides.mode ?? 'individual',
		month: MONTH,
		onMonthChange: () => {}
	});
}

function cell(container: HTMLElement, date: string): HTMLButtonElement | null {
	return container.querySelector(`[data-testid="day-${date}"]`);
}

describe('AssignmentDatePicker — day states', () => {
	it('renders each machine state distinctly', () => {
		const { container } = mount({});
		const c = container as HTMLElement;
		expect(cell(c, '2026-03-04')!.getAttribute('data-state')).toBe('available');
		expect(cell(c, '2026-03-05')!.getAttribute('data-state')).toBe('taken');
		expect(cell(c, '2026-03-06')!.getAttribute('data-state')).toBe('full');
		expect(cell(c, '2026-03-07')!.getAttribute('data-state')).toBe('busy');
		expect(cell(c, '2026-03-09')!.getAttribute('data-state')).toBe('blackout');
		expect(cell(c, '2026-03-10')!.getAttribute('data-state')).toBe('unavailable');
		expect(cell(c, '2026-03-11')!.getAttribute('data-state')).toBe('unset');
	});

	it('flags days outside the schedule range as out-of-range', () => {
		const { container } = mount({});
		// The 1st/2nd sit before RANGE_START (the 3rd).
		expect(cell(container as HTMLElement, '2026-03-01')!.getAttribute('data-state')).toBe(
			'out-of-range'
		);
	});
});

describe('AssignmentDatePicker — selection composes with state (regression)', () => {
	it('a selected AND booked day keeps its conflict styling and gains the ring', () => {
		const { container } = mount({ selected: ['2026-03-05'] });
		const taken = cell(container as HTMLElement, '2026-03-05')!;

		// Still a conflict…
		expect(taken.getAttribute('data-state')).toBe('taken');
		// …still marked selected…
		expect(taken.getAttribute('data-selected')).toBe('true');
		// …the amber conflict fill survives (not short-circuited by selection)…
		expect(taken.className).toContain('bg-amber-100');
		// …and the selection ring is added on top.
		expect(taken.className).toContain('ring-2');
	});
});

describe('AssignmentDatePicker — selected conflicts list', () => {
	it('lists exactly the conflicting members of a multi-day selection', () => {
		const { container } = mount({ selected: ['2026-03-04', '2026-03-05'] });
		const panel = (container as HTMLElement).querySelector('[data-testid="selected-conflicts"]');
		expect(panel).not.toBeNull();
		const text = panel!.textContent ?? '';
		// The booked day is called out with its reason…
		expect(text).toContain('2026-03-05');
		expect(text).toContain('preceptor already booked');
		// …the clean day is not.
		expect(text).not.toContain('2026-03-04');
	});

	it('is absent when the whole selection is clean', () => {
		const { container } = mount({ selected: ['2026-03-04'] });
		expect(
			(container as HTMLElement).querySelector('[data-testid="selected-conflicts"]')
		).toBeNull();
	});

	it('names the right reason for each conflict kind', () => {
		const { container } = mount({
			selected: ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-10']
		});
		const text =
			(container as HTMLElement).querySelector('[data-testid="selected-conflicts"]')!.textContent ??
			'';
		expect(text).toContain('preceptor already booked'); // taken
		expect(text).toContain('preceptor at capacity'); // full
		expect(text).toContain('student already assigned'); // busy
		expect(text).toContain('preceptor unavailable'); // unavailable
	});
});

describe('AssignmentDatePicker — legend', () => {
	it('renders an entry for every state the grid can produce', () => {
		const { container } = mount({ selected: ['2026-03-04'] });
		const text = (container as HTMLElement).textContent ?? '';
		for (const label of [
			'Available',
			'Unavailable',
			'Not set',
			'Taken',
			'Full',
			'Student busy',
			'Blackout',
			'Out of range',
			'Selected'
		]) {
			// Normalise non-breaking spaces the markup introduces via wrapping.
			expect(text.replace(/\s+/g, ' ')).toContain(label.replace(/ /g, ' '));
		}
	});
});
