/**
 * Declarative world-builder for flow-based journeys.
 *
 * A "world" is a realistic cohort — many students, block + scattered + elective
 * clerkships, preceptors with varied sessions / capacity / availability, mutual
 * exclusions, blackouts and quarters — provisioned into a fresh, active sandbox
 * schedule. Journeys describe a world once (see `e2e/worlds/catalog.ts`) and then
 * drive long UI sequences against it, asserting after every action.
 *
 * Everything is created through the real create APIs where one exists (so entities
 * auto-attach to the active sandbox exactly as a coordinator's would), and through
 * direct inserts only for join rows the API doesn't expose (availability sessions,
 * mutual exclusions, onboarding, blackouts scoped to the sandbox).
 *
 * Date handling: availability/blackout/quarter entries take either an absolute
 * `date: 'YYYY-MM-DD'` or a `day: <offset-from-the-world-anchor>` (the world anchor
 * is a Monday safely in the future, so weeks line up for block/scatter scenarios).
 */

import { apiOf, createSandboxSchedule, type Page, type Sandbox } from '../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

// ---- date helpers (exported for journeys) ----------------------------------

export function fromTodayUTC(offsetDays: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() + offsetDays);
	return d.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
export function dow(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
}
export function isWeekday(date: string): boolean {
	const d = dow(date);
	return d !== 0 && d !== 6;
}
/** The first Monday at least `atLeast` days from today. */
export function mondayAtLeast(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromTodayUTC(n);
		if (dow(d) === 1) return d;
		n++;
	}
}
/** Every weekday (Mon–Fri) in [start, end] inclusive. */
export function weekdaysBetween(start: string, end: string): string[] {
	const out: string[] = [];
	let cur = start;
	while (cur <= end) {
		if (isWeekday(cur)) out.push(cur);
		cur = addDays(cur, 1);
	}
	return out;
}

// ---- spec types ------------------------------------------------------------

export type Session = 'full' | 'am' | 'pm';

export interface AvailabilitySpec {
	/** Absolute date, or `day` offset from the world anchor Monday. */
	date?: string;
	day?: number;
	/** Site name this slot is at (defaults to the preceptor's first site). */
	site?: string;
	session?: Session;
	credit?: number;
	preference?: 'preferred' | 'in_a_pinch';
	notes?: string;
}

export interface ElectiveSpec {
	name: string;
	minimumDays: number;
	required?: boolean;
}

export interface ClerkshipSpec {
	name: string;
	type?: 'inpatient' | 'outpatient';
	requiredDays: number;
	minRequiredDays?: number;
	kind?: 'block' | 'scattered';
	/** Force this clerkship's assignment strategy (clerkship config override). */
	strategy?: 'continuous_single' | 'daily_rotation' | 'block_based' | 'team_continuity';
	/** Site names this clerkship is allowed at (omit = unrestricted). */
	sites?: string[];
	electives?: ElectiveSpec[];
}

export interface PreceptorSpec {
	name: string;
	email?: string;
	/** Health system name (defaults to the HS of its first site). */
	healthSystem?: string;
	sites: string[];
	maxStudents?: number;
	/** Clerkship names this preceptor teaches → creates/joins a team (eligibility). */
	teaches?: string[];
	availability?: AvailabilitySpec[];
}

export interface StudentSpec {
	name: string;
	email?: string;
	/** Health system names the student is onboarded at. */
	onboardedAt?: string[];
	/** Preceptor names that are this student's "core" preceptors (F5). */
	corePreceptors?: string[];
}

export interface WorldSpec {
	name?: string;
	/** Schedule start; defaults to a future Monday. */
	start?: string;
	/** Schedule end; defaults to ~8 weeks after start. */
	end?: string;
	healthSystems: string[];
	sites: Array<{ name: string; healthSystem: string }>;
	clerkships: ClerkshipSpec[];
	preceptors: PreceptorSpec[];
	students: StudentSpec[];
	mutualExclusions?: Array<[string, string]>;
	blackouts?: Array<{ date?: string; day?: number; reason?: string }>;
	quarters?: Array<{ name: string; start?: string; end?: string; startDay?: number; endDay?: number }>;
}

export interface World {
	spec: WorldSpec;
	sandbox: Sandbox;
	scheduleId: string;
	/** The future Monday all `day` offsets are relative to. */
	anchor: string;
	start: string;
	end: string;
	api: ReturnType<typeof apiOf>;
	db: Kysely<DB>;
	ids: {
		hs: Record<string, string>;
		site: Record<string, string>;
		clerkship: Record<string, string>;
		preceptor: Record<string, string>;
		student: Record<string, string>;
		elective: Record<string, string>;
	};
	/** Display names as they appear in the UI (hs/site/clerkship/elective are
	 * stamped for global uniqueness; preceptor/student use their spec name). Use
	 * these when selecting options by label in a dropdown. */
	labels: {
		hs: Record<string, string>;
		site: Record<string, string>;
		clerkship: Record<string, string>;
		preceptor: Record<string, string>;
		student: Record<string, string>;
		elective: Record<string, string>;
	};
	/** Resolve a spec date (absolute `date` or `day` offset) to YYYY-MM-DD. */
	date(spec: { date?: string; day?: number }): string;
}

