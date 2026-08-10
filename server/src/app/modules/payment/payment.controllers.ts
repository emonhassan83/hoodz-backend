import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { buildPaymobReturnHtml } from '@/app/modules/payment/payment.helpers';
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
    statusCode: 200,
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

const paymobWebhook = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const payload = req.method === 'GET' ? req.query : req.body;
  const data = await PaymentService.confirmPaymentByWebhook(
    traceId,
    payload,
    (req.query.hmac as string | undefined) || req.body?.hmac
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Payment webhook processed successfully',
    data,
    traceId,
  });
});

const paymobReturnPage = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).type('html').send(buildPaymobReturnHtml(req.query));
});

export const PaymentController = {
  initiatePayment,
  confirmPayment,
  paymobWebhook,
  paymobReturnPage,
  getAllPayments,
};

