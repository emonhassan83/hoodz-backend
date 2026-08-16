import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { AnalysisService } from '@/app/modules/analysis/analysis.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await AnalysisService.getDashboard(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Analytics fetched successfully',
    data,
    traceId,
  });
});

export const AnalysisController = {
  getDashboard,
};
