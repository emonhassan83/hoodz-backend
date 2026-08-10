import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { ReviewService } from '@/app/modules/review/review.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const create = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ReviewService.create(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Review created successfully',
    data,
    traceId,
  });
});

const getReviewByAuthor = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ReviewService.getReviewByAuthor(
    req.params.authorId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Author reviews fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getReviewByProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ReviewService.getReviewByProduct(
    req.params.productId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product reviews fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

export const ReviewController = {
  create,
  getReviewByAuthor,
  getReviewByProduct,
};
