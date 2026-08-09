import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { AiAssistantService } from '@/app/modules/aiAssistant/aiAssistant.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await AiAssistantService.sendMessage(traceId, req.user, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'AI assistant replied successfully',
    data,
    traceId,
  });
});

export const AiAssistantController = {
  sendMessage,
};



