/**
 * Shared eligibility predicate (design recommendation 03 §6).
 *
 * A single source of truth for "which preceptors may teach a clerkship", used by
 * the scheduling engine (via the strategy context builder), the fallback gap
 * filler and the setup readiness checklist so all three agree (review findings
 * F-19, F-28).
 *
 * The rule:
 *   eligible(preceptor, clerkship) :=
 *        preceptor ∈ schedule.preceptors                      (when a schedule is given)
 *      ∧ ( preceptor ∈ team(clerkship).members
 *          ∨ ( clerkship has no team ∧ preceptor has availability at an allowed site ) )
 *
 * Per-date availability and the allowed-site check for a specific day are applied
 * downstream when building each preceptor's available dates; this predicate
 * answers the coarser "can this preceptor ever serve this clerkship" question and
 * — with a date range — the readiness question "is there a workable preceptor in
 * the window".
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface EligibilityOptions {
	/** When set, eligibility is restricted to this schedule's preceptors (F-02). */
	scheduleId?: string;
	/** Inclusive lower bound on availability dates (readiness checks). */
	startDate?: string;
	/** Inclusive upper bound on availability dates (readiness checks). */
	endDate?: string;
	/**
	 * When true, a team member must also have at least one availability row (within
	 * the date range, if given) at an allowed site to count. Used by the readiness
	 * checklist, which asks whether a clerkship has a genuinely workable preceptor.
	 * The engine leaves this false: team membership alone makes a preceptor a
	 * candidate and per-date availability is filtered later.
	 */
	requireAvailability?: boolean;
}

/** Preceptor ids that are members of any team for the clerkship. */
export async function getTeamMemberPreceptorIds(
	db: Kysely<DB>,
	clerkshipId: string
): Promise<Set<string>> {
	const rows = await db
		.selectFrom('preceptor_team_members')
		.innerJoin('preceptor_teams', 'preceptor_teams.id', 'preceptor_team_members.team_id')
		.select('preceptor_team_members.preceptor_id')
		.where('preceptor_teams.clerkship_id', '=', clerkshipId)
		.execute();
	return new Set(rows.map((r) => r.preceptor_id));
}

/**
 * Allowed site ids for a clerkship. An empty set means the clerkship has no site
 * restriction and every site is allowed.
 */
export async function getClerkshipSiteIds(
	db: Kysely<DB>,
	clerkshipId: string
): Promise<Set<string>> {
	const rows = await db
		.selectFrom('clerkship_sites')
		.select('site_id')
		.where('clerkship_id', '=', clerkshipId)
		.execute();
	return new Set(rows.map((r) => r.site_id));
}

