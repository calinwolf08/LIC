/**
 * API Test Helpers
 *
 * Utilities for testing API endpoints
 */

/**
 * Creates a mock Request object for testing
 */
export function createMockRequest(method: string, url: string, body?: unknown): Request {
	const headers = new Headers({
		'Content-Type': 'application/json'
	});

	const init: RequestInit = {
		method,
		headers
	};

	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}

	return new Request(url, init);
}

/**
 * Parses JSON from a Response object
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
	return await response.json() as T;
}

/**
 * Mock fetch function for testing
 */
export async function mockFetch(url: string, options?: RequestInit): Promise<Response> {
	// This is a placeholder - in tests you'd typically use vi.fn() or similar
	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