// ---- builder ---------------------------------------------------------------

/**
 * Provision a world into a fresh active sandbox. Register `world.sandbox` with the
 * test's `sandbox` fixture so it is torn down.
 */
export async function buildWorld(page: Page, db: Kysely<DB>, spec: WorldSpec): Promise<World> {
	const api = apiOf(page);
	const stamp = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
	const anchor = spec.start ?? mondayAtLeast(7);
	const start = spec.start ?? anchor;
	const end = spec.end ?? addDays(start, 55);

	const sandbox = await createSandboxSchedule(page, {
		name: spec.name ?? `World ${stamp}`,
		start,
		end
	});
	const scheduleId = sandbox.id;
	const resolveDate = (d: { date?: string; day?: number }): string =>
		d.date ?? addDays(anchor, d.day ?? 0);

	const ids: World['ids'] = {
		hs: {},
		site: {},
		clerkship: {},
		preceptor: {},
		student: {},
		elective: {}
	};
	const labels: World['labels'] = {
		hs: {},
		site: {},
		clerkship: {},
		preceptor: {},
		student: {},
		elective: {}
	};

	// Health systems
	for (const name of spec.healthSystems) {
		const display = `${name} ${stamp}`;
		const r = await api.post<{ id: string }>('/api/health-systems', { name: display });
		if (!r.ok || !r.data?.id) throw new Error(`world: health system ${name} failed (${r.status})`);
		ids.hs[name] = r.data.id;
		labels.hs[name] = display;
	}

	// Sites
	for (const s of spec.sites) {
		const hsId = ids.hs[s.healthSystem];
		if (!hsId) throw new Error(`world: site ${s.name} references unknown HS ${s.healthSystem}`);
		const display = `${s.name} ${stamp}`;
		const r = await api.post<{ id: string }>('/api/sites', {
			name: display,
			health_system_id: hsId
		});
		if (!r.ok || !r.data?.id) throw new Error(`world: site ${s.name} failed (${r.status})`);
		ids.site[s.name] = r.data.id;
		labels.site[s.name] = display;
	}

	// Clerkships (+ clerkship_sites + electives)
	const ts = new Date().toISOString();
	for (const c of spec.clerkships) {
		const display = `${c.name} ${stamp}`;
		const r = await api.post<{ id: string }>('/api/clerkships', {
			name: display,
			required_days: c.requiredDays,
			clerkship_type: c.type ?? 'outpatient',
			...(c.minRequiredDays != null ? { min_required_days: c.minRequiredDays } : {}),
			...(c.kind ? { scheduling_kind: c.kind } : {})
		});
		if (!r.ok || !r.data?.id) throw new Error(`world: clerkship ${c.name} failed (${r.status})`);
		ids.clerkship[c.name] = r.data.id;
		labels.clerkship[c.name] = display;

		if (c.sites?.length) {
			await db
				.insertInto('clerkship_sites')
				.values(c.sites.map((siteName) => ({
					clerkship_id: r.data!.id,
					site_id: siteId(ids, siteName),
					created_at: ts
				})))
				.execute();
		}
		if (c.strategy) {
			// The clerkship-create API inserts a config row in `inherit` mode (global
			// defaults win). Flip it to `override` so the engine honors the strategy.
			await db
				.updateTable('clerkship_configurations')
				.set({ override_mode: 'override', override_assignment_strategy: c.strategy })
				.where('clerkship_id', '=', r.data.id)
				.execute();
		}
		for (const e of c.electives ?? []) {
			const display = `${e.name} ${stamp}`;
			const er = await api.post<{ id: string }>(
				`/api/scheduling-config/electives?clerkshipId=${r.data.id}`,
				{ name: display, minimumDays: e.minimumDays, isRequired: e.required ?? false }
			);
			if (!er.ok || !er.data?.id) throw new Error(`world: elective ${e.name} failed (${er.status})`);
			ids.elective[e.name] = er.data.id;
			labels.elective[e.name] = display;
		}
	}

	// Preceptors (+ teams for `teaches`)
	const teamByClerkship = new Map<string, string>();
	for (const p of spec.preceptors) {
		const hsName = p.healthSystem ?? siteHs(spec, p.sites[0]);
		const hsId = ids.hs[hsName];
		const r = await api.post<{ id: string }>('/api/preceptors', {
			name: p.name,
			email: p.email ?? `${slug(p.name)}_${stamp}@x.com`,
			max_students: p.maxStudents ?? 5,
			...(hsId ? { health_system_id: hsId } : {}),
			site_ids: p.sites.map((s) => siteId(ids, s))
		});
		if (!r.ok || !r.data?.id) throw new Error(`world: preceptor ${p.name} failed (${r.status})`);
		ids.preceptor[p.name] = r.data.id;
		labels.preceptor[p.name] = p.name;

		for (const clerkName of p.teaches ?? []) {
			let teamId = teamByClerkship.get(clerkName);
			if (!teamId) {
				teamId = crypto.randomUUID();
				await db
					.insertInto('preceptor_teams')
					.values({
						id: teamId,
						clerkship_id: clerkshipId(ids, clerkName),
						name: `${clerkName} team`,
						require_same_health_system: 0,
						created_at: ts,
						updated_at: ts
					})
					.execute();
				teamByClerkship.set(clerkName, teamId);
			}
			await db
				.insertInto('preceptor_team_members')
				.values({ id: crypto.randomUUID(), team_id: teamId, preceptor_id: r.data.id, created_at: ts })
				.execute();
		}
	}

	// Students (+ onboarding + core preceptors)
	for (const s of spec.students) {
		const r = await api.post<{ id: string }>('/api/students', {
			name: s.name,
			email: s.email ?? `${slug(s.name)}_${stamp}@x.com`
		});
		if (!r.ok || !r.data?.id) throw new Error(`world: student ${s.name} failed (${r.status})`);
		ids.student[s.name] = r.data.id;
		labels.student[s.name] = s.name;

		for (const hsName of s.onboardedAt ?? []) {
			await db
				.insertInto('student_health_system_onboarding')
				.values({
					id: crypto.randomUUID(),
					student_id: r.data.id,
					health_system_id: hsId(ids, hsName),
					is_completed: 1,
					created_at: ts,
					updated_at: ts
				})
				.execute();
		}
		for (const precName of s.corePreceptors ?? []) {
			await api
				.post(`/api/students/${r.data.id}/core-preceptors`, { preceptorId: preceptorId(ids, precName) })
				.catch(() => {});
		}
	}

	// Availability (batched)
	const availRows: Array<Record<string, unknown>> = [];
	for (const p of spec.preceptors) {
		for (const a of p.availability ?? []) {
			availRows.push({
				id: crypto.randomUUID(),
				preceptor_id: preceptorId(ids, p.name),
				site_id: siteId(ids, a.site ?? p.sites[0]),
				date: resolveDate(a),
				is_available: 1,
				session: a.session ?? 'full',
				credit_value: a.credit ?? 1,
				preference: a.preference ?? null,
				notes: a.notes ?? null,
				created_at: ts,
				updated_at: ts
			});
		}
	}
	if (availRows.length) await db.insertInto('preceptor_availability').values(availRows).execute();

	// Mutual exclusions (canonical pair order)
	for (const [a, b] of spec.mutualExclusions ?? []) {
		const [x, y] = [preceptorId(ids, a), preceptorId(ids, b)].sort();
		await db
			.insertInto('preceptor_mutual_exclusions')
			.values({ id: crypto.randomUUID(), preceptor_a_id: x, preceptor_b_id: y, created_at: ts })
			.execute();
	}

	// Blackouts (scoped to this schedule)
	for (const b of spec.blackouts ?? []) {
		await db
			.insertInto('blackout_dates')
			.values({
				id: crypto.randomUUID(),
				schedule_id: scheduleId,
				date: resolveDate(b),
				reason: b.reason ?? 'World blackout',
				created_at: ts
			})
			.execute();
	}

	// Quarters
	for (const q of spec.quarters ?? []) {
		await db
			.insertInto('schedule_quarters')
			.values({
				id: crypto.randomUUID(),
				schedule_id: scheduleId,
				name: q.name,
				start_date: q.start ?? addDays(anchor, q.startDay ?? 0),
				end_date: q.end ?? addDays(anchor, q.endDay ?? 0),
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}

	return { spec, sandbox, scheduleId, anchor, start, end, api, db, ids, labels, date: resolveDate };
}

// ---- small resolvers -------------------------------------------------------

function slug(name: string): string {
	return name.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'x';
}
function siteId(ids: World['ids'], name: string): string {
	const id = ids.site[name];
	if (!id) throw new Error(`world: unknown site ${name}`);
	return id;
}
function clerkshipId(ids: World['ids'], name: string): string {
	const id = ids.clerkship[name];
	if (!id) throw new Error(`world: unknown clerkship ${name}`);
	return id;
}
function preceptorId(ids: World['ids'], name: string): string {
	const id = ids.preceptor[name];
	if (!id) throw new Error(`world: unknown preceptor ${name}`);
	return id;
}
function hsId(ids: World['ids'], name: string): string {
	const id = ids.hs[name];
	if (!id) throw new Error(`world: unknown health system ${name}`);
	return id;
}
function siteHs(spec: WorldSpec, siteName: string): string {
	const s = spec.sites.find((x) => x.name === siteName);
	if (!s) throw new Error(`world: unknown site ${siteName}`);
	return s.healthSystem;
}
