import { expect, type APIRequestContext } from '@playwright/test';

/**
 * API Client wrapper for E2E API testing
 * Provides consistent request handling and response validation
 */
export class ApiClient {
	constructor(private request: APIRequestContext, private baseURL: string = 'http://localhost:4173') {}

	async get(endpoint: string, options: { params?: Record<string, string> } = {}) {
		const url = new URL(endpoint, this.baseURL);
		if (options.params) {
			Object.entries(options.params).forEach(([key, value]) => {
				url.searchParams.append(key, value);
			});
		}
		return this.request.get(url.toString());
	}

	async post(endpoint: string, data?: unknown) {
		const url = new URL(endpoint, this.baseURL);
		return this.request.post(url.toString(), {
			data: data,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	async put(endpoint: string, data?: unknown) {
		const url = new URL(endpoint, this.baseURL);
		return this.request.put(url.toString(), {
			data: data,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	async patch(endpoint: string, data?: unknown) {
		const url = new URL(endpoint, this.baseURL);
		return this.request.patch(url.toString(), {
			data: data,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	async delete(endpoint: string, options: { params?: Record<string, string> } = {}) {
		const url = new URL(endpoint, this.baseURL);
		if (options.params) {
			Object.entries(options.params).forEach(([key, value]) => {
				url.searchParams.append(key, value);
			});
		}
		return this.request.delete(url.toString());
	}

	/**
	 * Assert response status and return parsed JSON
	 * Note: This returns the raw response. Use expectData() to auto-unwrap the {success, data} format.
	 */
	async expectJson<T>(response: Awaited<ReturnType<typeof this.get>>, expectedStatus = 200): Promise<T> {
		expect(response.status()).toBe(expectedStatus);
		return response.json();
	}

	/**
	 * Assert response status and return unwrapped data from {success: true, data: T} format
	 */
	async expectData<T>(response: Awaited<ReturnType<typeof this.get>>, expectedStatus = 200): Promise<T> {
		expect(response.status()).toBe(expectedStatus);
		const body = await response.json() as { success: boolean; data: T };
		expect(body.success).toBe(true);
		return body.data;
	}

	/**
	 * Assert response is successful (2xx)
	 */
	async expectSuccess(response: Awaited<ReturnType<typeof this.get>>) {
		expect(response.ok()).toBeTruthy();
		return response;
	}

	/**
	 * Assert response is an error with specific status
	 */
	async expectError(response: Awaited<ReturnType<typeof this.get>>, expectedStatus: number) {
		expect(response.status()).toBe(expectedStatus);
		const body = await response.json().catch(() => ({}));
		return body;
	}
}

/**
 * Create API client from Playwright request context
 */
export function createApiClient(request: APIRequestContext, baseURL?: string): ApiClient {
	return new ApiClient(request, baseURL);
}
