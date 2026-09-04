/**
 * Stage 2 gating: verifies that auto-generation / engine-config endpoints
 * reject non-entitled users with a 403 before doing any work.
 *
 * Each guarded handler calls requireAutogen(locals) as its first statement, so
 * invoking it with empty entitlements must throw a 403 regardless of the rest
 * of the request. We only assert the guard fires (status 403).
 */

import { describe, it, expect } from 'vitest';

import * as generate from './schedules/generate/+server';
import * as schedulesCollection from './schedules/+server';
import * as capacityRules from './scheduling-config/capacity-rules/+server';
import * as fallbacks from './scheduling-config/fallbacks/+server';
import * as globalInpatient from './scheduling-config/global-defaults/inpatient/+server';
import * as clerkshipSettings from './clerkships/[id]/settings/+server';

const nonEntitled = { session: null, entitlements: [] } as App.Locals;

function event(overrides: Record<string, unknown> = {}) {
	return {
		locals: nonEntitled,
		request: new Request('http://localhost/', {
			method: 'POST',
			body: '{}',
			headers: { 'content-type': 'application/json' }
		}),
		params: { id: 'x' },
		url: new URL('http://localhost/'),
		...overrides
	} as never;
}

async function expect403(fn: () => unknown | Promise<unknown>) {
	try {
		await fn();
		expect.unreachable('handler should have thrown 403');
	} catch (err) {
		expect((err as { status?: number }).status).toBe(403);
	}
}

describe('Stage 2 gating (non-entitled user → 403)', () => {
	it('POST /api/schedules/generate', () => expect403(() => generate.POST(event())));
	it('DELETE /api/schedules', () => expect403(() => schedulesCollection.DELETE(event())));
	it('POST /api/scheduling-config/capacity-rules', () =>
		expect403(() => capacityRules.POST(event())));
	it('POST /api/scheduling-config/fallbacks', () => expect403(() => fallbacks.POST(event())));
	it('PUT /api/scheduling-config/global-defaults/inpatient', () =>
		expect403(() => globalInpatient.PUT(event())));
	it('PUT /api/clerkships/[id]/settings', () => expect403(() => clerkshipSettings.PUT(event())));
	it('DELETE /api/clerkships/[id]/settings', () =>
		expect403(() => clerkshipSettings.DELETE(event())));
});
