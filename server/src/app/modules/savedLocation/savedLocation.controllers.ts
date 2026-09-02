import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { SavedLocationService } from '@/app/modules/savedLocation/savedLocation.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const saveALocation = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedLocationService.saveALocation(
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Location saved successfully',
    data,
    traceId,
  });
});

const getMyLocation = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedLocationService.getMyLocation(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Saved locations fetched successfully',
    data,
    traceId,
  });
});

const deleteALocation = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SavedLocationService.deleteALocation(
    traceId,
    req.user.userId,
    req.params.locationId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Saved location deleted successfully',
    data,
    traceId,
  });
});

export const SavedLocationController = {
  saveALocation,
  getMyLocation,
  deleteALocation,
};
