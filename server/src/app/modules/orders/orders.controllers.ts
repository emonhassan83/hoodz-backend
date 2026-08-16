import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { OrdersService } from '@/app/modules/orders/orders.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getOrderSummary = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.getOrderSummary(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order summary fetched successfully',
    data,
    traceId,
  });
});

const createOrders = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.createOrders(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Orders created successfully',
    data,
    traceId,
  });
});

const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await OrdersService.getAllOrders(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Orders fetched successfully',
    meta: result.meta,
    data: result.orders,
    traceId,
  });
});

const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await OrdersService.getMyOrders(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My orders fetched successfully',
    meta: result.meta,
    data: result.orders,
    traceId,
  });
});

const getAuthorOrders = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await OrdersService.getAuthorOrders(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Author orders fetched successfully',
    meta: result.meta,
    data: result.orders,
    traceId,
  });
});

const getOrdersById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.getOrdersById(
    traceId,
    req.params.orderId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order fetched successfully',
    data,
    traceId,
  });
});

const confirmOrder = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.confirmOrder(
    traceId,
    req.params.orderId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order confirmed and job matching started',
    data,
    traceId,
  });
});

const changeOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.changeOrderStatus(
    traceId,
    req.params.orderId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order status changed successfully',
    data,
    traceId,
  });
});

const deleteOrder = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await OrdersService.deleteOrder(
    traceId,
    req.params.orderId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order deleted successfully',
    data,
    traceId,
  });
});

export const OrdersController = {
  getOrderSummary,
  createOrders,
  getAllOrders,
  getMyOrders,
  getAuthorOrders,
  getOrdersById,
  confirmOrder,
  changeOrderStatus,
  deleteOrder,
};


