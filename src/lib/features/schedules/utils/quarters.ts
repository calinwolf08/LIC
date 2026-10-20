/**
 * Quarter rules shared by the schedule editor (client) and the quarters API
 * (server), so both agree on what a valid set of quarters is.
 *
 * Dates are ISO `YYYY-MM-DD` strings; all arithmetic is done in UTC so a
 * date never shifts with the viewer's time zone.
 */

export interface QuarterDraft {
	name: string;
	start_date: string;
	end_date: string;
}

export interface ScheduleRange {
	start_date: string;
	end_date: string;
}

/** One problem with one quarter (by its index in the submitted list). */
export interface QuarterIssue {
	index: number;
	message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: string): Date {
	return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
	const d = toUtc(date);
	d.setUTCDate(d.getUTCDate() + days);
	return toIso(d);
}

/**
 * The same day `months` later, clamped to the end of a shorter month
 * (Jan 31 + 1 month → Feb 28/29), so quarters never skip a month.
 */
export function addMonths(date: string, months: number): string {
	const d = toUtc(date);
	const day = d.getUTCDate();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() + months);
	const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
	d.setUTCDate(Math.min(day, lastDay));
	return toIso(d);
}

/** Default quarter length when adding one. */
export const DEFAULT_QUARTER_MONTHS = 3;

/**
 * The quarter to add next: named Q<n> after the highest existing Q-number,
 * starting the day after the latest existing quarter ends (or on the schedule's
 * start), running 3 months, and never past the schedule's end.
 *
 * @returns null when no room is left (the latest quarter already reaches the
 *          schedule's end) or the schedule has no valid dates
 */
export function nextQuarter(
	existing: readonly QuarterDraft[],
	schedule: ScheduleRange
): QuarterDraft | null {
	if (!ISO_DATE.test(schedule.start_date) || !ISO_DATE.test(schedule.end_date)) return null;

	const latestEnd = existing
		.map((q) => q.end_date)
		.filter((d) => ISO_DATE.test(d))
		.sort()
		.at(-1);
	const start = latestEnd ? addDays(latestEnd, 1) : schedule.start_date;
	if (start > schedule.end_date) return null;

	const fullEnd = addDays(addMonths(start, DEFAULT_QUARTER_MONTHS), -1);
	const end = fullEnd < schedule.end_date ? fullEnd : schedule.end_date;

	const highest = existing.reduce((max, q) => {
		const n = /^Q(\d+)$/i.exec(q.name.trim())?.[1];
		return n ? Math.max(max, Number(n)) : max;
	}, 0);
	const number = Math.max(highest, existing.length) + 1;

	return { name: `Q${number}`, start_date: start, end_date: end };
}

/**
 * Every problem with a set of quarters for a schedule: a missing name or date,
 * an end before its start, a quarter outside the schedule's dates, or two
 * quarters that overlap. Empty when the set is valid.
 */
export function validateQuarters(
	quarters: readonly QuarterDraft[],
	schedule: ScheduleRange
): QuarterIssue[] {
	const issues: QuarterIssue[] = [];

	quarters.forEach((q, index) => {
		const label = q.name.trim() || `Quarter ${index + 1}`;
		if (!q.name.trim()) issues.push({ index, message: `${label} needs a name` });
		if (!ISO_DATE.test(q.start_date) || !ISO_DATE.test(q.end_date)) {
			issues.push({ index, message: `${label} needs a start and an end date` });
			return;
		}
		if (q.end_date < q.start_date) {
			issues.push({ index, message: `${label} ends before it starts` });
		}
		if (q.start_date < schedule.start_date || q.end_date > schedule.end_date) {
			issues.push({
				index,
				message: `${label} must fall within the schedule (${schedule.start_date} to ${schedule.end_date})`
			});
		}
	});

	// Overlaps: compare each dated quarter with every later one (inclusive ends).
	const dated = quarters
		.map((q, index) => ({ ...q, index }))
		.filter((q) => ISO_DATE.test(q.start_date) && ISO_DATE.test(q.end_date));
	for (let i = 0; i < dated.length; i++) {
		for (let j = i + 1; j < dated.length; j++) {
			const a = dated[i];
			const b = dated[j];
			if (a.start_date <= b.end_date && b.start_date <= a.end_date) {
				const name = (q: QuarterDraft, n: number) => q.name.trim() || `Quarter ${n + 1}`;
				issues.push({
					index: b.index,
					message: `${name(b, b.index)} overlaps ${name(a, a.index)}`
				});
			}
		}
	}

	return issues;
}
