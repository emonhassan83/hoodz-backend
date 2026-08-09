import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { BannerService } from '@/app/modules/banner/banner.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const add = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await BannerService.add(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Banner added successfully',
    data,
    traceId,
  });
});

const viewAllBanner = asyncHandler(async (_req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await BannerService.viewAllBanner();

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Banners fetched successfully',
    data,
    traceId,
  });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await BannerService.update(
    traceId,
    req.params.bannerId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Banner updated successfully',
    data,
    traceId,
  });
});

const toggleStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await BannerService.toggleStatus(
    traceId,
    req.params.bannerId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Banner status updated successfully',
    data,
    traceId,
  });
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await BannerService.remove(traceId, req.params.bannerId as string);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Banner removed successfully',
    data,
    traceId,
  });
});

export const BannerController = {
  add,
  viewAllBanner,
  update,
  toggleStatus,
  remove,
};

