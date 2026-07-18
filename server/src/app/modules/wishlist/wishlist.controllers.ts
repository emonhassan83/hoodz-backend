import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { WishlistService } from '@/app/modules/wishlist/wishlist.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const toggle = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WishlistService.toggle(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: data.added
      ? 'Product added to wishlist successfully'
      : 'Product removed from wishlist successfully',
    data,
    traceId,
  });
});

const getAll = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WishlistService.getAll(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wishlist fetched successfully',
    data,
    traceId,
  });
});

export const WishlistController = {
  toggle,
  getAll,
};
