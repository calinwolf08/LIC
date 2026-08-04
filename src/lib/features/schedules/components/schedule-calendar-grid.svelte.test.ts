import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScheduleCalendarGrid from './schedule-calendar-grid.svelte';
import { getStudentColor } from '../utils/entity-colors';
import type {
	CalendarMonth,
	CalendarDay,
	CalendarDayAssignment
} from '../types/schedule-views';

function assignment(over: Partial<CalendarDayAssignment> = {}): CalendarDayAssignment {
	return {
		id: 'as1',
		clerkshipId: 'c1',
		clerkshipName: 'Family Medicine',
		preceptorId: 'p1',
		preceptorName: 'Dr. Smith',
		studentId: 'stu1',
		studentName: 'Alice Johnson',
		color: '#123456',
		...over
	};
}

function dayWith(assignments: CalendarDayAssignment[], over: Partial<CalendarDay> = {}): CalendarDay {
	return {
		date: '2026-03-04',
		dayOfMonth: 4,
		dayOfWeek: 3,
		isCurrentMonth: true,
		isInRange: true,
		isToday: false,
		isWeekend: false,
		assignments,
		...over
	};
}

/** A single-week month wrapping the given days. */
function month(days: CalendarDay[]): CalendarMonth {
	return {
		year: 2026,
		month: 3,
		monthName: 'March 2026',
		weeks: [{ weekNumber: 1, days }]
	};
}

function cells(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll('[data-testid="calendar-assignment"]'));
}

describe('ScheduleCalendarGrid — cell labels by mode', () => {
	it('mode="schedule" renders student, clerkship and preceptor', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment()])])],
			mode: 'schedule'
		});
		const text = (container as HTMLElement).textContent ?? '';
		expect(text).toContain('Alice Johnson');
		expect(text).toContain('Family Medicine');
		expect(text).toContain('Dr. Smith');
	});

	it('mode="student" omits the student but keeps clerkship + preceptor (no regression)', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment()])])],
			mode: 'student'
		});
		const c = container as HTMLElement;
		const cellText = cells(c)[0].textContent ?? '';
		// The student page already knows the student — it must not be repeated here.
		expect(cellText).not.toContain('Alice Johnson');
		expect(cellText).toContain('Family Medicine');
		expect(cellText).toContain('Dr. Smith');
	});
});

describe('ScheduleCalendarGrid — colour semantics', () => {
	it('colorBy="student": same student shares a colour, different students differ', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [
				month([
					dayWith([
						assignment({ id: 'a', studentId: 'stuA' }),
						assignment({ id: 'b', studentId: 'stuA' }),
						assignment({ id: 'c', studentId: 'stuB' })
					])
				])
			],
			mode: 'schedule',
			colorBy: 'student',
			fitLimit: 10
		});
		const c = container as HTMLElement;
		const byId = (id: string) =>
			cells(c)
				.find((el) => el.getAttribute('data-assignment-id') === id)!
				.getAttribute('data-color');

		expect(byId('a')).toBe(byId('b')); // same student → same colour
		expect(byId('a')).not.toBe(byId('c')); // different student → different colour
		// And it is the deterministic student colour, not the service colour.
		expect(byId('a')).toBe(getStudentColor('stuA'));
	});

	it('colorBy="student" also renders a student-initials chip (identity not hue-only)', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment({ studentName: 'Alice Johnson' })])])],
			mode: 'schedule',
			colorBy: 'student'
		});
		const chip = (container as HTMLElement).querySelector('[data-testid="student-initials"]');
		expect(chip).not.toBeNull();
		expect(chip!.textContent?.trim()).toBe('AJ');
	});

	it('colorBy="clerkship" (default) omits the student-initials chip', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment({ studentName: 'Alice Johnson' })])])],
			mode: 'schedule'
		});
		expect(
			(container as HTMLElement).querySelector('[data-testid="student-initials"]')
		).toBeNull();
	});

	it('colorBy="clerkship" (default) keeps the service-provided colour', () => {
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment({ color: '#abcdef' })])])],
			mode: 'schedule'
		});
		expect(cells(container as HTMLElement)[0].getAttribute('data-color')).toBe('#abcdef');
	});

	it('the student colour is stable across a re-render', () => {
		const first = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment({ id: 'a', studentId: 'stuStable' })])])],
			mode: 'schedule',
			colorBy: 'student'
		});
		const firstColor = cells(first.container as HTMLElement)[0].getAttribute('data-color');

		const second = render(ScheduleCalendarGrid, {
			months: [month([dayWith([assignment({ id: 'a', studentId: 'stuStable' })])])],
			mode: 'schedule',
			colorBy: 'student'
		});
		const secondColor = cells(second.container as HTMLElement)[0].getAttribute('data-color');

		expect(firstColor).toBe(secondColor);
	});
});

describe('ScheduleCalendarGrid — overflow affordance', () => {
	it('shows "+N more" past fitLimit and the drawer inherits the same labels', () => {
		const many = Array.from({ length: 5 }, (_, i) =>
			assignment({ id: `m${i}`, studentName: `Student ${i}`, studentId: `s${i}` })
		);
		let drawerDay: CalendarDay | null = null;
		const { container } = render(ScheduleCalendarGrid, {
			months: [month([dayWith(many)])],
			mode: 'schedule',
			fitLimit: 3,
			onShowMore: (day: CalendarDay) => {
				drawerDay = day;
			}
		});
		const c = container as HTMLElement;

		// Only fitLimit cells are rendered inline; the rest are behind "+N more".
		expect(cells(c)).toHaveLength(3);
		const moreBtn = Array.from(c.querySelectorAll('button')).find((b) =>
			/\+2 more/.test(b.textContent ?? '')
		);
		expect(moreBtn).toBeTruthy();

		// The drawer callback receives the full day with every assignment.
		moreBtn!.click();
		expect(drawerDay).not.toBeNull();
		expect(drawerDay!.assignments).toHaveLength(5);
	});
});
