/**
 * Phase 3 (manual scheduling) helpers.
 *
 * Manual-scheduling journeys mutate assignments heavily, so they run inside a
 * throwaway sandbox schedule populated with the seeded roster (health systems,
 * sites, clerkships, students, preceptors). Because onboarding and preceptor
 * availability are global (not schedule-scoped), the seeded entities behave in
 * the sandbox exactly as in the Demo Schedule — clean creates are clean — while
 * every row created here is torn down with the sandbox.
 */

import { apiOf, activeScheduleId, type Page } from '../../fixtures';
import { createSandboxSchedule, type Sandbox } from '../../fixtures/sandbox';

export interface RosterEntity {
	id: string;
	name: string;
	health_system_id?: string | null;
	clerkship_type?: string;
}

export interface SeededRoster {
	sandbox: Sandbox;
	students: RosterEntity[];
	preceptors: RosterEntity[];
	clerkships: RosterEntity[];
	sites: RosterEntity[];
	healthSystems: RosterEntity[];
}

/**
 * Create a sandbox schedule and add the full seeded roster to it.
 *
 * The `/api/*` list routes are scoped to the active schedule, so the seeded ids
 * are read while the Demo Schedule is still active; the sandbox is created
 * inactive, populated, and only then activated.
 */
export async function populatedSandbox(page: Page, name?: string): Promise<SeededRoster> {
	const api = apiOf(page);

	// 1. Read the seeded roster while the Demo Schedule is active.
	const [healthSystems, sites, clerkships, students, preceptors] = await Promise.all([
		api.get<RosterEntity[]>('/api/health-systems'),
		api.get<RosterEntity[]>('/api/sites'),
		api.get<RosterEntity[]>('/api/clerkships'),
		api.get<RosterEntity[]>('/api/students'),
		api.get<RosterEntity[]>('/api/preceptors')
	]);
	const roster = {
		healthSystems: healthSystems.data ?? [],
		sites: sites.data ?? [],
		clerkships: clerkships.data ?? [],
		students: students.data ?? [],
		preceptors: preceptors.data ?? []
	};

	// 2. Create the sandbox WITHOUT activating it (Demo stays active above).
	const sandbox = await createSandboxSchedule(page, {
		name: name ?? `P3 ${Date.now()}`,
		activate: false
	});

	// 3. Add the roster to the sandbox.
	const add = (entityType: string, ids: string[]) =>
		ids.length
			? api.post(`/api/scheduling-periods/${sandbox.id}/entities`, { entityType, entityIds: ids })
			: Promise.resolve();
	await add(
		'health_systems',
		roster.healthSystems.map((e) => e.id)
	);
	await add(
		'sites',
		roster.sites.map((e) => e.id)
	);
	await add(
		'clerkships',
		roster.clerkships.map((e) => e.id)
	);
	await add(
		'preceptors',
		roster.preceptors.map((e) => e.id)
	);
	await add(
		'students',
		roster.students.map((e) => e.id)
	);

	// 4. Activate the sandbox.
	await api.put('/api/user/active-schedule', { scheduleId: sandbox.id });
	if ((await activeScheduleId(page)) !== sandbox.id) {
		throw new Error('populatedSandbox: could not activate the sandbox schedule');
	}

	return { sandbox, ...roster };
}
