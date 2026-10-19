import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/db';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { updateSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';
import type { Actions, PageServerLoad } from './$types';

/**
 * Set up the schedule you already have: its name and dates.
 *
 * New accounts start with one schedule (created at sign-up). Onboarding sends
 * the user here right after naming their organization, and the dashboard's
 * "Name your schedule" step links here — both edit the ACTIVE schedule, so
 * nobody creates a second schedule by accident.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const setupSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Schedule name is required')
			.max(200, 'Schedule name must be at most 200 characters'),
		start_date: z.string().regex(ISO_DATE, 'Choose a start date'),
		end_date: z.string().regex(ISO_DATE, 'Choose an end date')
	})
	.refine((data) => data.start_date <= data.end_date, {
		message: 'The end date must be on or after the start date',
		path: ['end_date']
	});

async function activeScheduleFor(userId: string) {
	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return null;
	return db
		.selectFrom('scheduling_periods')
		.select(['id', 'name', 'start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.where('user_id', '=', userId)
		.executeTakeFirst();
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.session?.user?.id;
	if (!userId) throw redirect(302, '/login');

	const schedule = await activeScheduleFor(userId);
	// No schedule at all (deleted): creating one is the only option.
	if (!schedule) throw redirect(302, '/schedules/new');

	return {
		schedule,
		onboarding: url.searchParams.has('onboarding')
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const userId = locals.session?.user?.id;
		if (!userId) throw redirect(303, '/login');

		const form = await request.formData();
		const raw = {
			name: String(form.get('name') ?? ''),
			start_date: String(form.get('start_date') ?? ''),
			end_date: String(form.get('end_date') ?? '')
		};

		const parsed = setupSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, { values: raw, errors: parsed.error.flatten().fieldErrors });
		}

		// Always the user's own active schedule — never an id from the form.
		const schedule = await activeScheduleFor(userId);
		if (!schedule?.id) throw redirect(303, '/schedules/new');
		await updateSchedulingPeriod(db, schedule.id, parsed.data);

		throw redirect(303, '/dashboard');
	}
};