/** Preceptor ids in a schedule (undefined scheduleId ⇒ no restriction, null returned). */
async function getSchedulePreceptorIds(db: Kysely<DB>, scheduleId: string): Promise<Set<string>> {
	const rows = await db
		.selectFrom('schedule_preceptors')
		.select('preceptor_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	return new Set(rows.map((r) => r.preceptor_id));
}

/**
 * Preceptor ids with at least one `is_available = 1` row at an allowed site,
 * optionally within a date range.
 */
async function getPreceptorIdsWithAvailability(
	db: Kysely<DB>,
	allowedSiteIds: Set<string>,
	opts: { startDate?: string; endDate?: string; restrictTo?: Set<string> } = {}
): Promise<Set<string>> {
	let query = db
		.selectFrom('preceptor_availability')
		.select('preceptor_id')
		.where('is_available', '=', 1)
		.distinct();

	if (allowedSiteIds.size > 0) {
		query = query.where('site_id', 'in', [...allowedSiteIds]);
	}
	if (opts.startDate) {
		query = query.where('date', '>=', opts.startDate);
	}
	if (opts.endDate) {
		query = query.where('date', '<=', opts.endDate);
	}
	if (opts.restrictTo) {
		if (opts.restrictTo.size === 0) return new Set();
		query = query.where('preceptor_id', 'in', [...opts.restrictTo]);
	}

	const rows = await query.execute();
	return new Set(rows.map((r) => r.preceptor_id));
}

/**
 * Compute the set of preceptor ids eligible to teach a clerkship.
 *
 * - If the clerkship has ≥1 team, team members define eligibility. With
 *   `requireAvailability`, a member must also have availability at an allowed site.
 * - Otherwise (no team for the clerkship), any preceptor with availability at an
 *   allowed site is eligible — so a Stage 1 roster that never configured teams
 *   still generates instead of returning "No preceptors available" (F-19).
 * - Always intersected with the schedule's preceptors when `scheduleId` is set.
 */
export async function getEligiblePreceptorIds(
	db: Kysely<DB>,
	clerkshipId: string,
	opts: EligibilityOptions = {}
): Promise<Set<string>> {
	const scheduleMembers = opts.scheduleId
		? await getSchedulePreceptorIds(db, opts.scheduleId)
		: null;

	const teamMembers = await getTeamMemberPreceptorIds(db, clerkshipId);
	const allowedSites = await getClerkshipSiteIds(db, clerkshipId);

	let eligible: Set<string>;
	if (teamMembers.size > 0) {
		eligible = teamMembers;
		if (opts.requireAvailability) {
			const withAvail = await getPreceptorIdsWithAvailability(db, allowedSites, {
				startDate: opts.startDate,
				endDate: opts.endDate,
				restrictTo: teamMembers
			});
			eligible = withAvail;
		}
	} else {
		// No team for this clerkship: fall back to preceptors with availability at an
		// allowed site (03 §6). Availability is required here regardless of the flag —
		// there is no team roster to fall back on.
		eligible = await getPreceptorIdsWithAvailability(db, allowedSites, {
			startDate: opts.startDate,
			endDate: opts.endDate
		});
	}

	if (scheduleMembers) {
		eligible = new Set([...eligible].filter((id) => scheduleMembers.has(id)));
	}

	return eligible;
}

/**
 * Readiness helper: does the clerkship have at least one workable preceptor —
 * a team member (or, with no team, any preceptor) that has availability at an
 * allowed site within the given date range, restricted to the schedule?
 */
export async function clerkshipHasWorkablePreceptor(
	db: Kysely<DB>,
	clerkshipId: string,
	opts: { scheduleId?: string; startDate?: string; endDate?: string } = {}
): Promise<boolean> {
	const eligible = await getEligiblePreceptorIds(db, clerkshipId, {
		...opts,
		requireAvailability: true
	});
	return eligible.size > 0;
}

export interface ServeableClerkship {
	id: string;
	name: string;
}

export interface TeamServeability {
	/** Clerkships EVERY member can serve (availability at an allowed site). */
	serveable: ServeableClerkship[];
	/**
	 * False only when the team has ≥2 members who share no serveable clerkship —
	 * the "members don't overlap" case (client feedback G3/G4). A 0- or 1-member
	 * team always overlaps trivially.
	 */
	overlap: boolean;
}

/**
 * Infer the clerkships a team can serve from its members' own eligibility
 * (client feedback G3): a clerkship is serveable when EVERY member has
 * availability at one of that clerkship's allowed sites. When members share no
 * such clerkship (e.g. a family-medicine preceptor and a surgery preceptor),
 * `overlap` is false so the UI can warn and ask for an explicit override (G4).
 *
 * Availability-based (not team-membership-based) on purpose: membership would be
 * circular — a member is trivially "eligible" for their own team's clerkship.
 */
export async function getTeamServeableClerkships(
	db: Kysely<DB>,
	scheduleId: string,
	preceptorIds: string[]
): Promise<TeamServeability> {
	const members = [...new Set(preceptorIds)];
	if (members.length === 0) return { serveable: [], overlap: true };

	const clerkships = await db
		.selectFrom('schedule_clerkships')
		.innerJoin('clerkships', 'clerkships.id', 'schedule_clerkships.clerkship_id')
		.select(['clerkships.id as id', 'clerkships.name as name'])
		.where('schedule_clerkships.schedule_id', '=', scheduleId)
		.execute();

	const memberSet = new Set(members);
	const serveable: ServeableClerkship[] = [];
	for (const clerkship of clerkships) {
		const allowed = await getClerkshipSiteIds(db, clerkship.id as string);
		const withAvail = await getPreceptorIdsWithAvailability(db, allowed, { restrictTo: memberSet });
		if (members.every((m) => withAvail.has(m))) {
			serveable.push({ id: clerkship.id as string, name: clerkship.name });
		}
	}

	return { serveable, overlap: members.length < 2 || serveable.length > 0 };
}
