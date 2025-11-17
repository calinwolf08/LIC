import type { PreceptorsTable, ClerkshipsTable } from '$lib/db/types';
import type { SchedulingContext } from '../types';

/**
 * Find all preceptors available for a specific clerkship on a specific date
 *
 * Filters preceptors by:
 * 1. Specialty matches clerkship
 * 2. Available on the given date
 * 3. Has capacity remaining on that date
 *
 * @param clerkship - The clerkship requiring a preceptor
 * @param date - The date to check availability
 * @param context - Current scheduling context
 * @returns Array of available preceptors (may be empty)
 */
export function getAvailablePreceptors(
	clerkship: ClerkshipsTable,
	date: string,
	context: SchedulingContext
): PreceptorsTable[] {
	return context.preceptors.filter((preceptor) => {
		// 1. Check specialty match
		if (preceptor.specialty !== clerkship.specialty) {
			return false;
		}

		// 2. Check availability on this date
		const availableDates = context.preceptorAvailability.get(preceptor.id);
		if (!availableDates?.has(date)) {
			return false;
		}

		// 3. Check capacity
		const assignmentsOnDate =
			context.assignmentsByDate
				.get(date)
				?.filter((a) => a.preceptorId === preceptor.id) || [];

		if (assignmentsOnDate.length >= preceptor.max_students) {
			return false;
		}

		return true;
	});
}

/**
 * Find all preceptors who can teach a specific clerkship (regardless of date)
 *
 * @param clerkship - The clerkship
 * @param context - Current scheduling context
 * @returns Array of preceptors with matching specialty
 */
export function getPreceptorsForClerkship(
	clerkship: ClerkshipsTable,
	context: SchedulingContext
): PreceptorsTable[] {
	return context.preceptors.filter((p) => p.specialty === clerkship.specialty);
}
