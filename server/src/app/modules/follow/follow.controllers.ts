import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { FollowService } from '@/app/modules/follow/follow.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const follow = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await FollowService.follow(
    traceId,
    req.user.userId,
    req.params.vendorId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Shop followed successfully',
    data,
    traceId,
  });
});

const unfollow = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await FollowService.unfollow(
    traceId,
    req.user.userId,
    req.params.vendorId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Shop unfollowed successfully',
    data,
    traceId,
  });
});

export const FollowController = {
  follow,
  unfollow,
};
