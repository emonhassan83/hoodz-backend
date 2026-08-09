import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { CategoryService } from '@/app/modules/category/category.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const create = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CategoryService.create(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Category created successfully',
    data,
    traceId,
  });
});

const getAll = asyncHandler(async (_req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CategoryService.getAll();

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Categories fetched successfully',
    data,
    traceId,
  });
});

const updateA = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CategoryService.updateA(
    traceId,
    req.params.categoryId as string,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Category updated successfully',
    data,
    traceId,
  });
});

const deleteA = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await CategoryService.deleteA(
    traceId,
    req.params.categoryId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Category deleted successfully',
    data,
    traceId,
  });
});

export const CategoryController = {
  create,
  getAll,
  updateA,
  deleteA,
};


