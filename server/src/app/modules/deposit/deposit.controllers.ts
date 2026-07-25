import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { DepositService } from '@/app/modules/deposit/deposit.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

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
  const result = await DepositService.getMy(req.user.userId, req.query);

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
    req.user,
    req.params.depositId as string
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
  getAll,
  getMy,
  getById,
};



