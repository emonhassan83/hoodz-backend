import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { WalletService } from '@/app/modules/wallet/wallet.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const addWallet = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletService.addWallet(req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Wallet account saved successfully',
    data,
    traceId,
  });
});

const getMyWallet = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletService.getMyWallet(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet account fetched successfully',
    data,
    traceId,
  });
});

const updateWallet = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletService.updateWallet(
    traceId,
    req.user,
    req.params.walletId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet account updated successfully',
    data,
    traceId,
  });
});

const removeWallet = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await WalletService.removeWallet(
    traceId,
    req.user,
    req.params.walletId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Wallet account removed successfully',
    data,
    traceId,
  });
});

export const WalletController = {
  addWallet,
  getMyWallet,
  updateWallet,
  removeWallet,
};
