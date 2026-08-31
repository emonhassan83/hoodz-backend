import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { SupportAssignmentService } from '@/app/modules/supportAssignment/supportAssignment.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getAllSupportAssignments = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await SupportAssignmentService.getAllSupportAssignments(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Support assignments fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

export const SupportAssignmentController = {
  getAllSupportAssignments,
};
