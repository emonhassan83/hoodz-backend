import { Request, Response } from 'express';

import { SupportService } from '@/app/modules/support/support.services';
import { getTraceId } from '@/app/configs/requestContext.configs';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const sendSupportEmail = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const userId = req.user.userId;
  await SupportService.sendSupportEmail(traceId, req.body, userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message:
      'Your support request has been sent successfully. We will get back to you soon.',
    data: null,
    traceId,
  });
});

export const SupportControllers = {
  sendSupportEmail,
};
