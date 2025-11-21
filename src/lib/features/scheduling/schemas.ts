import { z } from 'zod';
import { dateStringSchema } from '$lib/validation/common-schemas';

/**
 * Schema for schedule generation request
 */
export const generateScheduleSchema = z
	.object({
		/**
		 * Academic year start date (ISO format YYYY-MM-DD)
		 */
		startDate: dateStringSchema,

		/**
		 * Academic year end date (ISO format YYYY-MM-DD)
		 */
		endDate: dateStringSchema,

		/**
		 * Optional: Regenerate only from this date forward (preserves past assignments)
		 * If not provided, defaults to today
		 */
		regenerateFromDate: dateStringSchema.optional(),

		/**
		 * Optional: Regeneration strategy
		 * - 'full-reoptimize' (default): Clear all future assignments and regenerate from scratch
		 * - 'minimal-change': Preserve valid future assignments, only change what's necessary
		 */
		strategy: z.enum(['full-reoptimize', 'minimal-change']).optional().default('full-reoptimize'),

		/**
		 * Optional: Constraint names to bypass (future feature)
		 */
		bypassedConstraints: z.array(z.string()).optional().default([])
	})
	.refine(
		(data) => {
			const start = new Date(data.startDate);
			const end = new Date(data.endDate);
			return start < end;
		},
		{
			message: 'startDate must be before endDate',
			path: ['endDate']
		}
	)
	.refine(
		(data) => {
			if (!data.regenerateFromDate) return true;
			const regenerateFrom = new Date(data.regenerateFromDate);
			const start = new Date(data.startDate);
			const end = new Date(data.endDate);
			return regenerateFrom >= start && regenerateFrom <= end;
		},
		{
			message: 'regenerateFromDate must be between startDate and endDate',
			path: ['regenerateFromDate']
		}
	);

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
