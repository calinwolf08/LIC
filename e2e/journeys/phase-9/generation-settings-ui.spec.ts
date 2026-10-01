// @coverage @finding(CF-SETTINGS-UI) @req(R5)
/**
 * Generation settings — the Global Defaults form, driven through its real UI.
 *
 * The defaults API is covered by unit/API tests, but the /generate/settings form
 * (collapsible per-type sections, each with its own Save) was never exercised from
 * the UI. This expands the Outpatient section, edits "Max Students Per Day",
 * clicks "Save Outpatient Defaults", asserts the success toast, and confirms the
 * new value persisted via the API. The original value is restored so this shared
 * global setting does not leak into other tests.
 */

import { test, expect, apiOf } from '../../fixtures';

interface OutpatientDefaults {
	assignmentStrategy: string;
	healthSystemRule: string;
	defaultMaxStudentsPerDay: number;
	defaultMaxStudentsPerYear: number;
	[k: string]: unknown;
}

test.describe('CF-SETTINGS-UI global defaults form', { tag: ['@stage2', '@long'] }, () => {
	test('edit + save Outpatient "Max Students Per Day" through the form', async ({ asAdmin }) => {
		test.setTimeout(120000);
		const api = apiOf(asAdmin);

		// Capture the original so we can restore this shared global setting afterwards.
		// apiOf already unwraps the `{ data }` envelope, so `.data` is the defaults.
		const original = (
			await api.get<OutpatientDefaults>('/api/scheduling-config/global-defaults/outpatient')
		).data!;
		expect(original, 'outpatient defaults loaded').toBeTruthy();
		// Per-day must stay <= per-year (a form validation rule), so pick a valid,
		// distinct small value under the current per-year cap.
		const perYear = original.defaultMaxStudentsPerYear ?? 3;
		const current = original.defaultMaxStudentsPerDay ?? 2;
		const target = current === 1 ? Math.min(2, perYear) : 1;

		try {
			await asAdmin.goto('/generate/settings');

			// Expand the Outpatient section (accordion content is lazy).
			await asAdmin.getByRole('button', { name: /outpatient defaults/i }).click();

			const input = asAdmin.getByTestId('outpatient-max-per-day');
			await expect(input).toBeVisible({ timeout: 10000 });
			await input.fill(String(target));
			await asAdmin.getByTestId('save-outpatient-defaults').click();

			// The form reports success…
			await expect(asAdmin.getByText(/outpatient defaults saved successfully/i)).toBeVisible({
				timeout: 15000
			});

			// …and the new value is actually persisted.
			await expect
				.poll(
					async () =>
						(
							await api.get<OutpatientDefaults>(
								'/api/scheduling-config/global-defaults/outpatient'
							)
						).data?.defaultMaxStudentsPerDay,
					{ timeout: 10000 }
				)
				.toBe(target);
		} finally {
			// Restore the original global default for other tests.
			await api.put('/api/scheduling-config/global-defaults/outpatient', original);
		}
	});
});
