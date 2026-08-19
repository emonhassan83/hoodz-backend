import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
import { WishlistService } from '@/app/modules/wishlist/wishlist.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const toggle = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const modelType = req.body?.modelType ?? WISHLIST_MODEL_TYPE.product;
  const data = await WishlistService.toggle(traceId, req.user.userId, {
    referenceId: req.params.productId as string,
    modelType,
  });

  const label = data.modelType === WISHLIST_MODEL_TYPE.shop ? 'Shop' : 'Product';
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: data.added
      ? `${label} added to wishlist successfully`
      : `${label} removed from wishlist successfully`,
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

const remove = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WishlistService.remove(
    traceId,
    req.user.userId,
    req.params.wishlistId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wishlist item removed successfully',
    data,
    traceId,
  });
});

export const WishlistController = {
  toggle,
  getAll,
  remove,
};
