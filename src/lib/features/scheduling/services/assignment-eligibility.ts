/**
 * Assignment eligibility (Step 17).
 *
 * Answers "given what has been picked so far, which clerkships / preceptors /
 * sites make sense?" for the unified assignment dialog.
 *
 * The lists are **annotated, never truncated**: an option that does not fit the
 * current selection comes back with `eligible: false` and a human-readable
 * reason. Hiding options makes the UI feel broken ("where did Dr. Lee go?"),
 * so we mark instead of hide.
 *
 * Relations used:
 *   preceptor ↔ clerkship  via `preceptor_team_members` → `preceptor_teams.clerkship_id`
 *   preceptor ↔ site       via `preceptor_sites`
 *   clerkship ↔ site       via `clerkship_sites` (empty = no restriction)
 *
 * Everything is restricted to entities associated with the active schedule.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface EligibilitySelection {
	studentId?: string | null;
	clerkshipId?: string | null;
	preceptorId?: string | null;
	siteId?: string | null;
}

export interface EligibilityOption {
	id: string;
	name: string;
	eligible: boolean;
	/** Why this option does not fit the current selection. Present iff `!eligible`. */
	reason?: string;
}

export interface EligibleOptions {
	clerkships: EligibilityOption[];
	preceptors: EligibilityOption[];
	sites: EligibilityOption[];
}

/**
 * Compute the annotated option lists for any partial selection.
 *
 * An empty selection returns every in-schedule entity as eligible.
 */
