/**
 * A sandbox schedule: created through the API in the caller's own session,
 * switched into for the duration of a journey, and torn down afterwards with
 * the previously active schedule restored — so mutating journeys never see each
 * other's rows and never disturb the seeded "Demo Schedule".
 *
 * Generalises the pattern first written in `end-to-end.spec.ts`.
 */

import type { Page } from '@playwright/test';
import { apiOf, activeScheduleId } from './api';
import { monthStart, monthEnd } from '../../src/lib/db/scripts/seed-schedule';

export interface Sandbox {
	id: string;
	name: string;
	start: string;
	end: string;
	/** Switch the caller back to their previous schedule and delete this one. */
	restore(): Promise<void>;
}

export interface SandboxOptions {
	name?: string;
	/** YYYY-MM-DD; defaults to the first day of the current month. */
	start?: string;
	/** YYYY-MM-DD; defaults to the last day of the month two months out. */
	end?: string;
	/** Make it the caller's active schedule (default true). */
	activate?: boolean;
}

export async function createSandboxSchedule(
	page: Page,
	opts: SandboxOptions = {}
): Promise<Sandbox> {
	const api = apiOf(page);
	const stamp = Date.now();
	const name = opts.name ?? `Sandbox ${stamp}`;
	const start = opts.start ?? monthStart(0);
	const end = opts.end ?? monthEnd(2);

	const baselineId = await activeScheduleId(page);
	const created = await api.post<{ id: string }>('/api/scheduling-periods', {
		name,
		start_date: start,
		end_date: end
	});
	if (!created.ok || !created.data?.id) {
		throw new Error(
			`Sandbox schedule creation failed (${created.status}): ${created.error?.message ?? 'no id'}`
		);
	}
	const id = created.data.id;

	if (opts.activate !== false) {
		const switched = await api.put('/api/user/active-schedule', { scheduleId: id });
		if (!switched.ok) {
			throw new Error(`Could not activate sandbox schedule (${switched.status})`);
		}
	}

	let restored = false;
	return {
		id,
		name,
		start,
		end,
		async restore() {
			if (restored) return;
			restored = true;
			if (baselineId) {
				await api.put('/api/user/active-schedule', { scheduleId: baselineId }).catch(() => {});
			}
			await api.delete(`/api/scheduling-periods/${id}`).catch(() => {});
		}
	};
}

/** Test-scoped factory: remembers every sandbox so teardown can restore them all. */
export class SandboxFactory {
	private created: Sandbox[] = [];

	async create(page: Page, opts: SandboxOptions = {}): Promise<Sandbox> {
		const s = await createSandboxSchedule(page, opts);
		this.created.push(s);
		return s;
	}

	async restoreAll(): Promise<void> {
		for (const s of [...this.created].reverse()) {
			await s.restore().catch(() => {});
		}
		this.created = [];
	}
}
