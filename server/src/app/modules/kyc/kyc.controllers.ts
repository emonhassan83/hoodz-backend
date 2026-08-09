import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { KycService } from '@/app/modules/kyc/kyc.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const addKycRequest = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await KycService.addKycRequest(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'KYC request submitted successfully',
    data,
    traceId,
  });
});

const getAll = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await KycService.getAll(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'KYC requests fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getA = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await KycService.getA(traceId, req.params.id as string, req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'KYC request fetched successfully',
    data,
    traceId,
  });
});

const updateMyKyc = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await KycService.updateMyKyc(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'KYC updated successfully, waiting for admin approval',
    data,
    traceId,
  });
});

const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await KycService.changeStatus(traceId, req.params.id as string, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'KYC status updated successfully',
    data,
    traceId,
  });
});

export const KycController = {
  addKycRequest,
  getAll,
  getA,
  updateMyKyc,
  changeStatus,
};


