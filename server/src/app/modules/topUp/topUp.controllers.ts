import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { TopUpService } from '@/app/modules/topUp/topUp.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const addWalletMoney = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await TopUpService.addWalletMoney(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Wallet top-up initiated successfully',
    data,
    traceId,
  });
});

const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await TopUpService.getSummary(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Top-up summary fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getDetails = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await TopUpService.getDetails(traceId, req.params.topUpId as string);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Top-up transaction fetched successfully',
    data,
    traceId,
  });
});

export const TopUpController = {
  addWalletMoney,
  getSummary,
  getDetails,
};
