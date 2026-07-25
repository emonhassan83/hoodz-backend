import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { JobService } from '@/app/modules/job/job.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getCurrentRiderJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getCurrentRiderJobs(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Current rider jobs fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getRiderHistory = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getRiderHistory(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Rider job history fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAllJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getAllJobs(req.user, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Jobs fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getJobById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await JobService.getJobById(
    traceId,
    req.user,
    req.params.jobId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Job fetched successfully',
    data,
    traceId,
  });
});

const getJobByOrderId = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await JobService.getJobByOrderId(
    traceId,
    req.user,
    req.params.orderId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Order job fetched successfully',
    data,
    traceId,
  });
});

export const JobController = {
  getCurrentRiderJobs,
  getRiderHistory,
  getAllJobs,
  getJobById,
  getJobByOrderId,
};


