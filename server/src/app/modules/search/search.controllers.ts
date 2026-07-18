import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { SearchService } from '@/app/modules/search/search.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

const searchDataIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SearchService.searchDataIntoDB(
    traceId,
    req.query,
    req.user.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Search data fetched successfully',
    data,
    traceId,
  });
});

const insertIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SearchService.insertIntoDB(
    traceId,
    req.body,
    req.user.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Search history saved successfully',
    data,
    traceId,
  });
});

const getAllIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SearchService.getAllIntoDB(
    traceId,
    req.query,
    req.user.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Search history fetched successfully',
    data,
    traceId,
  });
});

const clearSearchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const data = await SearchService.clearSearchHistory(
      traceId,
      req.user.userId
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Search history cleared successfully',
      data,
      traceId,
    });
  }
);

const deleteAIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SearchService.deleteAIntoDB(
    traceId,
    req.params.id as string,
    req.user.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Search history deleted successfully',
    data,
    traceId,
  });
});

const reindexIntoTypesense = asyncHandler(async (_req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await SearchService.reindexIntoTypesense();

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Typesense search index rebuilt successfully',
    data,
    traceId,
  });
});

export const SearchController = {
  searchDataIntoDB,
  insertIntoDB,
  getAllIntoDB,
  clearSearchHistory,
  deleteAIntoDB,
  reindexIntoTypesense,
};
