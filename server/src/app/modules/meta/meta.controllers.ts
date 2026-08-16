import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { MetaService } from '@/app/modules/meta/meta.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getGuestId = (req: Request) => {
  const guestId = req.headers['x-guest-id'];
  return Array.isArray(guestId) ? guestId[0] : guestId;
};

const getUserMeta = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await MetaService.getUserMeta(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User meta fetched successfully',
    data,
    traceId,
  });
});

const getGuestMeta = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await MetaService.getGuestMeta(req.query, getGuestId(req));

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Guest meta fetched successfully',
    data,
    traceId,
  });
});

export const MetaController = {
  getUserMeta,
  getGuestMeta,
};
