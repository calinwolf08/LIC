/**
 * Does a preceptor fit a proposed day? (planner feedback)
 *
 * One rule set for "is this preceptor available that day, at that site, for that
 * clerkship", shared by the single-assignment validator, the whole-schedule
 * validator and the planner's option filter so all three agree.
 *
 *   - preceptor_unavailable: the day is marked unavailable, or the preceptor has
 *     available days set up but none on that date covering the session. A
 *     preceptor with no available days set up is only restricted by the days
 *     explicitly marked unavailable (nothing else has been said yet), matching how
 *     eligibility treats a preceptor on no team.
 *   - preceptor_wrong_site: the preceptor is available that day, but only at other
 *     sites; or, with no availability that day, the site isn't one of theirs.
 *   - preceptor_not_teaching: the clerkship has teams and the preceptor is on none
 *     of them (the engine's eligibility rule), or the elective has its own
 *     preceptor pool and they aren't in it.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { Violation } from './assignment-validation';
import {
	normalizeSession,
	sessionCovered,
	sessionsOverlap,
	type SessionSlot
} from './session-slots';

export interface AvailabilitySlot {
	session: SessionSlot;
	siteId: string;
}

export interface PreceptorFitData {
	/** preceptorId -> date -> the sessions/sites they are available for. */
	available: Map<string, Map<string, AvailabilitySlot[]>>;
	/** preceptorId -> dates explicitly marked unavailable. */
	unavailable: Map<string, Set<string>>;
	/** Preceptors with at least one available day set up (their calendar is opt-in). */
	withAvailability: Set<string>;
	/** preceptorId -> sites they work at (preceptor_sites). */
	sites: Map<string, Set<string>>;
	/** clerkshipId -> team members, only for clerkships that have a team. */
	clerkshipTeams: Map<string, Set<string>>;
	/** electiveId -> its preceptor pool, only for electives that have one. */
	electivePreceptors: Map<string, Set<string>>;
}

export interface PreceptorFitCandidate {
	preceptorId: string;
	clerkshipId?: string | null;
	electiveId?: string | null;
	siteId?: string | null;
	/** Omit to check only what doesn't depend on the day (teaching, the preceptor's sites). */
	date?: string;
	session?: string | null;
}

export function emptyPreceptorFitData(): PreceptorFitData {
	return {
		available: new Map(),
		unavailable: new Map(),
		withAvailability: new Set(),
		sites: new Map(),
		clerkshipTeams: new Map(),
		electivePreceptors: new Map()
	};
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	let set = map.get(key);
	if (!set) map.set(key, (set = new Set()));
	set.add(value);
}

/** Load what `preceptorFitViolations` needs for the given entities in a few queries. */
export async function loadPreceptorFitData(
	db: Kysely<DB>,
	ids: { preceptorIds: string[]; clerkshipIds?: string[]; electiveIds?: string[] }
): Promise<PreceptorFitData> {
	const data = emptyPreceptorFitData();
	const preceptorIds = [...new Set(ids.preceptorIds)];
	const clerkshipIds = [...new Set(ids.clerkshipIds ?? [])];
	const electiveIds = [...new Set(ids.electiveIds ?? [])];

	const [availability, sites, teams, electives] = await Promise.all([
		preceptorIds.length
			? db
					.selectFrom('preceptor_availability')
					.select(['preceptor_id', 'date', 'is_available', 'session', 'site_id'])
					.where('preceptor_id', 'in', preceptorIds)
					.execute()
			: Promise.resolve([]),
		preceptorIds.length
			? db
					.selectFrom('preceptor_sites')
					.select(['preceptor_id', 'site_id'])
					.where('preceptor_id', 'in', preceptorIds)
					.execute()
			: Promise.resolve([]),
		clerkshipIds.length
			? db
					.selectFrom('preceptor_teams as pt')
					.leftJoin('preceptor_team_members as ptm', 'ptm.team_id', 'pt.id')
					.select(['pt.clerkship_id as clerkship_id', 'ptm.preceptor_id as preceptor_id'])
					.where('pt.clerkship_id', 'in', clerkshipIds)
					.execute()
			: Promise.resolve([]),
		electiveIds.length
			? db
					.selectFrom('elective_preceptors')
					.select(['elective_id', 'preceptor_id'])
					.where('elective_id', 'in', electiveIds)
					.execute()
			: Promise.resolve([])
	]);

	for (const row of availability) {
		if (row.is_available === 0) {
			addTo(data.unavailable, row.preceptor_id, row.date);
			continue;
		}
		data.withAvailability.add(row.preceptor_id);
		let byDate = data.available.get(row.preceptor_id);
		if (!byDate) data.available.set(row.preceptor_id, (byDate = new Map()));
		const slots = byDate.get(row.date) ?? [];
		slots.push({ session: normalizeSession(row.session), siteId: row.site_id });
		byDate.set(row.date, slots);
	}
	for (const row of sites) addTo(data.sites, row.preceptor_id, row.site_id);
	for (const row of teams) {
		// A team with no members still makes the clerkship team-restricted.
		if (!data.clerkshipTeams.has(row.clerkship_id))
			data.clerkshipTeams.set(row.clerkship_id, new Set());
		if (row.preceptor_id) addTo(data.clerkshipTeams, row.clerkship_id, row.preceptor_id);
	}
	for (const row of electives) addTo(data.electivePreceptors, row.elective_id, row.preceptor_id);

	return data;
}

