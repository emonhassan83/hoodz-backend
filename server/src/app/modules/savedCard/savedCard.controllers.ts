import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const setupSavedCard = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedCardService.setupSavedCard(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Saved card setup initiated successfully',
    data,
    traceId,
  });
});

const getMyCards = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedCardService.getMyCards(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Saved cards fetched successfully',
    data,
    traceId,
  });
});

const setDefaultCard = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedCardService.setDefaultCard(
    traceId,
    req.user.userId,
    req.params.cardId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Default card updated successfully',
    data,
    traceId,
  });
});

const deleteCard = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedCardService.deleteCard(
    traceId,
    req.user.userId,
    req.params.cardId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Saved card deleted successfully',
    data,
    traceId,
  });
});

export const SavedCardController = {
  setupSavedCard,
  getMyCards,
  setDefaultCard,
  deleteCard,
};
