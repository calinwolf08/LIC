/**
 * Setup readiness checklist (Step 10).
 *
 * Tells the user what is still missing before manual scheduling is meaningful.
 * Each item deep-links to the page that fixes it.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface ChecklistItem {
	id: string;
	label: string;
	done: boolean;
	count?: number;
	href: string;
}

export async function getSetupChecklist(
	db: Kysely<DB>,
	scheduleId: string,
	entitled: boolean
): Promise<ChecklistItem[]> {
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['name', 'start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();

	// Scoped counts via junction tables
	const [students, preceptors, clerkshipsWithDays, healthSystems, sites] = await Promise.all([
		db
			.selectFrom('schedule_students')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', '=', scheduleId)
			.executeTakeFirst(),
		db
			.selectFrom('schedule_preceptors')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', '=', scheduleId)
			.executeTakeFirst(),
		db
			.selectFrom('schedule_clerkships')
			.innerJoin('clerkships', 'clerkships.id', 'schedule_clerkships.clerkship_id')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_clerkships.schedule_id', '=', scheduleId)
			.where('clerkships.required_days', '>', 0)
			.executeTakeFirst(),
		db
			.selectFrom('schedule_health_systems')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', '=', scheduleId)
			.executeTakeFirst(),
		db
			.selectFrom('schedule_sites')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', '=', scheduleId)
			.executeTakeFirst()
	]);

	// Preceptors in this schedule lacking any availability rows
	const preceptorRows = await db
		.selectFrom('schedule_preceptors')
		.select('preceptor_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	const preceptorIds = preceptorRows.map((r) => r.preceptor_id);
	let preceptorsWithoutAvailability = 0;
	if (preceptorIds.length > 0) {
		const withAvail = await db
			.selectFrom('preceptor_availability')
			.select('preceptor_id')
			.where('preceptor_id', 'in', preceptorIds)
			.groupBy('preceptor_id')
			.execute();
		const set = new Set(withAvail.map((r) => r.preceptor_id));
		preceptorsWithoutAvailability = preceptorIds.filter((id) => !set.has(id)).length;
	}

	const studentCount = Number(students?.c ?? 0);
	const preceptorCount = Number(preceptors?.c ?? 0);
	const clerkshipCount = Number(clerkshipsWithDays?.c ?? 0);
	const healthSystemCount = Number(healthSystems?.c ?? 0);
	const siteCount = Number(sites?.c ?? 0);

	const items: ChecklistItem[] = [
		{
			id: 'schedule-dates',
			label: 'Name your schedule and set its dates',
			done: !!period && period.name !== 'My Schedule' && !!period.start_date && !!period.end_date,
			href: '/schedules'
		},
		{
			id: 'locations',
			label: 'Add a health system and a site',
			done: healthSystemCount > 0 && siteCount > 0,
			href: '/locations'
		},
		{
			id: 'clerkships',
			label: 'Add a clerkship with required days',
			done: clerkshipCount > 0,
			href: '/clerkships'
		},
		{
			id: 'preceptors',
			label: 'Add a preceptor',
			done: preceptorCount > 0,
			href: '/preceptors'
		},
		{
			id: 'availability',
			label:
				preceptorsWithoutAvailability > 0
					? `Set availability for ${preceptorsWithoutAvailability} preceptor(s)`
					: 'Set preceptor availability',
			done: preceptorCount > 0 && preceptorsWithoutAvailability === 0,
			count: preceptorsWithoutAvailability || undefined,
			href: '/preceptors'
		},
		{
			id: 'students',
			label: 'Add a student',
			done: studentCount > 0,
			href: '/students'
		}
	];

	if (entitled) {
		items.push({
			id: 'autogen-ready',
			label: 'Configure auto-generation (teams / capacity)',
			done: clerkshipCount > 0 && preceptorCount > 0,
			href: '/generate'
		});
	}

	return items;
}
