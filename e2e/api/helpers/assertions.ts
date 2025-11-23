import { expect } from '@playwright/test';

/**
 * Common assertion helpers for E2E API tests
 */

export const assertions = {
	/**
	 * Assert object has required fields
	 */
	hasFields<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): void {
		fields.forEach(field => {
			expect(obj).toHaveProperty(field);
			expect(obj[field]).toBeDefined();
		});
	},

	/**
	 * Assert response contains items array
	 */
	hasItems<T>(response: { items?: T[] } | T[]): T[] {
		const items = Array.isArray(response) ? response : response.items;
		expect(items).toBeDefined();
		expect(Array.isArray(items)).toBeTruthy();
		return items!;
	},

	/**
	 * Assert array has minimum length
	 */
	hasMinLength<T>(array: T[], minLength: number): void {
		expect(array.length).toBeGreaterThanOrEqual(minLength);
	},

	/**
	 * Assert array has exact length
	 */
	hasLength<T>(array: T[], length: number): void {
		expect(array.length).toBe(length);
	},

	/**
	 * Assert object matches partial shape
	 */
	matchesShape<T extends Record<string, unknown>>(obj: T, shape: Partial<T>): void {
		Object.entries(shape).forEach(([key, value]) => {
			expect(obj[key]).toEqual(value);
		});
	},

	/**
	 * Assert error response has message
	 * Handles format: {success: false, error: {message: string}} or legacy {error: string, message: string}
	 */
	hasErrorMessage(errorResponse: { success?: boolean; error?: any; message?: string }): void {
		// Handle new format: {success: false, error: {message: string}}
		if (errorResponse.error && typeof errorResponse.error === 'object') {
			expect(errorResponse.error.message).toBeDefined();
			expect(typeof errorResponse.error.message).toBe('string');
			expect(errorResponse.error.message.length).toBeGreaterThan(0);
		} else {
			// Handle legacy format: {error: string} or {message: string}
			const message = errorResponse.error || errorResponse.message;
			expect(message).toBeDefined();
			expect(typeof message).toBe('string');
			expect((message as string).length).toBeGreaterThan(0);
		}
	},

	/**
	 * Assert date string is valid
	 */
	isValidDate(dateString: string): void {
		const date = new Date(dateString);
		expect(date.toString()).not.toBe('Invalid Date');
	},

	/**
	 * Assert value is within range
	 */
	inRange(value: number, min: number, max: number): void {
		expect(value).toBeGreaterThanOrEqual(min);
		expect(value).toBeLessThanOrEqual(max);
	},

	/**
	 * Assert object has ID field (supports both string UUIDs and numbers)
	 */
	hasId<T extends { id?: string | number }>(obj: T): string | number {
		expect(obj.id).toBeDefined();
		expect(typeof obj.id === 'string' || typeof obj.id === 'number').toBeTruthy();
		if (typeof obj.id === 'number') {
			expect(obj.id).toBeGreaterThan(0);
		} else {
			expect(obj.id!.length).toBeGreaterThan(0);
		}
		return obj.id!;
	},

	/**
	 * Assert array contains item matching predicate
	 */
	containsWhere<T>(array: T[], predicate: (item: T) => boolean): T {
		const item = array.find(predicate);
		expect(item).toBeDefined();
		return item!;
	},

	/**
	 * Assert successful CRUD operations
	 */
	crud: {
		created<T extends { id?: string | number }>(obj: T, expectedFields: Partial<T> = {}): string | number {
			const id = assertions.hasId(obj);
			assertions.matchesShape(obj, expectedFields);
			return id;
		},

		updated<T extends Record<string, unknown>>(obj: T, expectedFields: Partial<T>): void {
			assertions.matchesShape(obj, expectedFields);
		},

		deleted(response: { success?: boolean; message?: string }): void {
			expect(response.success || response.message).toBeDefined();
		}
	},

	/**
	 * Assert validation error
	 */
	validationError(errorResponse: { success?: boolean; error?: any; message?: string }): void {
		assertions.hasErrorMessage(errorResponse);
		// Check for validation-specific details
		if (errorResponse.error && typeof errorResponse.error === 'object') {
			if (errorResponse.error.details) {
				expect(Array.isArray(errorResponse.error.details)).toBeTruthy();
			}
		}
	},

	/**
	 * Assert not found error
	 */
	notFoundError(errorResponse: { success?: boolean; error?: any; message?: string }): void {
		assertions.hasErrorMessage(errorResponse);

		// Extract message from nested or flat format
		let message: string;
		if (errorResponse.error && typeof errorResponse.error === 'object') {
			message = errorResponse.error.message;
		} else {
			message = (errorResponse.error || errorResponse.message) as string;
		}

		const lowerMessage = message.toLowerCase();
		expect(
			lowerMessage.includes('not found') ||
			lowerMessage.includes('does not exist') ||
			lowerMessage.includes('no ') ||
			lowerMessage.includes('cannot find')
		).toBeTruthy();
	}
};

/**
 * Date helpers for assertions
 */
export const dateHelpers = {
	/**
	 * Get date string in YYYY-MM-DD format
	 */
	formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	},

	/**
	 * Add days to date
	 */
	addDays(date: Date | string, days: number): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		d.setDate(d.getDate() + days);
		return this.formatDate(d);
	},

	/**
	 * Get range of dates
	 */
	getDateRange(startDate: string, endDate: string): string[] {
		const dates: string[] = [];
		const current = new Date(startDate);
		const end = new Date(endDate);

		while (current <= end) {
			dates.push(this.formatDate(new Date(current)));
			current.setDate(current.getDate() + 1);
		}

		return dates;
	},

	/**
	 * Get Monday of current week
	 */
	getMonday(date: Date = new Date()): string {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		d.setDate(diff);
		return this.formatDate(d);
	}
};
