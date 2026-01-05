/**
 * Schedule Store
 *
 * Manages the active scheduling period and provides schedule switching functionality.
 * Uses Svelte writable stores for reactivity.
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'lic-active-schedule-id';

export interface Schedule {
	id: string;
	name: string;
	start_date: string;
	end_date: string;
	is_active: number;
	year: number | null;
	created_at: string;
	updated_at: string;
}

interface ScheduleState {
	schedules: Schedule[];
	activeScheduleId: string | null;
	loading: boolean;
	error: string | null;
}

// Create the writable store
const initialState: ScheduleState = {
	schedules: [],
	activeScheduleId: null,
	loading: true,
	error: null
};

export const scheduleStore = writable<ScheduleState>(initialState);

// Derived store for the active schedule
export const activeSchedule = derived(scheduleStore, ($state) =>
	$state.schedules.find((s) => s.id === $state.activeScheduleId) || null
);

// Derived store for all schedules
export const schedules = derived(scheduleStore, ($state) => $state.schedules);

// Derived store for loading state
export const isLoading = derived(scheduleStore, ($state) => $state.loading);

// Derived store for error state
export const scheduleError = derived(scheduleStore, ($state) => $state.error);

/**
 * Load schedules from the API
 */
export async function loadSchedules(): Promise<void> {
	scheduleStore.update((s) => ({ ...s, loading: true, error: null }));

	try {
		// Load schedules and user's active schedule in parallel
		const [schedulesResponse, activeScheduleResponse] = await Promise.all([
			fetch('/api/scheduling-periods'),
			fetch('/api/user/active-schedule').catch(() => null) // May fail if not authenticated
		]);

		const schedulesResult = await schedulesResponse.json();

		if (schedulesResult.success) {
			const loadedSchedules = schedulesResult.data as Schedule[];

			// Try to get user's active schedule from the database
			let userActiveScheduleId: string | null = null;
			if (activeScheduleResponse?.ok) {
				const activeResult = await activeScheduleResponse.json();
				if (activeResult.success && activeResult.data?.schedule) {
					userActiveScheduleId = activeResult.data.schedule.id;
				}
			}

			// Find the server's active schedule (for reference)
			const serverActiveSchedule = loadedSchedules.find((s) => s.is_active === 1);

			// Try to restore from localStorage as fallback
			let storedId: string | null = null;
			if (browser) {
				storedId = localStorage.getItem(STORAGE_KEY);
			}

			// Priority: 1. User's DB active schedule, 2. localStorage, 3. Server active, 4. First schedule
			let activeId: string | null = null;
			if (userActiveScheduleId && loadedSchedules.some((s) => s.id === userActiveScheduleId)) {
				activeId = userActiveScheduleId;
			} else if (storedId && loadedSchedules.some((s) => s.id === storedId)) {
				activeId = storedId;
			} else if (serverActiveSchedule) {
				activeId = serverActiveSchedule.id;
			} else if (loadedSchedules.length > 0) {
				activeId = loadedSchedules[0].id;
			}

			// Sync localStorage
			if (browser && activeId) {
				localStorage.setItem(STORAGE_KEY, activeId);
			}

			scheduleStore.set({
				schedules: loadedSchedules,
				activeScheduleId: activeId,
				loading: false,
				error: null
			});
		} else {
			scheduleStore.update((s) => ({
				...s,
				loading: false,
				error: schedulesResult.error?.message || 'Failed to load schedules'
			}));
		}
	} catch (error) {
		scheduleStore.update((s) => ({
			...s,
			loading: false,
			error: error instanceof Error ? error.message : 'Failed to load schedules'
		}));
	}
}

/**
 * Set the active schedule (updates UI immediately and persists to database)
 */
export function selectSchedule(scheduleId: string): void {
	const currentState = get(scheduleStore);
	if (currentState.schedules.some((s) => s.id === scheduleId)) {
		// Update UI immediately
		scheduleStore.update((s) => ({ ...s, activeScheduleId: scheduleId }));
		if (browser) {
			localStorage.setItem(STORAGE_KEY, scheduleId);

			// Also persist to database (fire and forget - don't block UI)
			fetch('/api/user/active-schedule', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduleId })
			}).catch((err) => {
				console.warn('Failed to persist active schedule to database:', err);
			});
		}
	}
}

/**
 * Activate a schedule on the server
 */
