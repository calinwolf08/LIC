/**
 * Page object for `/calendar` — the working surface.
 *
 * View switch, display filters, day/chip clicks (which open the unified
 * assignment dialog), the blackout panel, export, and the embedded health panel.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { AssignmentDialog } from './assignment-dialog';
import { HealthPanel } from './health-panel';

export interface CalendarFilters {
	student?: string | null;
	preceptor?: string | null;
	clerkship?: string | null;
	start?: string;
	end?: string;
}

export class CalendarPage {
	readonly health: HealthPanel;
	readonly dialog: AssignmentDialog;

	constructor(private readonly page: Page) {
		this.health = new HealthPanel(page);
		this.dialog = new AssignmentDialog(page);
	}

	async goto(query: Record<string, string> = {}) {
		const qs = new URLSearchParams(query).toString();
		await this.page.goto(`/calendar${qs ? `?${qs}` : ''}`);
		await expect(this.page.getByRole('button', { name: 'Add assignment' })).toBeVisible({
			timeout: 20000
		});
	}

	// ---- view --------------------------------------------------------------

	async setView(view: 'list' | 'calendar') {
		await this.page
			.getByRole('button', { name: view === 'list' ? 'List' : 'Calendar', exact: true })
			.click();
		await expect(this.page).toHaveURL(new RegExp(`[?&]view=${view}`));
	}

	viewFromUrl(): 'list' | 'calendar' {
		return new URL(this.page.url()).searchParams.get('view') === 'list' ? 'list' : 'calendar';
	}

	async nextMonth() {
		await this.page.getByRole('button', { name: /next month/i }).click();
	}
	async previousMonth() {
		await this.page.getByRole('button', { name: /previous month/i }).click();
	}

	// ---- filters -----------------------------------------------------------

	private async ensureFiltersOpen() {
		if (
			!(await this.page
				.locator('#student')
				.isVisible()
				.catch(() => false))
		) {
			await this.page.getByRole('button', { name: /^filters/i }).click();
			await expect(this.page.locator('#student')).toBeVisible();
		}
	}

	/** Select by option label; `null` resets a select to "All …". */
	async filter(f: CalendarFilters) {
		await this.ensureFiltersOpen();
		const pick = async (id: string, label: string | null | undefined) => {
			if (label === undefined) return;
			const select = this.page.locator(`#${id}`);
			if (label === null) await select.selectOption({ index: 0 });
			else {
				await expect(select.locator('option', { hasText: label })).toHaveCount(1, {
					timeout: 10000
				});
				await select.selectOption({ label });
			}
		};
		await pick('student', f.student);
		await pick('preceptor', f.preceptor);
		await pick('clerkship', f.clerkship);
		if (f.start) await this.page.locator('#start_date').fill(f.start);
		if (f.end) await this.page.locator('#end_date').fill(f.end);
	}

	async clearFilters() {
		await this.ensureFiltersOpen();
		await this.page.getByRole('button', { name: 'Clear Filters' }).click();
	}

	// ---- grid --------------------------------------------------------------

	/** The month grid on the page (not the dialog's picker). */
	get grid(): Locator {
		return this.page.locator('.calendar-grid');
	}

	dayCell(date: string): Locator {
		return this.grid.locator(`[data-date="${date}"]`);
	}

	/** Chips on a day (or all visible chips). */
	chips(date?: string): Locator {
		const scope = date ? this.dayCell(date) : this.grid;
		return scope.getByTestId('calendar-assignment');
	}

	chipById(id: string): Locator {
		return this.grid.locator(`[data-assignment-id="${id}"]`);
	}

	/** Click an empty day → create dialog with the date locked. */
	async clickDay(date: string): Promise<AssignmentDialog> {
		await this.dayCell(date).click();
		return this.dialog.waitUntilOpen();
	}

	/** Click a chip → edit dialog. */
	async openAssignment(id: string): Promise<AssignmentDialog> {
		await this.chipById(id).click();
		return this.dialog.waitUntilOpen();
	}

	async isBlackout(date: string): Promise<boolean> {
		const cls = (await this.dayCell(date).getAttribute('class')) ?? '';
		return cls.includes('blackout-date');
	}

	// ---- blackout panel ----------------------------------------------------

	async toggleBlackoutPanel() {
		await this.page.getByRole('button', { name: /blackout dates/i }).click();
	}

	// ---- export ------------------------------------------------------------

	/** Click "Export to Excel" and return the raw xlsx bytes the server sent. */
	async exportXlsx(): Promise<{ status: number; bytes: Buffer; filename: string | null }> {
		const [response] = await Promise.all([
			this.page.waitForResponse((r) => r.url().includes('/api/schedules/export')),
			this.page.getByRole('button', { name: /export to excel/i }).click()
		]);
		const disposition = response.headers()['content-disposition'] ?? null;
		return {
			status: response.status(),
			bytes: await response.body(),
			filename: disposition?.match(/filename="([^"]+)"/)?.[1] ?? null
		};
	}
}
