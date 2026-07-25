import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { MessagesService } from '@/app/modules/messages/messages.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getMessagesByChatId = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await MessagesService.getMessagesByChatId(
    traceId,
    req.user,
    req.params.chatId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Messages fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

export const MessagesController = {
  getMessagesByChatId,
};

