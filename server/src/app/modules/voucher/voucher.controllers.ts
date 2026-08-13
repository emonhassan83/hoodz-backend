import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { VoucherService } from '@/app/modules/voucher/voucher.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const addVouture = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await VoucherService.addVouture(traceId, req.user, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Voucher added successfully',
    data,
    traceId,
  });
});

const getGlobalVoutures = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await VoucherService.getGlobalVoutures(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Global vouchers fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getShopwiseVoutures = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await VoucherService.getShopwiseVoutures(
    req.params.vendorId as string,
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Shopwise vouchers fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getActiveShopAndGlobalVoutures = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const data = await VoucherService.getActiveShopAndGlobalVoutures(
      req.params.vendorId as string
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Shop and global vouchers fetched successfully',
      data,
      traceId,
    });
  }
);

const getCompensionVoutures = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await VoucherService.getCompensionVoutures(req.user, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Compension vouchers fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAVouture = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await VoucherService.getAVouture(
    traceId,
    req.params.voucherId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Voucher fetched successfully',
    data,
    traceId,
  });
});

const updateAVouture = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await VoucherService.updateAVouture(
    traceId,
    req.params.voucherId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Voucher updated successfully',
    data,
    traceId,
  });
});

const updateVoutureStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await VoucherService.updateVoutureStatus(
    traceId,
    req.params.voucherId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Voucher status updated successfully',
    data,
    traceId,
  });
});

const removeVouture = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await VoucherService.removeVouture(
    traceId,
    req.params.voucherId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Voucher removed successfully',
    data,
    traceId,
  });
});

export const VoucherController = {
  addVouture,
  getGlobalVoutures,
  getShopwiseVoutures,
  getActiveShopAndGlobalVoutures,
  getCompensionVoutures,
  getAVouture,
  updateAVouture,
  updateVoutureStatus,
  removeVouture,
};
