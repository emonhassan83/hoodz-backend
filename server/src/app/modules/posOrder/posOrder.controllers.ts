import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { PosOrderService } from '@/app/modules/posOrder/posOrder.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const create = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PosOrderService.create(traceId, req.user, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'POS order created successfully',
    data,
    traceId,
  });
});

const getPosOrders = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await PosOrderService.getPosOrders(req.user, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'POS orders fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAPosOrder = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PosOrderService.getAPosOrder(
    traceId,
    req.params.posOrderId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'POS order fetched successfully',
    data,
    traceId,
  });
});

const updateAPosOrder = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PosOrderService.updateAPosOrder(
    traceId,
    req.params.posOrderId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'POS order updated successfully',
    data,
    traceId,
  });
});

const removeAPosOrder = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PosOrderService.removeAPosOrder(
    traceId,
    req.params.posOrderId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'POS order removed successfully',
    data,
    traceId,
  });
});

export const PosOrderController = {
  create,
  getPosOrders,
  getAPosOrder,
  updateAPosOrder,
  removeAPosOrder,
};
