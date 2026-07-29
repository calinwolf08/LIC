import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';
import { createDB } from '../../src/lib/db/connection';

/**
 * Tenant-isolation flagship (Round 3, step 33).
 *
 * The seed creates a second account (basic@example.com) whose every entity is
 * named "Tenant B …". Signed in as the admin (tenant A), that marker must never
 * appear on any surface, cross-tenant deep links must render not-found, and
 * cross-tenant writes must 404 and leave tenant B's data intact.
 *
 * Asserting the ABSENCE of B's marker (not the presence of A's) is deliberate:
 * it catches a leak through any widget, including ones nobody thought to check.
 */

const MARKER = 'Tenant B';

interface TenantBIds {
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	siteId: string;
	healthSystemId: string;
	scheduleId: string;
}

async function readTenantBIds(): Promise<TenantBIds> {
	const db = createDB('./test-sqlite.db');
	try {
		const student = await db.selectFrom('students').select('id').where('name', '=', 'Tenant B Student').executeTakeFirstOrThrow();
		const preceptor = await db.selectFrom('preceptors').select('id').where('name', '=', 'Tenant B Preceptor').executeTakeFirstOrThrow();
		const clerkship = await db.selectFrom('clerkships').select('id').where('name', '=', 'Tenant B Clerkship').executeTakeFirstOrThrow();
		const site = await db.selectFrom('sites').select('id').where('name', '=', 'Tenant B Site').executeTakeFirstOrThrow();
		const hs = await db.selectFrom('health_systems').select('id').where('name', '=', 'Tenant B Health System').executeTakeFirstOrThrow();
		const schedule = await db.selectFrom('scheduling_periods').select('id').where('name', '=', 'Tenant B Schedule').executeTakeFirstOrThrow();
		return {
			studentId: student.id as string,
			preceptorId: preceptor.id as string,
			clerkshipId: clerkship.id as string,
			siteId: site.id as string,
			healthSystemId: hs.id as string,
			scheduleId: schedule.id as string
		};
	} finally {
		await db.destroy();
	}
}

async function rowExists(table: 'students' | 'preceptors' | 'clerkships' | 'sites' | 'health_systems', id: string): Promise<boolean> {
	const db = createDB('./test-sqlite.db');
	try {
		const row = await db.selectFrom(table).select('id').where('id', '=', id).executeTakeFirst();
		return Boolean(row);
	} finally {
		await db.destroy();
	}
}

test.describe('tenant isolation (signed in as tenant A)', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, ADMIN);
	});

	const surfaces = [
		{ name: 'Dashboard', path: '/dashboard' },
		{ name: 'Students', path: '/students' },
		{ name: 'Preceptors', path: '/preceptors' },
		{ name: 'Clerkships', path: '/clerkships' },
		{ name: 'Locations', path: '/locations' },
		{ name: 'Calendar', path: '/calendar' }
	];

	for (const s of surfaces) {
		test(`${s.name} shows no Tenant B data`, async ({ page }) => {
			await page.goto(s.path);
			await page.waitForLoadState('networkidle');
			await expect(page.locator('body')).not.toContainText(MARKER);
		});
	}

	test('calendar list view shows no Tenant B data', async ({ page }) => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		// Switch to list view if a toggle exists.
		const listToggle = page.getByRole('button', { name: /list/i });
		if (await listToggle.count()) {
			await listToggle.first().click();
			await page.waitForLoadState('networkidle');
		}
		await expect(page.locator('body')).not.toContainText(MARKER);
	});

	test("dashboard totals match tenant A's own counts (no B inflation)", async ({ page }) => {
		// Tenant A's real counts from the API (already scoped).
		const studentsRes = await page.request.get('/api/students');
		const aStudents = (await studentsRes.json()).data as unknown[];

		await page.goto('/dashboard');
		await page.waitForLoadState('networkidle');
		// The dashboard's student total should equal A's own student count, which
		// (crucially) excludes Tenant B's single student.
		await expect(page.getByText(String(aStudents.length), { exact: false }).first()).toBeVisible();
		expect(aStudents.every((s: any) => s.name !== 'Tenant B Student')).toBe(true);
	});

	test("deep links to tenant B's entities render not-found", async ({ page }) => {
		const ids = await readTenantBIds();
		for (const path of [
			`/students/${ids.studentId}`,
			`/preceptors/${ids.preceptorId}`,
			`/clerkships/${ids.clerkshipId}`,
			`/sites/${ids.siteId}`
		]) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			await expect(page.locator('body')).not.toContainText(MARKER);
		}
	});

	test("cross-tenant API writes 404 and leave tenant B intact", async ({ page }) => {
		const ids = await readTenantBIds();

		const patch = await page.request.patch(`/api/students/${ids.studentId}`, {
			data: { name: 'HACKED BY A' }
		});
		expect(patch.status()).toBe(404);

		const del = await page.request.delete(`/api/preceptors/${ids.preceptorId}`);
		expect(del.status()).toBe(404);

		// Tenant B's rows are untouched.
		expect(await rowExists('students', ids.studentId)).toBe(true);
		expect(await rowExists('preceptors', ids.preceptorId)).toBe(true);
		const db = createDB('./test-sqlite.db');
		try {
			const student = await db.selectFrom('students').select('name').where('id', '=', ids.studentId).executeTakeFirst();
			expect(student?.name).toBe('Tenant B Student');
		} finally {
			await db.destroy();
		}
	});
});
