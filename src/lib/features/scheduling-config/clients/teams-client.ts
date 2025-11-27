/**
 * Teams API Client
 *
 * Provides typed API calls for team management.
 * Used by Svelte components to interact with the teams API.
 */

import { createClientLogger } from '$lib/utils/logger.client';

const log = createClientLogger('teams-client');

// ============================================================================
// Types
// ============================================================================

/**
 * Team member in API responses
 */
export interface TeamMember {
	id?: string;
	teamId?: string;
	preceptorId: string;
	preceptorName?: string;
	role?: string;
	priority: number;
	createdAt?: Date;
}

/**
 * Site reference
 */
export interface TeamSite {
	id: string;
	name: string;
}

/**
 * Full team data from API
 */
export interface Team {
	id: string;
	clerkshipId: string;
	clerkshipName?: string;
	name?: string;
	requireSameHealthSystem: boolean;
	requireSameSite: boolean;
	requireSameSpecialty?: boolean;
	requiresAdminApproval?: boolean;
	members: TeamMember[];
	sites?: TeamSite[];
	createdAt?: Date;
	updatedAt?: Date;
}

/**
 * Payload for creating a team
 */
export interface CreateTeamPayload {
	clerkshipId: string;
	name?: string;
	requireSameHealthSystem?: boolean;
	requireSameSite?: boolean;
	siteIds?: string[];
	members: Array<{
		preceptorId: string;
		role?: string;
		priority: number;
	}>;
}

/**
 * Payload for updating a team
 */
export interface UpdateTeamPayload {
	name?: string;
	requireSameHealthSystem?: boolean;
	requireSameSite?: boolean;
	siteIds?: string[];
	members?: Array<{
		preceptorId: string;
		role?: string;
		priority: number;
	}>;
}

/**
 * API error response structure
 */
export interface ApiError {
	message: string;
	code?: string;
	details?: Array<{
		field?: string;
		message: string;
	}>;
}

/**
 * Result type for client operations
 */
export type ClientResult<T> =
	| { success: true; data: T }
	| { success: false; error: ApiError };

// ============================================================================
// Client Implementation
// ============================================================================

const BASE_URL = '/api/preceptors/teams';

/**
 * Parse API response and extract data or error
 */
async function parseResponse<T>(response: Response): Promise<ClientResult<T>> {
	const contentType = response.headers.get('content-type');

	if (!contentType?.includes('application/json')) {
		log.error('Non-JSON response received', {
			status: response.status,
			contentType
		});
		return {
			success: false,
			error: {
				message: `Unexpected response type: ${contentType}`,
				code: 'INVALID_RESPONSE'
			}
		};
	}

	const json = await response.json();

	if (!response.ok) {
		const error: ApiError = json.error || {
			message: json.message || `Request failed with status ${response.status}`,
			code: 'API_ERROR'
		};

		log.warn('API error response', {
			status: response.status,
			error
		});

		return { success: false, error };
	}

	// Extract data from success response wrapper
	const data = json.data !== undefined ? json.data : json;

	log.trace('API success response', { data });

	return { success: true, data };
}

/**
 * Teams API Client
 */
export const teamsClient = {
	/**
	 * List all teams
	 * Optionally filtered by clerkship
	 */
	async list(clerkshipId?: string): Promise<ClientResult<Team[]>> {
		log.debug('Listing teams', { clerkshipId });

		try {
			const url = clerkshipId
				? `${BASE_URL}?clerkshipId=${encodeURIComponent(clerkshipId)}`
				: BASE_URL;

			const response = await fetch(url);
			return await parseResponse<Team[]>(response);
		} catch (error) {
			log.error('Failed to list teams', { error });
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Network error',
					code: 'NETWORK_ERROR'
				}
			};
		}
	},

	/**
	 * Get a single team by ID
	 */
	async get(teamId: string): Promise<ClientResult<Team>> {
		log.debug('Getting team', { teamId });

		try {
			const response = await fetch(`${BASE_URL}/${teamId}`);
			return await parseResponse<Team>(response);
		} catch (error) {
			log.error('Failed to get team', { teamId, error });
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Network error',
					code: 'NETWORK_ERROR'
				}
			};
		}
	},

	/**
	 * Create a new team
	 */
	async create(payload: CreateTeamPayload): Promise<ClientResult<Team>> {
		log.debug('Creating team', { payload });

		try {
			const response = await fetch(BASE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await parseResponse<Team>(response);

			if (result.success) {
				log.info('Team created successfully', { teamId: result.data.id });
			}

			return result;
		} catch (error) {
			log.error('Failed to create team', { payload, error });
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Network error',
					code: 'NETWORK_ERROR'
				}
			};
		}
	},

	/**
	 * Update an existing team
	 */
	async update(teamId: string, payload: UpdateTeamPayload): Promise<ClientResult<Team>> {
		log.debug('Updating team', { teamId, payload });

		try {
			const response = await fetch(`${BASE_URL}/${teamId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await parseResponse<Team>(response);

			if (result.success) {
				log.info('Team updated successfully', { teamId });
			}

			return result;
		} catch (error) {
			log.error('Failed to update team', { teamId, payload, error });
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Network error',
					code: 'NETWORK_ERROR'
				}
			};
		}
	},

	/**
	 * Delete a team
	 */
	async delete(teamId: string): Promise<ClientResult<{ deleted: boolean }>> {
		log.debug('Deleting team', { teamId });

		try {
			const response = await fetch(`${BASE_URL}/${teamId}`, {
				method: 'DELETE'
			});

			const result = await parseResponse<{ deleted: boolean }>(response);

			if (result.success) {
				log.info('Team deleted successfully', { teamId });
			}

			return result;
		} catch (error) {
			log.error('Failed to delete team', { teamId, error });
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Network error',
					code: 'NETWORK_ERROR'
				}
			};
		}
	}
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format API error for display
 */
export function formatApiError(error: ApiError): string {
	if (error.details && error.details.length > 0) {
		const fieldErrors = error.details
			.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
			.join(', ');
		return `Validation failed: ${fieldErrors}`;
	}
	return error.message;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: ApiError): boolean {
	return error.code === 'NETWORK_ERROR';
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: ApiError): boolean {
	return error.code === 'VALIDATION_ERROR' || (error.details !== undefined && error.details.length > 0);
}
