/**
 * The schedule the seed owns, shared by the seed script and the e2e journeys.
 *
 * Kept dependency-free (no `$lib` aliases) so Playwright specs can import it by
 * relative path.
 *
 * The range is anchored to today rather than to fixed calendar dates: it starts
 * a month back — so there are real past days to exercise the past-date override
 * against — and runs nine months forward. Fixed dates rot; a schedule that has
 * silently drifted entirely into the past has already misled test authors once.
 */

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function iso(d: Date): string {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** First day of the month `offset` months from the current month. */
export function monthStart(offset: number, from: Date = new Date()): string {
	return iso(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1)));
}

/** Last day of the month `offset` months from the current month. */
export function monthEnd(offset: number, from: Date = new Date()): string {
	return iso(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset + 1, 0)));
}

export const TEST_SCHEDULE = {
	name: 'Demo Schedule',
	get startDate(): string {
		return monthStart(-1);
	},
	get endDate(): string {
		return monthEnd(9);
	}
};

/** Today, as YYYY-MM-DD (UTC). */
export function today(): string {
	return iso(new Date());
}

/** `days` days from today, as YYYY-MM-DD (UTC). */
export function fromToday(days: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() + days);
	return iso(d);
}
