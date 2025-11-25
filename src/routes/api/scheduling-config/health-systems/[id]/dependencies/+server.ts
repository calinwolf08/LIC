import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { successResponse, errorResponse, handleApiError } from '$lib/api';

const service = new HealthSystemService(db);

/**
 * GET /api/scheduling-config/health-systems/[id]/dependencies
 * Get dependency counts for a health system
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const result = await service.getHealthSystemDependencies(params.id);

    if (!result.success) {
      return errorResponse(result.error.message, 400);
    }

    return successResponse(result.data);
  } catch (error) {
    return handleApiError(error);
  }
};
