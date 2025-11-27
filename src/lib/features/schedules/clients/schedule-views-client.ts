/**
 * Schedule Views API Client
 *
 * Provides typed API calls for schedule viewing.
 * Used by Svelte components to fetch student schedules, preceptor schedules,
 * and schedule summaries.
 */

import { createClientLogger } from '$lib/utils/logger.client';
import type {
	StudentSchedule,
	PreceptorSchedule,
	ScheduleResultsSummary
} from '../types/schedule-views';

const log = createClientLogger('schedule-views-client');

// ============================================================================
// Types
// ============================================================================

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

	log.trace('API success response', { dataKeys: Object.keys(data) });

	return { success: true, data };
}

/**
 * Schedule Views API Client
 */
export const scheduleViewsClient = {
	/**
	 * Get student schedule with progress breakdown
	 */
	async getStudentSchedule(studentId: string): Promise<ClientResult<StudentSchedule>> {
		log.debug('Fetching student schedule', { studentId });

		try {
			const response = await fetch(`/api/students/${studentId}/schedule`);
			return await parseResponse<StudentSchedule>(response);
		} catch (error) {
			log.error('Failed to fetch student schedule', { studentId, error });
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
	 * Get preceptor schedule with capacity breakdown
	 */
	async getPreceptorSchedule(preceptorId: string): Promise<ClientResult<PreceptorSchedule>> {
		log.debug('Fetching preceptor schedule', { preceptorId });

		try {
			const response = await fetch(`/api/preceptors/${preceptorId}/schedule`);
			return await parseResponse<PreceptorSchedule>(response);
		} catch (error) {
			log.error('Failed to fetch preceptor schedule', { preceptorId, error });
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
	 * Get overall schedule summary/results
	 */
	async getScheduleSummary(): Promise<ClientResult<ScheduleResultsSummary>> {
		log.debug('Fetching schedule summary');

		try {
			const response = await fetch('/api/schedule/summary');
			return await parseResponse<ScheduleResultsSummary>(response);
		} catch (error) {
			log.error('Failed to fetch schedule summary', { error });
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
		return `Error: ${fieldErrors}`;
	}
	return error.message;
}

/**
 * Get color for clerkship (consistent hashing)
 */
export function getClerkshipColor(specialty: string): string {
	const colors = [
		'#3b82f6', // blue
		'#10b981', // green
		'#f59e0b', // amber
		'#ef4444', // red
		'#8b5cf6', // purple
		'#ec4899', // pink
		'#06b6d4', // cyan
		'#84cc16' // lime
	];

	let hash = 0;
	for (let i = 0; i < specialty.length; i++) {
		hash = specialty.charCodeAt(i) + ((hash << 5) - hash);
	}

	return colors[Math.abs(hash) % colors.length];
}

/**
 * Get initials from name
 */
export function getInitials(name: string): string {
	return name
		.split(' ')
		.map((part) => part[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}

/**
 * Format date for display (e.g., "Jan 15, 2025")
 */
export function formatDate(dateStr: string): string {
	const date = new Date(dateStr + 'T00:00:00');
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/**
 * Format date range for display
 */
export function formatDateRange(startDate: string, endDate: string): string {
	const start = new Date(startDate + 'T00:00:00');
	const end = new Date(endDate + 'T00:00:00');

	const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	return `${startStr} - ${endStr}`;
}
