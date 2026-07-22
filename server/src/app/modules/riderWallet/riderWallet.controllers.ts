import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { emitWalletSummaryIfAvailable } from '@/app/modules/riderWallet/riderWallet.helpers';
import { RiderWalletService } from '@/app/modules/riderWallet/riderWallet.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await RiderWalletService.getSummary(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Rider wallet summary fetched successfully',
    data,
    traceId,
  });
});

const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await RiderWalletService.getTransactions(
    req.user.userId,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Rider wallet transactions fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const createWithdrawRequest = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await RiderWalletService.createWithdrawRequest(
    traceId,
    req.user.userId,
    req.body
  );
  await emitWalletSummaryIfAvailable(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Withdraw request submitted successfully',
    data,
    traceId,
  });
});

const approveWithdraw = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await RiderWalletService.approveWithdraw(
    traceId,
    req.user,
    req.params.withdrawId as string
  );
  await emitWalletSummaryIfAvailable(data.rider.toString());

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw request approved successfully',
    data,
    traceId,
  });
});

const rejectWithdraw = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await RiderWalletService.rejectWithdraw(
    traceId,
    req.user,
    req.params.withdrawId as string,
    req.body
  );
  await emitWalletSummaryIfAvailable(data.rider.toString());

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw request rejected successfully',
    data,
    traceId,
  });
});

export const RiderWalletController = {
  getSummary,
  getTransactions,
  createWithdrawRequest,
  approveWithdraw,
  rejectWithdraw,
};