export async function getEligibleOptions(
	db: Kysely<DB>,
	scheduleId: string,
	selection: EligibilitySelection = {}
): Promise<EligibleOptions> {
	const [rawClerkships, rawPreceptors, rawSites] = await Promise.all([
		db
			.selectFrom('clerkships')
			.innerJoin('schedule_clerkships', 'schedule_clerkships.clerkship_id', 'clerkships.id')
			.select(['clerkships.id as id', 'clerkships.name as name'])
			.where('schedule_clerkships.schedule_id', '=', scheduleId)
			.orderBy('clerkships.name', 'asc')
			.execute(),
		db
			.selectFrom('preceptors')
			.innerJoin('schedule_preceptors', 'schedule_preceptors.preceptor_id', 'preceptors.id')
			.select(['preceptors.id as id', 'preceptors.name as name'])
			.where('schedule_preceptors.schedule_id', '=', scheduleId)
			.orderBy('preceptors.name', 'asc')
			.execute(),
		db
			.selectFrom('sites')
			.innerJoin('schedule_sites', 'schedule_sites.site_id', 'sites.id')
			.select(['sites.id as id', 'sites.name as name'])
			.where('schedule_sites.schedule_id', '=', scheduleId)
			.orderBy('sites.name', 'asc')
			.execute()
	]);

	// `id` is nullable in the generated types; drop any row without one.
	const clerkshipRows = named(rawClerkships);
	const preceptorRows = named(rawPreceptors);
	const siteRows = named(rawSites);

	const clerkshipIds = clerkshipRows.map((r) => r.id);
	const preceptorIds = preceptorRows.map((r) => r.id);

	// preceptor -> clerkships they can teach (through their teams)
	const teamRows =
		preceptorIds.length > 0
			? await db
					.selectFrom('preceptor_team_members as ptm')
					.innerJoin('preceptor_teams as pt', 'pt.id', 'ptm.team_id')
					.select(['ptm.preceptor_id as preceptor_id', 'pt.clerkship_id as clerkship_id'])
					.where('ptm.preceptor_id', 'in', preceptorIds)
					.execute()
			: [];
	const preceptorClerkships = groupToSet(teamRows, 'preceptor_id', 'clerkship_id');
	const clerkshipPreceptors = groupToSet(teamRows, 'clerkship_id', 'preceptor_id');

	// preceptor -> sites
	const preceptorSiteRows =
		preceptorIds.length > 0
			? await db
					.selectFrom('preceptor_sites')
					.select(['preceptor_id', 'site_id'])
					.where('preceptor_id', 'in', preceptorIds)
					.execute()
			: [];
	const preceptorSites = groupToSet(preceptorSiteRows, 'preceptor_id', 'site_id');
	const sitePreceptors = groupToSet(preceptorSiteRows, 'site_id', 'preceptor_id');

	// clerkship -> allowed sites (absent/empty = every site allowed)
	const clerkshipSiteRows =
		clerkshipIds.length > 0
			? await db
					.selectFrom('clerkship_sites')
					.select(['clerkship_id', 'site_id'])
					.where('clerkship_id', 'in', clerkshipIds)
					.execute()
			: [];
	const clerkshipSites = groupToSet(clerkshipSiteRows, 'clerkship_id', 'site_id');
	const siteClerkships = groupToSet(clerkshipSiteRows, 'site_id', 'clerkship_id');

	const nameOf = (rows: { id: string; name: string }[], id: string | null | undefined) =>
		rows.find((r) => r.id === id)?.name;

	const selectedClerkship = selection.clerkshipId ?? null;
	const selectedPreceptor = selection.preceptorId ?? null;
	const selectedSite = selection.siteId ?? null;

	const clerkshipName = nameOf(clerkshipRows, selectedClerkship);
	const preceptorName = nameOf(preceptorRows, selectedPreceptor);
	const siteName = nameOf(siteRows, selectedSite);

	const clerkships: EligibilityOption[] = clerkshipRows.map((c) => {
		if (selectedPreceptor && !preceptorClerkships.get(selectedPreceptor)?.has(c.id)) {
			return mark(c, `${preceptorName ?? 'This preceptor'} is not on a team for ${c.name}`);
		}
		if (
			selectedSite &&
			restricts(clerkshipSites, c.id) &&
			!clerkshipSites.get(c.id)!.has(selectedSite)
		) {
			return mark(c, `Not offered at ${siteName ?? 'the selected site'}`);
		}
		return ok(c);
	});

	const preceptors: EligibilityOption[] = preceptorRows.map((p) => {
		if (selectedClerkship && !clerkshipPreceptors.get(selectedClerkship)?.has(p.id)) {
			return mark(p, `Not on a team for ${clerkshipName ?? 'the selected clerkship'}`);
		}
		if (selectedSite && !preceptorSites.get(p.id)?.has(selectedSite)) {
			return mark(p, `Does not work at ${siteName ?? 'the selected site'}`);
		}
		return ok(p);
	});

	const sites: EligibilityOption[] = siteRows.map((s) => {
		if (
			selectedClerkship &&
			restricts(clerkshipSites, selectedClerkship) &&
			!siteClerkships.get(s.id)?.has(selectedClerkship)
		) {
			return mark(s, `Not an approved site for ${clerkshipName ?? 'the selected clerkship'}`);
		}
		if (selectedPreceptor && !sitePreceptors.get(s.id)?.has(selectedPreceptor)) {
			return mark(s, `${preceptorName ?? 'The selected preceptor'} does not work here`);
		}
		return ok(s);
	});

	return { clerkships, preceptors, sites };
}

function ok(row: { id: string; name: string }): EligibilityOption {
	return { id: row.id, name: row.name, eligible: true };
}

function mark(row: { id: string; name: string }, reason: string): EligibilityOption {
	return { id: row.id, name: row.name, eligible: false, reason };
}

/** A clerkship with no `clerkship_sites` rows accepts any site. */
function restricts(map: Map<string, Set<string>>, key: string): boolean {
	const set = map.get(key);
	return !!set && set.size > 0;
}

function named(rows: { id: string | null; name: string }[]): { id: string; name: string }[] {
	return rows.filter((r): r is { id: string; name: string } => !!r.id);
}

function groupToSet<K extends string, V extends string, R extends Record<K | V, string | null>>(
	rows: R[],
	keyField: K,
	valueField: V
): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const row of rows) {
		const key = row[keyField];
		const value = row[valueField];
		if (!key || !value) continue;
		let set = map.get(key);
		if (!set) {
			set = new Set<string>();
			map.set(key, set);
		}
		set.add(value);
	}
	return map;
}
