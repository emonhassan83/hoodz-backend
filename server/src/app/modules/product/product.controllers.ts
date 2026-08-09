import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { ProductService } from '@/app/modules/product/product.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const getGuestId = (req: Request) => {
  const guestId = req.headers['x-guest-id'];
  return Array.isArray(guestId) ? guestId[0] : guestId;
};

const getProductActor = (req: Request) => ({
  ...(req.user?.userId ? { userId: req.user.userId } : {}),
  ...(!req.user?.userId && getGuestId(req) ? { guestId: getGuestId(req) } : {}),
});

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

const createProductByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.createProductByAdmin(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Product created successfully',
    data,
    traceId,
  });
});

const markProductViewed = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.markProductViewed(
    traceId,
    getProductActor(req),
    req.params.productId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Product view saved successfully',
    data,
    traceId,
  });
});

const getRecentlyViewedProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const result = await ProductService.getRecentlyViewedProducts(
      getProductActor(req),
      req.query
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Recently viewed products fetched successfully',
      meta: result.meta,
      data: result.data,
      traceId,
    });
  }
);

const getTrendingProducts = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ProductService.getTrendingProducts(
    req.query,
    req.user?.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Trending products fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getShopProducts = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ProductService.getShopProducts(
    traceId,
    req.params.vendorId as string,
    req.query,
    req.user?.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Shop products fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getAllProduct = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ProductService.getAllProduct(
    traceId,
    req.query,
    req.user?.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Products fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const result = await ProductService.getMyProducts(req.user.userId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My products fetched successfully',
    meta: result.meta,
    data: result.data,
    traceId,
  });
});

const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.getProductById(
    traceId,
    req.params.productId as string,
    req.user?.userId
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

const notifyMe = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await ProductService.notifyMe(
    traceId,
    req.user.userId,
    req.params.productId as string
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: data.alreadyInStock
      ? 'Product is already in stock'
      : 'Stock notification request saved successfully',
    data,
    traceId,
  });
});

export const ProductController = {
  generateSku,
  markProductViewed,
  getRecentlyViewedProducts,
  getTrendingProducts,
  createProduct,
  createProductByAdmin,
  getAllProduct,
  getShopProducts,
  getMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  notifyMe,
};


