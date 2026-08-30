import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { DepositService } from '@/app/modules/deposit/deposit.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const submitDeposit = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await DepositService.submitDeposit(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Deposit submitted successfully',
    data,
    traceId,
  });
});

const verifyDeposit = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await DepositService.verifyDeposit(
    traceId,
    req.params.depositId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Deposit status updated successfully',
    data,
    traceId,
  });
});

const getAll = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await DepositService.getAll(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'deposits fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getMy = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await DepositService.getMyDeposits(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My deposits fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await DepositService.getById(
    traceId,
    { userId: req.user.userId, role: req.user.role },
    req.params.depositId as string,
    req.user.email
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'deposit fetched successfully',
    data,
    traceId,
  });
});

export const DepositController = {
  submitDeposit,
  verifyDeposit,
  getAll,
  getMy,
  getById,
};




