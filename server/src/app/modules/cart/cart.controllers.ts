import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { CartService } from '@/app/modules/cart/cart.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const add = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.add(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product added to cart successfully',
    data,
    traceId,
  });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.update(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Cart item updated successfully',
    data,
    traceId,
  });
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.remove(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Cart item removed successfully',
    data,
    traceId,
  });
});

const getCart = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.getCart(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Cart fetched successfully',
    data,
    traceId,
  });
});

const clear = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.clear(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Cart cleared successfully',
    data,
    traceId,
  });
});

export const CartController = {
  add,
  update,
  remove,
  getCart,
  clear,
};

