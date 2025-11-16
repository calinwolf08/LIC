/**
 * Schedule Export API
 *
 * GET /api/schedules/export - Generate and download Excel file
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { errorResponse, handleApiError } from '$lib/api/responses';
import { generateScheduleExcel } from '$lib/features/schedules/services/export-service';
import type { CalendarFilters } from '$lib/features/schedules/types';
import { dateStringSchema, uuidSchema } from '$lib/validation/common-schemas';
import { z, ZodError } from 'zod';

/**
 * Schema for export query parameters
 */
const exportQuerySchema = z.object({
	start_date: dateStringSchema,
	end_date: dateStringSchema,
	student_id: uuidSchema.optional(),
	preceptor_id: uuidSchema.optional(),
	clerkship_id: uuidSchema.optional()
});

/**
 * GET /api/schedules/export
 * Generates and returns an Excel file with schedule data
 *
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 *   - student_id: UUID (optional)
 *   - preceptor_id: UUID (optional)
 *   - clerkship_id: UUID (optional)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		// Extract query parameters
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');
		const studentId = url.searchParams.get('student_id');
		const preceptorId = url.searchParams.get('preceptor_id');
		const clerkshipId = url.searchParams.get('clerkship_id');

		// Validate required parameters
		if (!startDate || !endDate) {
			return errorResponse('start_date and end_date are required', 400);
		}

		// Validate all parameters
		const validated = exportQuerySchema.parse({
			start_date: startDate,
			end_date: endDate,
			student_id: studentId || undefined,
			preceptor_id: preceptorId || undefined,
			clerkship_id: clerkshipId || undefined
		});

		// Build filters
		const filters: CalendarFilters = {
			start_date: validated.start_date,
			end_date: validated.end_date,
			student_id: validated.student_id,
			preceptor_id: validated.preceptor_id,
			clerkship_id: validated.clerkship_id
		};

		// Generate Excel file
		const buffer = await generateScheduleExcel(db, filters);

		// Generate filename with current date
		const filename = `schedule-${new Date().toISOString().split('T')[0]}.xlsx`;

		// Return Excel file with download headers
		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': buffer.length.toString()
			}
		});
	} catch (error) {
		if (error instanceof ZodError) {
			return errorResponse(error.errors[0].message, 400);
		}

		return handleApiError(error);
	}
};
