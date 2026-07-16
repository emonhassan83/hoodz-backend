import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { ProductService } from '@/app/modules/product/product.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const generateSku = asyncHandler(async (_req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.generateSku();

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'SKU generated successfully',
    data,
    traceId,
  });
});

const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.createProduct(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Product created successfully',
    data,
    traceId,
  });
});

const getAllProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.getAllProduct(req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Products fetched successfully',
    data,
    traceId,
  });
});

const getMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.getMyProducts(req.user.userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My products fetched successfully',
    data,
    traceId,
  });
});

const getShopProducts = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.getShopProducts(req.params.vendorId as string);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Shop products fetched successfully',
    data,
    traceId,
  });
});

const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.getProductById(
    traceId,
    req.params.productId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product fetched successfully',
    data,
    traceId,
  });
});

const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.updateProduct(
    traceId,
    req.params.productId as string,
    req.user,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product updated successfully',
    data,
    traceId,
  });
});

const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.deleteProduct(
    traceId,
    req.params.productId as string,
    req.user
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product deleted successfully',
    data,
    traceId,
  });
});

export const ProductController = {
  generateSku,
  createProduct,
  getAllProduct,
  getMyProducts,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
