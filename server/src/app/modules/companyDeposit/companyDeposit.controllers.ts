import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { CompanyDepositService } from '@/app/modules/companyDeposit/companyDeposit.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getAll = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await CompanyDepositService.getAll(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Company deposits fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getMy = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await CompanyDepositService.getMy(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My company deposits fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CompanyDepositService.getById(
    traceId,
    req.user,
    req.params.depositId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Company deposit fetched successfully',
    data,
    traceId,
  });
});

export const CompanyDepositController = {
  getAll,
  getMy,
  getById,
};

