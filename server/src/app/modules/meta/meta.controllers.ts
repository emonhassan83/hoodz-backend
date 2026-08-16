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

const getRiderMeta = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await MetaService.getRiderMeta(traceId, req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Rider meta fetched successfully',
    data,
    traceId,
  });
});

const getAdminMeta = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await MetaService.getAdminMeta(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Admin meta fetched successfully',
    data,
    traceId,
  });
});

const getVendorMeta = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await MetaService.getVendorMeta(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Vendor meta fetched successfully',
    data,
    traceId,
  });
});

export const MetaController = {
  getUserMeta,
  getGuestMeta,
  getRiderMeta,
  getAdminMeta,
  getVendorMeta,
};
