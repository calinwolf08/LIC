/**
 * Turn a demo `ScheduleScenario` into rows, the same shape the app's create
 * APIs produce: entities, their schedule junction rows, clerkship configs,
 * teams, electives, materialised availability, onboarding, core preceptors,
 * mutual exclusions, blackouts and quarters. No assignments.
 *
 * Imports are relative: this runs under plain tsx (also inside the Docker image).
 */

import type { Kysely } from 'kysely';
import type { DB } from '../../types';
import type { ScheduleScenario } from './scenarios';

/** Domain for every demo student/preceptor email (globally unique columns). */
export const DEMO_EMAIL_DOMAIN = 'demo.lic.test';

const id = () => crypto.randomUUID();

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** The first Monday at least `minDaysAhead` days after `today` (UTC). */
export function demoAnchor(today: Date = new Date(), minDaysAhead = 14): string {
	const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
	d.setUTCDate(d.getUTCDate() + minDaysAhead);
	while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function slug(name: string): string {
	return name
		.toLowerCase()
		.replace(/^dr\.\s*/, '')
		.replace(/[^a-z0-9]+/g, '.')
		.replace(/^\.|\.$/g, '');
}

/**
 * Clerkship names and student/preceptor emails are unique across the whole
 * database, so each demo account stamps them with a namespace: empty for the
 * default account (clean names), its email's local part for any other.
 */
export function demoNamespace(accountEmail: string, defaultEmail: string): string {
	return accountEmail.toLowerCase() === defaultEmail.toLowerCase()
		? ''
		: slug(accountEmail.split('@')[0]);
}

/** Globally-unique display name for a scenario's clerkship. */
export function demoClerkshipName(
	scenario: ScheduleScenario,
	name: string,
	namespace = ''
): string {
	return `${name} (Demo ${scenario.tag}${namespace ? ` · ${namespace}` : ''})`;
}

export function demoEmail(scenario: ScheduleScenario, personName: string, namespace = ''): string {
	const local = [slug(personName), scenario.tag.toLowerCase(), namespace].filter(Boolean).join('.');
	return `${local}@${DEMO_EMAIL_DOMAIN}`;
}

export interface BuiltSchedule {
	scheduleId: string;
	name: string;
	start: string;
	end: string;
	counts: Record<string, number>;
}

/**
 * Fill `scheduleId` (which must exist and belong to the demo user) with the
 * scenario, renaming it and setting its dates from `start`.
 */
export async function buildScenario(
	db: Kysely<DB>,
	{
		scheduleId,
		scenario,
		start,
		namespace = ''
	}: { scheduleId: string; scenario: ScheduleScenario; start: string; namespace?: string }
): Promise<BuiltSchedule> {
	const ts = new Date().toISOString();
	const end = addDays(start, scenario.weeks * 7 - 1);
	const counts: Record<string, number> = {};
	const count = (key: string, n = 1) => (counts[key] = (counts[key] ?? 0) + n);
	const link = async (
		table:
			| 'schedule_health_systems'
			| 'schedule_sites'
			| 'schedule_clerkships'
			| 'schedule_preceptors'
			| 'schedule_students'
			| 'schedule_teams',
		column: string,
		entityId: string
	) => {
		await db
			.insertInto(table)
			.values({ id: id(), schedule_id: scheduleId, [column]: entityId, created_at: ts } as never)
			.execute();
	};
	const lookup = (map: Map<string, string>, kind: string, name: string) => {
		const found = map.get(name);
		if (!found) throw new Error(`Demo ${scenario.tag}: unknown ${kind} "${name}"`);
		return found;
	};

	await db
		.updateTable('scheduling_periods')
		.set({ name: scenario.name, start_date: start, end_date: end, updated_at: ts })
		.where('id', '=', scheduleId)
		.execute();

	// Health systems and sites.
	const hs = new Map<string, string>();
	for (const name of scenario.healthSystems) {
		const hsId = id();
		await db
			.insertInto('health_systems')
			.values({ id: hsId, name, created_at: ts, updated_at: ts })
			.execute();
		await link('schedule_health_systems', 'health_system_id', hsId);
		hs.set(name, hsId);
		count('health systems');
	}
	const sites = new Map<string, string>();
	for (const site of scenario.sites) {
		const siteId = id();
		await db
			.insertInto('sites')
			.values({
				id: siteId,
				name: site.name,
				health_system_id: lookup(hs, 'health system', site.healthSystem),
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await link('schedule_sites', 'site_id', siteId);
		sites.set(site.name, siteId);
		count('sites');
	}

	// Clerkships (+ config row, allowed sites).
	const clerkships = new Map<string, string>();
	for (const c of scenario.clerkships) {
		const clerkshipId = id();
		await db
			.insertInto('clerkships')
			.values({
				id: clerkshipId,
				name: demoClerkshipName(scenario, c.name, namespace),
				clerkship_type: c.type,
				required_days: c.requiredDays,
				min_required_days: c.minRequiredDays ?? null,
				scheduling_kind: c.kind,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('clerkship_configurations')
			.values({
				id: id(),
				clerkship_id: clerkshipId,
				...(c.strategy
					? { override_mode: 'override', override_assignment_strategy: c.strategy }
					: {}),
				created_at: ts,
				updated_at: ts
			})
			.execute();
		for (const siteName of c.sites ?? []) {
			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: clerkshipId,
					site_id: lookup(sites, 'site', siteName),
					created_at: ts
				})
				.execute();
		}
		await link('schedule_clerkships', 'clerkship_id', clerkshipId);
		clerkships.set(c.name, clerkshipId);
		count('clerkships');
	}

	// Preceptors (+ sites, capacity, availability) and one team per clerkship.
	const preceptors = new Map<string, string>();
	const availabilityRows: Array<Record<string, unknown>> = [];
	for (const p of scenario.preceptors) {
		const preceptorId = id();
		await db
			.insertInto('preceptors')
			.values({
				id: preceptorId,
				name: p.name,
				email: demoEmail(scenario, p.name, namespace),
				health_system_id: lookup(hs, 'health system', p.healthSystem),
				max_students: p.maxStudents,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		for (const siteName of p.sites) {
			await db
				.insertInto('preceptor_sites')
				.values({
					preceptor_id: preceptorId,
					site_id: lookup(sites, 'site', siteName),
					created_at: ts
				})
				.execute();
		}
		await db
			.insertInto('preceptor_capacity_rules')
			.values({
				id: id(),
				preceptor_id: preceptorId,
				max_students_per_day: p.maxStudents,
				max_students_per_year: 50,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		for (const slot of p.availability) {
			const siteId = lookup(sites, 'site', slot.site ?? p.sites[0]);
			for (let day = 0; day < scenario.weeks * 7; day++) {
				const date = addDays(start, day);
				const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
				if (!(slot.weekdays as number[]).includes(weekday)) continue;
				const week = Math.floor(day / 7);
				if (slot.weeks && (week < slot.weeks[0] || week > slot.weeks[1])) continue;
				availabilityRows.push({
					id: id(),
					preceptor_id: preceptorId,
					site_id: siteId,
					date,
					is_available: 1,
					session: slot.session ?? 'full',
					credit_value: slot.credit ?? 1,
					preference: slot.preference ?? null,
					created_at: ts,
					updated_at: ts
				});
			}
		}
		await link('schedule_preceptors', 'preceptor_id', preceptorId);
		preceptors.set(p.name, preceptorId);
		count('preceptors');
	}
	// Insert availability in chunks (Postgres caps bind parameters per statement).
	for (let i = 0; i < availabilityRows.length; i += 500) {
		await db
			.insertInto('preceptor_availability')
			.values(availabilityRows.slice(i, i + 500) as never)
			.execute();
	}
	count('availability days', availabilityRows.length);

	// Teams: the clerkship's named teams, else one team of everyone who teaches it.
	const teams = scenario.clerkships.flatMap((c) =>
		c.teams
			? c.teams.map((t) => ({ clerkship: c.name, name: t.name, members: t.members }))
			: [
					{
						clerkship: c.name,
						name: `${c.name} team`,
						members: scenario.preceptors
							.filter((p) => p.teaches.includes(c.name))
							.map((p) => p.name)
					}
				]
	);
	for (const team of teams) {
		if (team.members.length === 0) continue;
		const teamId = id();
		await db
			.insertInto('preceptor_teams')
			.values({
				id: teamId,
				clerkship_id: lookup(clerkships, 'clerkship', team.clerkship),
				name: team.name,
				require_same_health_system: 0,
				require_same_site: 0,
				require_same_specialty: 0,
				requires_admin_approval: 0,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		for (const [index, member] of team.members.entries()) {
			await db
				.insertInto('preceptor_team_members')
				.values({
					id: id(),
					team_id: teamId,
					preceptor_id: lookup(preceptors, 'preceptor', member),
					role: index === 0 ? 'lead' : 'member',
					priority: index + 1,
					is_fallback_only: 0,
					created_at: ts
				})
				.execute();
		}
		await link('schedule_teams', 'team_id', teamId);
		count('teams');
	}

	// Electives (+ preceptor pools and sites).
	for (const c of scenario.clerkships) {
		for (const e of c.electives ?? []) {
			const electiveId = id();
			await db
				.insertInto('clerkship_electives')
				.values({
					id: electiveId,
					clerkship_id: lookup(clerkships, 'clerkship', c.name),
					name: e.name,
					specialty: e.name,
					minimum_days: e.minimumDays,
					is_required: e.required ? 1 : 0,
					created_at: ts,
					updated_at: ts
				})
				.execute();
			for (const name of e.preceptors) {
				await db
					.insertInto('elective_preceptors')
					.values({
						id: id(),
						elective_id: electiveId,
						preceptor_id: lookup(preceptors, 'preceptor', name),
						created_at: ts
					})
					.execute();
			}
			for (const name of e.sites) {
				await db
					.insertInto('elective_sites')
					.values({
						id: id(),
						elective_id: electiveId,
						site_id: lookup(sites, 'site', name),
						created_at: ts
					})
					.execute();
			}
			count('electives');
		}
	}

	// Students (+ onboarding, core preceptors).
	for (const s of scenario.students) {
		const studentId = id();
		await db
			.insertInto('students')
			.values({
				id: studentId,
				name: s.name,
				email: demoEmail(scenario, s.name, namespace),
				created_at: ts,
				updated_at: ts
			})
			.execute();
		for (const hsName of s.onboardedAt) {
			await db
				.insertInto('student_health_system_onboarding')
				.values({
					id: id(),
					student_id: studentId,
					health_system_id: lookup(hs, 'health system', hsName),
					is_completed: 1,
					completed_date: ts,
					created_at: ts,
					updated_at: ts
				})
				.execute();
		}
		for (const name of s.corePreceptors ?? []) {
			await db
				.insertInto('student_core_preceptors')
				.values({
					id: id(),
					student_id: studentId,
					preceptor_id: lookup(preceptors, 'preceptor', name),
					created_at: ts
				})
				.execute();
		}
		await link('schedule_students', 'student_id', studentId);
		count('students');
	}

	for (const [a, b] of scenario.mutualExclusions ?? []) {
		const [first, second] = [
			lookup(preceptors, 'preceptor', a),
			lookup(preceptors, 'preceptor', b)
		].sort();
		await db
			.insertInto('preceptor_mutual_exclusions')
			.values({ id: id(), preceptor_a_id: first, preceptor_b_id: second, created_at: ts })
			.execute();
		count('mutual exclusions');
	}

	for (const blackout of scenario.blackouts ?? []) {
		await db
			.insertInto('blackout_dates')
			.values({
				id: id(),
				schedule_id: scheduleId,
				date: addDays(start, blackout.day),
				reason: blackout.reason,
				created_at: ts
			})
			.execute();
		count('blackouts');
	}

	for (const q of scenario.quarters ?? []) {
		await db
			.insertInto('schedule_quarters')
			.values({
				id: id(),
				schedule_id: scheduleId,
				name: q.name,
				start_date: addDays(start, q.startDay),
				end_date: addDays(start, q.endDay),
				created_at: ts
			})
			.execute();
		count('quarters');
	}

	return { scheduleId, name: scenario.name, start, end, counts };
}
