import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getAllIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await WalletTransactionService.getAllIntoDB(req.query, req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet transactions fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletTransactionService.getAIntoDB(
    traceId,
    req.params.transactionId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet transaction fetched successfully',
    data,
    traceId,
  });
});

const refundToCard = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletTransactionService.refundToCard(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet refund to card processed successfully',
    data,
    traceId,
  });
});

export const WalletTransactionController = {
  getAllIntoDB,
  getAIntoDB,
  refundToCard,
};
