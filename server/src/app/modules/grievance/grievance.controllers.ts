import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { GrievanceService } from '@/app/modules/grievance/grievance.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const createGrievance = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await GrievanceService.createGrievance(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Grievance submitted successfully',
    data,
    traceId,
  });
});

const getAllGrievances = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await GrievanceService.getAllGrievances(req.query, req.user);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Grievances fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAGrievance = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await GrievanceService.getAGrievance(
    traceId,
    req.params.grievanceId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Grievance fetched successfully',
    data,
    traceId,
  });
});

const resolveGrievance = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await GrievanceService.resolveGrievance(
    traceId,
    req.params.grievanceId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Grievance updated successfully',
    data,
    traceId,
  });
});

const deleteGrievance = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await GrievanceService.deleteGrievance(
    traceId,
    req.params.grievanceId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Grievance removed successfully',
    data,
    traceId,
  });
});

export const GrievanceController = {
  createGrievance,
  getAllGrievances,
  getAGrievance,
  resolveGrievance,
  deleteGrievance,
};
