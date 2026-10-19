import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE_NAME, isUntouchedDefaultSchedule } from './defaults';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

describe('isUntouchedDefaultSchedule', () => {
	it('is true only for the sign-up schedule nobody has saved', () => {
		expect(
			isUntouchedDefaultSchedule({ name: DEFAULT_SCHEDULE_NAME, created_at: T1, updated_at: T1 })
		).toBe(true);
	});

	it('is false once saved, even with the default name kept', () => {
		expect(
			isUntouchedDefaultSchedule({ name: DEFAULT_SCHEDULE_NAME, created_at: T1, updated_at: T2 })
		).toBe(false);
	});

	it('is false for a schedule created under another name', () => {
		expect(
			isUntouchedDefaultSchedule({ name: '2026–27 LIC', created_at: T1, updated_at: T1 })
		).toBe(false);
	});
});
