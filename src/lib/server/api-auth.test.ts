import { describe, it, expect } from 'vitest';
import { isPublicApiPath, requiresApiAuthChallenge } from './api-auth';

describe('isPublicApiPath', () => {
	it('allows better-auth routes', () => {
		expect(isPublicApiPath('/api/auth/sign-in/email')).toBe(true);
		expect(isPublicApiPath('/api/auth/session')).toBe(true);
	});

	it('denies every other /api/ route', () => {
		expect(isPublicApiPath('/api/students')).toBe(false);
		expect(isPublicApiPath('/api/schedules/assignments')).toBe(false);
		expect(isPublicApiPath('/api/scheduling-config/electives/x')).toBe(false);
	});

	it('is not fooled by /api/auth/ appearing later in the path', () => {
		expect(isPublicApiPath('/api/students/api/auth/x')).toBe(false);
	});
});

describe('requiresApiAuthChallenge', () => {
	it('challenges an unauthenticated non-public API request', () => {
		expect(requiresApiAuthChallenge('/api/students', false)).toBe(true);
		expect(requiresApiAuthChallenge('/api/blackout-dates', false)).toBe(true);
	});

	it('never challenges when a session is present', () => {
		expect(requiresApiAuthChallenge('/api/students', true)).toBe(false);
	});

	it('never challenges public auth routes', () => {
		expect(requiresApiAuthChallenge('/api/auth/sign-in/email', false)).toBe(false);
	});

	it('ignores non-API paths (pages are guarded by their layout)', () => {
		expect(requiresApiAuthChallenge('/dashboard', false)).toBe(false);
		// merely containing '/api/' later in the string is not an API route
		expect(requiresApiAuthChallenge('/dashboard/api/x', false)).toBe(false);
	});
});
