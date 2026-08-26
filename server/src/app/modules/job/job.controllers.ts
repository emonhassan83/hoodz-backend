import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { JobService } from '@/app/modules/job/job.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const myRequestJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.myRequestJobs(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Requested jobs fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getMyJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getMyJobs(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My jobs fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getRiderJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getRiderJobs(
    req.params.riderId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Rider jobs fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAllJobs = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await JobService.getAllJobs(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Jobs fetched successfully',
    meta: result.meta,
    data: result.data,
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

const getAJobDetails = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await JobService.getAJobDetails(
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

export const JobController = {
  myRequestJobs,
  getMyJobs,
  getRiderJobs,
  getAllJobs,
  getJobByOrderId,
  getAJobDetails,
};