/** The violations a preceptor/day/site/clerkship combination produces. */
export function preceptorFitViolations(
	data: PreceptorFitData,
	candidate: PreceptorFitCandidate
): Violation[] {
	const out: Violation[] = [];
	const { preceptorId, date } = candidate;
	const session = normalizeSession(candidate.session);
	const refs = { preceptor_id: preceptorId };

	const slots = date ? (data.available.get(preceptorId)?.get(date) ?? []) : [];
	const explicitlyOff = date ? (data.unavailable.get(preceptorId)?.has(date) ?? false) : false;
	const restricted = data.withAvailability.has(preceptorId);
	const availableHere =
		!date ||
		(!explicitlyOff &&
			(!restricted ||
				sessionCovered(
					slots.map((s) => s.session),
					session
				)));

	if (!availableHere) {
		const message =
			explicitlyOff || slots.length === 0
				? `Preceptor is not available on ${date}`
				: `Preceptor is not available for the ${session === 'full' ? 'full day' : session.toUpperCase()} on ${date}`;
		out.push({ code: 'preceptor_unavailable', message, entity_refs: refs });
	}

	if (candidate.siteId) {
		const relevant = slots.filter((s) => sessionsOverlap(s.session, session));
		const theirSites = data.sites.get(preceptorId);
		if (relevant.length > 0) {
			if (!relevant.some((s) => s.siteId === candidate.siteId)) {
				out.push({
					code: 'preceptor_wrong_site',
					message: `Preceptor is available at a different site on ${date}`,
					entity_refs: { ...refs, site_id: candidate.siteId }
				});
			}
		} else if (theirSites && theirSites.size > 0 && !theirSites.has(candidate.siteId)) {
			out.push({
				code: 'preceptor_wrong_site',
				message: 'Preceptor does not work at this site',
				entity_refs: { ...refs, site_id: candidate.siteId }
			});
		}
	}

	if (candidate.electiveId && data.electivePreceptors.has(candidate.electiveId)) {
		if (!data.electivePreceptors.get(candidate.electiveId)!.has(preceptorId)) {
			out.push({
				code: 'preceptor_not_teaching',
				message: "Preceptor is not in this elective's preceptor pool",
				entity_refs: refs
			});
		}
	} else if (candidate.clerkshipId && data.clerkshipTeams.has(candidate.clerkshipId)) {
		if (!data.clerkshipTeams.get(candidate.clerkshipId)!.has(preceptorId)) {
			out.push({
				code: 'preceptor_not_teaching',
				message: 'Preceptor is not on a team for this clerkship',
				entity_refs: { ...refs, clerkship_id: candidate.clerkshipId }
			});
		}
	}

	return out;
}
