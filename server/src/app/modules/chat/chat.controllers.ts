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
  const data = await ChatService.getMyChatList(req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Chat list fetched successfully',
    data,
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

export const ChatController = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
};

