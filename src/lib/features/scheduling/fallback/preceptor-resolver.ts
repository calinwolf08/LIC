/**
 * Fallback Preceptor Resolver
 *
 * Finds available preceptors for fallback assignment in priority order:
 * 1. Other preceptors on the SAME team
 * 2. Preceptors on teams within the SAME health system
 * 3. Preceptors on ANY team for the clerkship (if cross-system allowed)
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

/**
 * Fallback preceptor with tier information
 */
export interface FallbackPreceptor {
	id: string;
	name: string;
	healthSystemId: string | null;
	teamId: string;
	teamName: string | null;
	priority: number; // Priority within team
	tier: 1 | 2 | 3; // Fallback tier
}

/**
 * Team information for fallback resolution
 */
interface TeamInfo {
	id: string;
	name: string | null;
	healthSystemId: string | null; // Derived from team members' preceptors
}

/**
 * Fallback Preceptor Resolver
 *
 * Resolves preceptors available for fallback assignment, ordered by proximity
 * to the original team assignment.
 */
export class FallbackPreceptorResolver {
	constructor(private db: Kysely<DB>) {}

	/**
	 * Get ordered list of fallback preceptors for a clerkship
	 *
	 * @param clerkshipId - The clerkship to find fallback preceptors for
	 * @param primaryTeamId - The team that was originally attempted (if any)
	 * @param primaryHealthSystemId - The health system of the primary team
	 * @param allowCrossSystem - Whether to include teams from other health systems
	 * @param excludePreceptorIds - Preceptor IDs to exclude (already assigned)
	 */
	async getOrderedFallbackPreceptors(
		clerkshipId: string,
		primaryTeamId: string | null,
		primaryHealthSystemId: string | null,
		allowCrossSystem: boolean,
		excludePreceptorIds: Set<string> = new Set()
	): Promise<FallbackPreceptor[]> {
		// Get all teams for this clerkship with their members
		const teamsWithMembers = await this.getTeamsWithMembers(clerkshipId);

		if (teamsWithMembers.length === 0) {
			return [];
		}

		const result: FallbackPreceptor[] = [];

		// Tier 1: Other preceptors on the same team
		if (primaryTeamId) {
			const sameTeam = teamsWithMembers.find((t) => t.id === primaryTeamId);
			if (sameTeam) {
				for (const member of sameTeam.members) {
					if (!excludePreceptorIds.has(member.preceptorId)) {
						result.push({
							id: member.preceptorId,
							name: member.preceptorName,
							healthSystemId: member.healthSystemId,
							teamId: sameTeam.id,
							teamName: sameTeam.name,
							priority: member.priority,
							tier: 1,
						});
					}
				}
			}
		}

		// Tier 2: Preceptors on other teams in the same health system
		if (primaryHealthSystemId) {
			for (const team of teamsWithMembers) {
				// Skip the primary team (already handled in Tier 1)
				if (team.id === primaryTeamId) continue;

				// Check if team is in the same health system
				// A team is considered in a health system if any of its members are
				const teamHealthSystems = new Set(
					team.members.map((m) => m.healthSystemId).filter(Boolean)
				);

				if (teamHealthSystems.has(primaryHealthSystemId)) {
					for (const member of team.members) {
						// Only include preceptors from the same health system
						if (
							member.healthSystemId === primaryHealthSystemId &&
							!excludePreceptorIds.has(member.preceptorId) &&
							!result.some((r) => r.id === member.preceptorId)
						) {
							result.push({
								id: member.preceptorId,
								name: member.preceptorName,
								healthSystemId: member.healthSystemId,
								teamId: team.id,
								teamName: team.name,
								priority: member.priority,
								tier: 2,
							});
						}
					}
				}
			}
		}

		// Tier 3: Preceptors on any team for this clerkship (cross-system)
		if (allowCrossSystem) {
			for (const team of teamsWithMembers) {
				for (const member of team.members) {
					// Skip if already included or excluded
					if (
						excludePreceptorIds.has(member.preceptorId) ||
						result.some((r) => r.id === member.preceptorId)
					) {
						continue;
					}

					result.push({
						id: member.preceptorId,
						name: member.preceptorName,
						healthSystemId: member.healthSystemId,
						teamId: team.id,
						teamName: team.name,
						priority: member.priority,
						tier: 3,
					});
				}
			}
		}

		return result;
	}

	/**
	 * Get all teams for a clerkship with their members
	 */
	private async getTeamsWithMembers(clerkshipId: string): Promise<
		Array<{
			id: string;
			name: string | null;
			members: Array<{
				preceptorId: string;
				preceptorName: string;
				healthSystemId: string | null;
				priority: number;
			}>;
		}>
	> {
		// Get all teams for this clerkship
		const teams = await this.db
			.selectFrom('preceptor_teams')
			.select(['id', 'name'])
			.where('clerkship_id', '=', clerkshipId)
			.execute();

		const result: Array<{
			id: string;
			name: string | null;
			members: Array<{
				preceptorId: string;
				preceptorName: string;
				healthSystemId: string | null;
				priority: number;
			}>;
		}> = [];

		for (const team of teams) {
			if (!team.id) continue;

			// Get team members with preceptor info
			const members = await this.db
				.selectFrom('preceptor_team_members')
				.innerJoin('preceptors', 'preceptors.id', 'preceptor_team_members.preceptor_id')
				.select([
					'preceptor_team_members.preceptor_id',
					'preceptor_team_members.priority',
					'preceptors.name',
					'preceptors.health_system_id',
				])
				.where('preceptor_team_members.team_id', '=', team.id)
				.orderBy('preceptor_team_members.priority', 'asc')
				.execute();

			result.push({
				id: team.id,
				name: team.name,
				members: members.map((m) => ({
					preceptorId: m.preceptor_id,
					preceptorName: m.name,
					healthSystemId: m.health_system_id,
					priority: m.priority,
				})),
			});
		}

		return result;
	}

	/**
	 * Get the primary health system for a team
	 * Uses the health system of the highest priority member
	 */
	async getTeamHealthSystem(teamId: string): Promise<string | null> {
		const member = await this.db
			.selectFrom('preceptor_team_members')
			.innerJoin('preceptors', 'preceptors.id', 'preceptor_team_members.preceptor_id')
			.select('preceptors.health_system_id')
			.where('preceptor_team_members.team_id', '=', teamId)
			.orderBy('preceptor_team_members.priority', 'asc')
			.executeTakeFirst();

		return member?.health_system_id ?? null;
	}

	/**
	 * Get all teams for a clerkship
	 */
	async getTeamsForClerkship(clerkshipId: string): Promise<TeamInfo[]> {
		const teams = await this.db
			.selectFrom('preceptor_teams')
			.select(['id', 'name'])
			.where('clerkship_id', '=', clerkshipId)
			.execute();

		const result: TeamInfo[] = [];

		for (const team of teams) {
			if (!team.id) continue;

			const healthSystemId = await this.getTeamHealthSystem(team.id);
			result.push({
				id: team.id,
				name: team.name,
				healthSystemId,
			});
		}

		return result;
	}
}
