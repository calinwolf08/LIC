import type { Selectable } from 'kysely';
import type { Preceptors, Clerkships } from '$lib/db/types';
import type { SchedulingContext } from '../types';

/**
 * Find all preceptors available for a specific clerkship on a specific date
 *
 * Filters preceptors by:
 * 1. Available on the given date
 * 2. Has capacity remaining on that date
 *
 * Note: Specialty matching has been removed as preceptors no longer have a specialty field.
 *
 * @param clerkship - The clerkship requiring a preceptor
 * @param date - The date to check availability
 * @param context - Current scheduling context
 * @returns Array of available preceptors (may be empty)
 */
export function getAvailablePreceptors(
	clerkship: Selectable<Clerkships>,
	date: string,
	context: SchedulingContext
): Selectable<Preceptors>[] {
	return context.preceptors.filter((preceptor) => {
		// 1. Check availability on this date
		const availableDates = context.preceptorAvailability.get(preceptor.id!);
		if (!availableDates?.has(date)) {
			return false;
		}

		// 2. Check capacity
		const assignmentsOnDate =
			context.assignmentsByDate
				.get(date)
				?.filter((a) => a.preceptorId === preceptor.id) || [];

		if (assignmentsOnDate.length >= Number(preceptor.max_students)) {
			return false;
		}

		return true;
	});
}

/**
 * Find all preceptors who can teach a specific clerkship
 *
 * Note: Since specialty matching is no longer enforced (preceptors don't have specialty),
 * this returns all preceptors.
 *
 * @param clerkship - The clerkship
 * @param context - Current scheduling context
 * @returns Array of all preceptors (specialty matching disabled)
 */
export function getPreceptorsForClerkship(
	clerkship: Selectable<Clerkships>,
	context: SchedulingContext
): Selectable<Preceptors>[] {
	// Return all preceptors since specialty matching is disabled
	return context.preceptors;
}
