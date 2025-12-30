/**
 * Regenerate Dialog Component Tests
 *
 * Tests for the schedule regeneration dialog including:
 * - Dialog open/close behavior
 * - Mode selection (full vs smart)
 * - Strategy selection (minimal-change vs full-reoptimize)
 * - Date validation
 * - API integration
 * - Success and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import RegenerateDialog from './regenerate-dialog.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('RegenerateDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetAllMocks();
	});

	describe('Dialog State', () => {
		it('should not render when open is false', () => {
			const { container } = render(RegenerateDialog, {
				props: {
					open: false,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Dialog should not be visible
			expect(container.querySelector('[role="dialog"]')).toBeNull();
		});

		it('should render when open is true', () => {
			const { container } = render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Dialog should be visible
			expect(screen.getByText(/Regenerate Schedule/i)).toBeTruthy();
		});

		it('should call onCancel when cancel button is clicked', async () => {
			const onCancel = vi.fn();
			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel
				}
			});

			const cancelButton = screen.getByText('Cancel');
			await fireEvent.click(cancelButton);

			expect(onCancel).toHaveBeenCalledOnce();
		});
	});

	describe('Mode Selection', () => {
		it('should default to smart mode when mid-year', async () => {
			// Mock current date to be mid-year
			const mockDate = new Date('2025-06-15');
			vi.setSystemTime(mockDate);

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Smart regeneration radio should be selected
			await waitFor(() => {
				const smartRadio = screen
					.getAllByRole('radio')
					.find((r) => r.getAttribute('value') === 'smart') as HTMLInputElement;
				expect(smartRadio?.checked).toBe(true);
			});

			vi.useRealTimers();
		});

		it('should default to full mode when early in year', async () => {
			// Mock current date to be early in year
			const mockDate = new Date('2025-01-15');
			vi.setSystemTime(mockDate);

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const fullRadio = screen
					.getAllByRole('radio')
					.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
				expect(fullRadio?.checked).toBe(true);
			});

			vi.useRealTimers();
		});

		it('should switch between full and smart modes', async () => {
			const { container } = render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
			const smartRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'smart') as HTMLInputElement;

			// Click full mode
			await fireEvent.click(fullRadio);
			expect(fullRadio.checked).toBe(true);

			// Smart options should not be visible
			expect(container.querySelector('.smart-options')).toBeNull();

			// Click smart mode
			await fireEvent.click(smartRadio);
			expect(smartRadio.checked).toBe(true);

			// Smart options should now be visible
			await waitFor(() => {
				expect(screen.getByText(/Regenerate From Date/i)).toBeTruthy();
			});
		});

		it('should show destructive warning for full mode', async () => {
			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;

			await fireEvent.click(fullRadio);

			await waitFor(() => {
				expect(screen.getByText(/This will delete ALL existing assignments/i)).toBeTruthy();
			});
		});
	});

	describe('Strategy Selection', () => {
		it('should allow selecting minimal-change strategy', async () => {
			// Set date to mid-year to enable smart mode
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const minimalChangeRadio = screen.getByLabelText(/Minimal Change/i) as HTMLInputElement;
				expect(minimalChangeRadio).toBeTruthy();
				expect(minimalChangeRadio.checked).toBe(true); // Should be default
			});

			vi.useRealTimers();
		});

		it('should allow selecting full-reoptimize strategy', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const fullReoptimizeRadio = screen.getByLabelText(/Full Reoptimize/i);
				fireEvent.click(fullReoptimizeRadio);
			});

			const fullReoptimizeRadio = screen.getByLabelText(/Full Reoptimize/i) as HTMLInputElement;
			expect(fullReoptimizeRadio.checked).toBe(true);

			vi.useRealTimers();
		});

		it('should hide strategy options in full mode', async () => {
			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;

			await fireEvent.click(fullRadio);

			// Strategy options should not exist
			expect(screen.queryByLabelText(/Minimal Change/i)).toBeNull();
			expect(screen.queryByLabelText(/Full Reoptimize/i)).toBeNull();
		});
	});

	describe('Date Inputs', () => {
		it('should initialize with current year dates', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const startDateInput = screen.getByLabelText(/Start Date/i) as HTMLInputElement;
				const endDateInput = screen.getByLabelText(/End Date/i) as HTMLInputElement;

				expect(startDateInput.value).toBe('2025-01-01');
				expect(endDateInput.value).toBe('2025-12-31');
			});

			vi.useRealTimers();
		});

		it('should set regenerate from date to today in smart mode', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const regenerateFromInput = screen.getByLabelText(
					/Regenerate From Date/i
				) as HTMLInputElement;
				expect(regenerateFromInput.value).toBe('2025-06-15');
			});

			vi.useRealTimers();
		});

		it('should validate regenerate from date is within range', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const regenerateFromInput = screen.getByLabelText(
					/Regenerate From Date/i
				) as HTMLInputElement;

				expect(regenerateFromInput.min).toBe('2025-01-01');
				expect(regenerateFromInput.max).toBe('2025-12-31');
			});

			vi.useRealTimers();
		});
	});

	describe('API Integration', () => {
		it('should call DELETE and POST for full regeneration', async () => {
			const mockDeleteResponse = { success: true, data: { deleted_count: 100 } };
			const mockGenerateResponse = {
				success: true,
				data: {
					summary: { totalAssignments: 150 },
					strategy: 'full-reoptimize'
				}
			};

			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockDeleteResponse
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockGenerateResponse
				});

			const onConfirm = vi.fn();

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm,
					onCancel: vi.fn()
				}
			});

			// Select full mode
			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
			await fireEvent.click(fullRadio);

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);

				// First call: DELETE
				expect((global.fetch as any).mock.calls[0][0]).toBe('/api/schedules');
				expect((global.fetch as any).mock.calls[0][1].method).toBe('DELETE');

				// Second call: POST generate
				expect((global.fetch as any).mock.calls[1][0]).toBe('/api/schedules/generate');
				expect((global.fetch as any).mock.calls[1][1].method).toBe('POST');
			});

			await waitFor(() => {
				expect(onConfirm).toHaveBeenCalledOnce();
			});
		});

		it('should call only POST for smart regeneration', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			const mockGenerateResponse = {
				success: true,
				data: {
					summary: { totalAssignments: 150 },
					strategy: 'minimal-change',
					regeneratedFrom: '2025-06-15',
					totalPastAssignments: 50,
					preservedFutureAssignments: 25,
					deletedFutureAssignments: 5
				}
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockGenerateResponse
			});

			const onConfirm = vi.fn();

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm,
					onCancel: vi.fn()
				}
			});

			// Smart mode should be default
			await waitFor(() => {
				expect(screen.getByText(/Regenerate From Date/i)).toBeTruthy();
			});

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(1);

				// Only POST generate (no DELETE)
				const [url, options] = (global.fetch as any).mock.calls[0];
				expect(url).toBe('/api/schedules/generate');
				expect(options.method).toBe('POST');

				const body = JSON.parse(options.body);
				expect(body.regenerateFromDate).toBe('2025-06-15');
				expect(body.strategy).toBe('minimal-change');
			});

			vi.useRealTimers();
		});

		it('should send correct parameters for full-reoptimize strategy', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			const mockGenerateResponse = {
				success: true,
				data: {
					summary: { totalAssignments: 150 },
					strategy: 'full-reoptimize'
				}
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockGenerateResponse
			});

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Select full-reoptimize strategy
			await waitFor(() => {
				const fullReoptimizeRadio = screen.getByLabelText(/Full Reoptimize/i);
				fireEvent.click(fullReoptimizeRadio);
			});

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				const [, options] = (global.fetch as any).mock.calls[0];
				const body = JSON.parse(options.body);

				expect(body.strategy).toBe('full-reoptimize');
			});

			vi.useRealTimers();
		});
	});

	describe('Error Handling', () => {
		it('should display error message when DELETE fails', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => ({ success: false, error: { message: 'Database error' } })
			});

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Select full mode
			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
			await fireEvent.click(fullRadio);

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(screen.getByText(/Database error/i)).toBeTruthy();
			});
		});

		it('should display error message when generate fails', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => ({
					success: false,
					error: { message: 'Scheduling engine failed' }
				})
			});

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(screen.getByText(/Scheduling engine failed/i)).toBeTruthy();
			});

			vi.useRealTimers();
		});

		it('should handle network errors gracefully', async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			// Click regenerate
			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(screen.getByText(/An unexpected error occurred/i)).toBeTruthy();
			});
		});
	});

	describe('Success Messages', () => {
		it('should show different success messages for full vs smart mode', async () => {
			// Test full mode
			const mockDeleteResponse = { success: true, data: { deleted_count: 100 } };
			const mockGenerateResponse = {
				success: true,
				data: {
					summary: { totalAssignments: 150 },
					strategy: 'full-reoptimize'
				}
			};

			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockDeleteResponse
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockGenerateResponse
				});

			const { unmount } = render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
			await fireEvent.click(fullRadio);

			const regenerateButton = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButton);

			await waitFor(() => {
				expect(screen.getByText(/Deleted 100 assignments/i)).toBeTruthy();
			});

			unmount();

			// Test smart mode
			vi.setSystemTime(new Date('2025-06-15'));

			const mockSmartResponse = {
				success: true,
				data: {
					summary: { totalAssignments: 150 },
					strategy: 'minimal-change',
					totalPastAssignments: 50,
					preservedFutureAssignments: 25
				}
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockSmartResponse
			});

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const regenerateButtonSmart = screen.getByText(/Apply Regeneration/i);
			await fireEvent.click(regenerateButtonSmart);

			await waitFor(() => {
				expect(screen.getByText(/Preserved 50 past assignments/i)).toBeTruthy();
			});

			vi.useRealTimers();
		});
	});

	describe('Button States', () => {
		it('should disable buttons while regenerating', async () => {
			// Mock a slow response
			(global.fetch as any).mockImplementationOnce(
				() => new Promise((resolve) => setTimeout(resolve, 1000))
			);

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const regenerateButton = screen.getByText(/Apply Regeneration/i) as HTMLButtonElement;
			const cancelButton = screen.getByText('Cancel') as HTMLButtonElement;

			// Click regenerate
			await fireEvent.click(regenerateButton);

			// Buttons should be disabled
			expect(regenerateButton.disabled).toBe(true);
			expect(cancelButton.disabled).toBe(true);
			expect(screen.getByText(/Regenerating.../i)).toBeTruthy();
		});

		it('should use destructive variant for full mode button', async () => {
			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			const fullRadio = screen
				.getAllByRole('radio')
				.find((r) => r.getAttribute('value') === 'full') as HTMLInputElement;
			await fireEvent.click(fullRadio);

			await waitFor(() => {
				const regenerateButton = screen.getByText(/Apply Regeneration/i);
				// Check for destructive variant class
				expect(regenerateButton.className).toContain('destructive');
			});
		});

		it('should use default variant for smart mode button', async () => {
			vi.setSystemTime(new Date('2025-06-15'));

			render(RegenerateDialog, {
				props: {
					open: true,
					onConfirm: vi.fn(),
					onCancel: vi.fn()
				}
			});

			await waitFor(() => {
				const regenerateButton = screen.getByText(/Apply Regeneration/i);
				// Should NOT have destructive variant
				expect(regenerateButton.className).not.toContain('destructive');
			});

			vi.useRealTimers();
		});
	});
});
