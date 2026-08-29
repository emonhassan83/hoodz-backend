import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { VendorTransctionService } from '@/app/modules/vendorTransction/vendorTransction.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const myPaymentTransction = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await VendorTransctionService.myPaymentTransction(
    req.user.userId,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Vendor payment transactions fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getVendorTransction = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await VendorTransctionService.getVendorTransction(
    traceId,
    req.query.vendorId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Vendor payment transactions fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

export const VendorTransctionController = {
  myPaymentTransction,
  getVendorTransction,
};
