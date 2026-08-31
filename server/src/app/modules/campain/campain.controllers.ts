import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { CampainService } from '@/app/modules/campain/campain.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const createCampain = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CampainService.createCampain(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Campaign created successfully',
    data,
    traceId,
  });
});

const getAllCampain = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await CampainService.getAllCampain(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Campaigns fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getCampainByBanner = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CampainService.getCampainByBanner(
    traceId,
    req.params.bannerId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Campaign fetched successfully',
    data,
    traceId,
  });
});

const updateACampain = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CampainService.updateACampain(
    traceId,
    req.params.campainId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Campaign updated successfully',
    data,
    traceId,
  });
});

const removeACampain = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CampainService.removeACampain(
    traceId,
    req.params.campainId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Campaign removed successfully',
    data,
    traceId,
  });
});

export const CampainController = {
  createCampain,
  getAllCampain,
  getCampainByBanner,
  updateACampain,
  removeACampain,
};
