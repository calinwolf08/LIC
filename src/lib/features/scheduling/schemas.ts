import { z } from 'zod';
import { dateStringSchema } from '$lib/validation/common-schemas';

/**
 * Schema for schedule generation request
 */
export const generateScheduleSchema = z.object({
	/**
	 * Academic year start date (ISO format YYYY-MM-DD)
	 */
	startDate: dateStringSchema,

	/**
	 * Academic year end date (ISO format YYYY-MM-DD)
	 */
	endDate: dateStringSchema,

	/**
	 * Optional: Constraint names to bypass (future feature)
	 */
	bypassedConstraints: z.array(z.string()).optional().default([]),
}).refine(
	(data) => {
		const start = new Date(data.startDate);
		const end = new Date(data.endDate);
		return start < end;
	},
	{
		message: 'startDate must be before endDate',
		path: ['endDate'],
	}
);

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
