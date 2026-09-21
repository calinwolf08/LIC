/**
 * Typed wrapper over `page.request` so journeys assert API answers in the same
 * authenticated session (same cookies, same tenant) as the UI they are driving.
 *
 * Every route answers with the shared envelope from `src/lib/api/responses.ts`:
 *   { success: true,  data }
 *   { success: false, error: { message, details? } }
 * This wrapper flattens it so a journey can write `expect(res.ok).toBe(true)`
 * and `res.data.id` without re-parsing JSON everywhere.
 */

import type { APIResponse, Page } from '@playwright/test';

export interface ApiResult<T = unknown> {
	ok: boolean;
	status: number;
	data: T | undefined;
	error: { message: string; details?: unknown } | undefined;
	raw: APIResponse;
}

async function wrap<T>(res: APIResponse): Promise<ApiResult<T>> {
	let body: { success?: boolean; data?: T; error?: { message: string; details?: unknown } } = {};
	const text = await res.text();
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			body = {};
		}
	}
	return {
		ok: res.ok() && body.success !== false,
		status: res.status(),
		data: body.data,
		error: body.error,
		raw: res
	};
}

export interface Api {
	get<T = unknown>(path: string): Promise<ApiResult<T>>;
	post<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>>;
	put<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>>;
	patch<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>>;
	delete<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>>;
}

/** Bind the wrapper to a page's request context (its cookies, its tenant). */
export function apiOf(page: Page): Api {
	const r = page.request;
	return {
		get: async (path) => wrap(await r.get(path)),
		post: async (path, body) => wrap(await r.post(path, { data: body })),
		put: async (path, body) => wrap(await r.put(path, { data: body })),
		patch: async (path, body) => wrap(await r.patch(path, { data: body })),
		delete: async (path, body) =>
			wrap(await r.delete(path, body === undefined ? {} : { data: body }))
	};
}

/** Convenience: the caller's active schedule id (or null when none). */
export async function activeScheduleId(page: Page): Promise<string | null> {
	const res = await apiOf(page).get<{ schedule?: { id: string } | null }>(
		'/api/user/active-schedule'
	);
	return res.data?.schedule?.id ?? null;
}
