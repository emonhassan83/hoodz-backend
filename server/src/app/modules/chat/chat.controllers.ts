import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { ChatService } from '@/app/modules/chat/chat.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const createChat = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ChatService.createChat(traceId, req.user, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Chat created successfully',
    data,
    traceId,
  });
});

const getMyChatList = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ChatService.getMyChatList(req.user, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Chat list fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getChatId = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ChatService.getChatId(
    traceId,
    req.user,
    req.params.chatId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Chat fetched successfully',
    data,
    traceId,
  });
});

const getChatOrderById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ChatService.getChatOrderById(
    traceId,
    req.user,
    req.params.orderId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order chat fetched successfully',
    data,
    traceId,
  });
});

const getChatByUserId = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const participantId = String(
    req.params.participantId ?? req.params.userId ?? ''
  );
  const data = await ChatService.getChatByUserId(
    traceId,
    req.user,
    participantId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Chat fetched successfully',
    data,
    traceId,
  });
});

export const ChatController = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
  getChatByUserId,
};


