/**
 * The schedule every new account starts with (created at sign-up), and how to
 * tell whether the user has made it theirs yet.
 *
 * Relative-import safe: the auth module (run under plain tsx by scripts) uses it.
 */

/** Name of the schedule created automatically at sign-up. */
export const DEFAULT_SCHEDULE_NAME = 'My Schedule';

/**
 * True for the auto-created schedule that nobody has saved since: still named
 * "My Schedule" and never updated. Saving it once — even unchanged, as the
 * setup step does — or creating a schedule deliberately makes this false.
 */
export function isUntouchedDefaultSchedule(schedule: {
	name: string;
	created_at: string;
	updated_at: string;
}): boolean {
	return schedule.name === DEFAULT_SCHEDULE_NAME && schedule.updated_at === schedule.created_at;
}
