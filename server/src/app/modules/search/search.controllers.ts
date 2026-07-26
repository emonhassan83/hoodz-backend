import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { resolveSearchActor } from '@/app/modules/search/search.helpers';
import { SearchService } from '@/app/modules/search/search.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

/** Reads authenticated user or guest header for search history scope. */
const getSearchActorFromRequest = (req: Request) =>
  resolveSearchActor(req.user?.userId, req.headers['x-guest-id']);

const searchDataIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const actor = getSearchActorFromRequest(req);
  const data = await SearchService.searchDataIntoDB(
    traceId,
    req.query,
    actor
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Search data fetched successfully',
    data: data,
    traceId,
  });
});

const insertIntoDB = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const actor = getSearchActorFromRequest(req);
  const data = await SearchService.insertIntoDB(
    traceId,
    req.body,
    actor
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
  const actor = getSearchActorFromRequest(req);
  const result = (await SearchService.getAllIntoDB(req.query, actor)) as {
    popularCategories?: unknown;
    featuredVendors?: unknown;
    searchHistory?: unknown;
    meta: unknown;
  };

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Search history fetched successfully',
    data: {
      popularCategories: result.popularCategories ?? [],
      featuredVendors: result.featuredVendors ?? [],
      searchHistory: result.searchHistory ?? [],
    },
    meta: result.meta,
    traceId,
  });
});

const clearSearchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const actor = getSearchActorFromRequest(req);
    const data = await SearchService.clearSearchHistory(
      traceId,
      actor
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
  const actor = getSearchActorFromRequest(req);
  const data = await SearchService.deleteAIntoDB(
    traceId,
    req.params.id as string,
    actor
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
