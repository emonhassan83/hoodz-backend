import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { WithdrawService } from '@/app/modules/withdraw/withdraw.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const addWithdrawRequest = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WithdrawService.addWithdrawRequest(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Withdraw request submitted successfully',
    data,
    traceId,
  });
});

const getAllWithdraws = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await WithdrawService.getAllWithdraws(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw requests fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const myWithdraws = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await WithdrawService.myWithdraws(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My withdraw requests fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAWithdraw = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WithdrawService.getAWithdraw(
    traceId,
    req.params.withdrawId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw request fetched successfully',
    data,
    traceId,
  });
});

const changedWithdrawStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WithdrawService.changedWithdrawStatus(
    traceId,
    req.params.withdrawId as string,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw status updated successfully',
    data,
    traceId,
  });
});

export const WithdrawController = {
  addWithdrawRequest,
  getAllWithdraws,
  myWithdraws,
  getAWithdraw,
  changedWithdrawStatus,
};
