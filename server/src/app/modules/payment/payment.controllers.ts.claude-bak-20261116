import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { PaymentService } from '@/app/modules/payment/payment.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PaymentService.initiatePayment(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Payment initiated successfully',
    data,
    traceId,
  });
});

const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PaymentService.confirmPayment(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Payment confirmed successfully',
    data,
    traceId,
  });
});

const getAllPayments = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await PaymentService.getAllPayments(req.query, req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Payments fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAPayment = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await PaymentService.getAPayment(
    traceId,
    req.params.paymentId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Payment fetched successfully',
    data,
    traceId,
  });
});

const getUserTransactionHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const result = await PaymentService.getUserTransactionHistory(
      req.user.userId,
      req.query
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'User payment transaction history fetched successfully',
      meta: result.meta,
      data: result.data,
      traceId,
    });
  }
);

const paymobWebhook = asyncHandler(async (req: Request, res: Response) => {
  sendResponse(res, {
    success: false,
    statusCode: 410,
    message: 'Online payments are disabled. Orders are cash on delivery only.',
    data: null,
    traceId: getTraceId(),
  });
});

const paymobReturnPage = asyncHandler(async (req: Request, res: Response) => {
  res
    .status(410)
    .type('html')
    .send('<p>Online payments are disabled. Pay the rider in cash.</p>');
});

export const PaymentController = {
  initiatePayment,
  confirmPayment,
  paymobWebhook,
  paymobReturnPage,
  getAllPayments,
  getAPayment,
  getUserTransactionHistory,
};