export async function activateSchedule(scheduleId: string): Promise<boolean> {
	try {
		const response = await fetch(`/api/scheduling-periods/${scheduleId}/activate`, {
			method: 'POST'
		});
		const result = await response.json();

		if (result.success) {
			// Update local state
			scheduleStore.update((s) => ({
				...s,
				schedules: s.schedules.map((sch) => ({
					...sch,
					is_active: sch.id === scheduleId ? 1 : 0
				})),
				activeScheduleId: scheduleId
			}));

			if (browser) {
				localStorage.setItem(STORAGE_KEY, scheduleId);
			}

			return true;
		}

		scheduleStore.update((s) => ({
			...s,
			error: result.error?.message || 'Failed to activate schedule'
		}));
		return false;
	} catch (error) {
		scheduleStore.update((s) => ({
			...s,
			error: error instanceof Error ? error.message : 'Failed to activate schedule'
		}));
		return false;
	}
}

/**
 * Create a new schedule
 */
export async function createSchedule(data: {
	name: string;
	start_date: string;
	end_date: string;
	is_active?: boolean;
}): Promise<Schedule | null> {
	try {
		const response = await fetch('/api/scheduling-periods', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		const result = await response.json();

		if (result.success) {
			const newSchedule = result.data as Schedule;

			scheduleStore.update((s) => {
				let updatedSchedules = [...s.schedules, newSchedule];

				// If new schedule is active, update others
				if (newSchedule.is_active === 1) {
					updatedSchedules = updatedSchedules.map((sch) => ({
						...sch,
						is_active: sch.id === newSchedule.id ? 1 : 0
					}));
				}

				return {
					...s,
					schedules: updatedSchedules,
					activeScheduleId: newSchedule.is_active === 1 ? newSchedule.id : s.activeScheduleId
				};
			});

			if (newSchedule.is_active === 1 && browser) {
				localStorage.setItem(STORAGE_KEY, newSchedule.id);
			}

			return newSchedule;
		}

		scheduleStore.update((s) => ({
			...s,
			error: result.error?.message || 'Failed to create schedule'
		}));
		return null;
	} catch (error) {
		scheduleStore.update((s) => ({
			...s,
			error: error instanceof Error ? error.message : 'Failed to create schedule'
		}));
		return null;
	}
}

/**
 * Delete a schedule
 */
export async function deleteSchedule(scheduleId: string): Promise<boolean> {
	try {
		const response = await fetch(`/api/scheduling-periods/${scheduleId}`, {
			method: 'DELETE'
		});
		const result = await response.json();

		if (result.success) {
			scheduleStore.update((s) => {
				const updatedSchedules = s.schedules.filter((sch) => sch.id !== scheduleId);

				// If we deleted the active schedule, select another one
				let newActiveId = s.activeScheduleId;
				if (s.activeScheduleId === scheduleId) {
					const serverActive = updatedSchedules.find((sch) => sch.is_active === 1);
					if (serverActive) {
						newActiveId = serverActive.id;
					} else if (updatedSchedules.length > 0) {
						newActiveId = updatedSchedules[0].id;
					} else {
						newActiveId = null;
					}

					if (browser) {
						if (newActiveId) {
							localStorage.setItem(STORAGE_KEY, newActiveId);
						} else {
							localStorage.removeItem(STORAGE_KEY);
						}
					}
				}

				return {
					...s,
					schedules: updatedSchedules,
					activeScheduleId: newActiveId
				};
			});

			return true;
		}

		scheduleStore.update((s) => ({
			...s,
			error: result.error?.message || 'Failed to delete schedule'
		}));
		return false;
	} catch (error) {
		scheduleStore.update((s) => ({
			...s,
			error: error instanceof Error ? error.message : 'Failed to delete schedule'
		}));
		return false;
	}
}

/**
 * Clear any error
 */
export function clearError(): void {
	scheduleStore.update((s) => ({ ...s, error: null }));
}

/**
 * Format date range for display
 */
export function formatDateRange(startDate: string, endDate: string): string {
	const start = new Date(startDate + 'T00:00:00');
	const end = new Date(endDate + 'T00:00:00');

	const formatOptions: Intl.DateTimeFormatOptions = {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	};

	return `${start.toLocaleDateString('en-US', formatOptions)} - ${end.toLocaleDateString('en-US', formatOptions)}`;
}
