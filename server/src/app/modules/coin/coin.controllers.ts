import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { CoinService } from '@/app/modules/coin/coin.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CoinService.getSummary(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Coin summary fetched successfully',
    data,
    traceId,
  });
});

export const CoinController = {
  getSummary,
};
