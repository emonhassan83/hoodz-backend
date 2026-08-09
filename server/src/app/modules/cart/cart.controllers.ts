import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { resolveCartActor } from '@/app/modules/cart/cart.helpers';
import { CartService } from '@/app/modules/cart/cart.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

/** Reads authenticated user or guest header for cart ownership. */
const getCartActorFromRequest = (req: Request) =>
  resolveCartActor(req.user?.userId, req.headers['x-guest-id']);

const add = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CartService.add(
    traceId,
    getCartActorFromRequest(req),
    req.body
  );

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
  const data = await CartService.update(
    traceId,
    getCartActorFromRequest(req),
    req.body
  );

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
  const data = await CartService.remove(
    traceId,
    getCartActorFromRequest(req),
    req.body
  );

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
  const data = await CartService.getCart(getCartActorFromRequest(req));

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
  const data = await CartService.clear(traceId, getCartActorFromRequest(req));

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


