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

const viewAllTranscrion = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await TopUpService.viewAllTranscrion(req.query, req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Top-up transactions fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const viewADetailsTransction = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const data = await TopUpService.viewADetailsTransction(
      traceId,
      req.params.topUpId as string,
      req.user
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Top-up transaction fetched successfully',
      data,
      traceId,
    });
  }
);

export const TopUpController = {
  addWalletMoney,
  viewAllTranscrion,
  viewADetailsTransction,
};
