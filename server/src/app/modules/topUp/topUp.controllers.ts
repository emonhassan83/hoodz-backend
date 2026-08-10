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

export const TopUpController = {
  addWalletMoney,
};
