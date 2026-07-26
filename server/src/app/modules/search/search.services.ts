import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { getFollowedVendorIdSet, withFollowingFlag } from '@/app/modules/follow/follow.helpers';
import { Product } from '@/app/modules/product/product.model';
import {
  assertSearchActorExists,
  buildProductSuggestions,
  buildSearchActorFilter,
  escapeRegex,
  getFeaturedSearchVendors,
  getPopularCategories,
  getSearchActorCacheKey,
  invalidateSearchActorCache,
  normalizeSearchQuery,
  normalizeSearchTerm,
} from '@/app/modules/search/search.helpers';
import { Search } from '@/app/modules/search/search.model';
import {
  TInsertSearchPayload,
  TSearchActor,
  TSearchQuery,
} from '@/app/modules/search/search.types';
import {
  reindexTypesense,
  searchTypesense,
} from '@/app/modules/search/search.typesense';
import {
  getCache,
  setCache,
} from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';

const SEARCH_SUGGESTION_SOURCE_LIMIT = 15;

/** Searches products and returns product-title suggestions for grouped result clicks. */
const searchDataIntoDB = async (
  traceId: string,
  query: TSearchQuery,
  actor: TSearchActor
) => {
  const searchTerm = normalizeSearchTerm(traceId, query.searchTerm);
  const cacheKey = REDIS_KEYS.SEARCH_RESULT(
    getSearchActorCacheKey(actor),
    `suggestions:v2:${searchTerm.toLowerCase()}:${JSON.stringify(query)}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  try {
    const typesenseResult = await searchTypesense(searchTerm, query);
    await setCache(cacheKey, typesenseResult, 120);
    return typesenseResult;
  } catch (error) {
    console.warn(
      '[Typesense] Product search failed, using MongoDB fallback:',
      error instanceof Error ? error.message : error
    );
  }

  const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');

  const productFilter: Record<string, unknown> = {
    isDeleted: false,
    ...(query.inStock === false || query.inStock === 'false'
      ? {}
      : { stock: { $gt: 0 } }),
    ...(query.brand ? { brand: query.brand } : {}),
    ...(query.collectionType ? { collectionType: query.collectionType } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.size ? { sizes: query.size } : {}),
    ...(query.color ? { 'colors.name': query.color } : {}),
    ...(query.minPrice || query.maxPrice
      ? {
          discountPrice: {
            ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}),
            ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {}),
          },
        }
      : {}),
    $or: [
      { title: searchRegex },
      { brand: searchRegex },
      { description: searchRegex },
      { sku: searchRegex },
      { 'seo.metaKeywords': searchRegex },
    ],
  };

  const products = await Product.find(productFilter)
    .select('title brand')
    .sort({ stock: -1, createdAt: -1 })
    .limit(SEARCH_SUGGESTION_SOURCE_LIMIT)
    .lean();

  const result = {
    suggestions: buildProductSuggestions(products),
    fallback: 'mongodb',
  };

  await setCache(cacheKey, result, 120);
  return result;
};

/** Stores or refreshes a user/guest search phrase in history. */
const insertIntoDB = async (
  traceId: string,
  payload: TInsertSearchPayload,
  actor: TSearchActor
) => {
  assertSearchActorExists(traceId, actor);

  const query = normalizeSearchTerm(traceId, payload.query);
  const normalizedQuery = normalizeSearchQuery(query);
  const resultCount = await Product.countDocuments({
    isDeleted: false,
    $or: [
      { title: new RegExp(escapeRegex(query), 'i') },
      { brand: new RegExp(escapeRegex(query), 'i') },
      { description: new RegExp(escapeRegex(query), 'i') },
      { sku: new RegExp(escapeRegex(query), 'i') },
      { 'seo.metaKeywords': new RegExp(escapeRegex(query), 'i') },
    ],
  });

  const history = await Search.findOneAndUpdate(
    {
      ...buildSearchActorFilter(actor),
      normalizedQuery,
    },
    {
      $setOnInsert: { ...actor, normalizedQuery },
      $set: {
        query,
        source: payload.source,
        resultCount,
        lastSearchedAt: new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    }
  ).select('-__v');

  await invalidateSearchActorCache(actor);
  return history;
};

/** Returns search screen discovery data plus actor-scoped search history. */
const getAllIntoDB = async (
  query: Record<string, unknown>,
  actor: TSearchActor
) => {
  const cacheKey = REDIS_KEYS.SEARCH_HISTORY(
    getSearchActorCacheKey(actor),
    JSON.stringify(query)
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const historyQuery = actor.userId || actor.guestId
    ? new QueryBuilder(
        Search.find(buildSearchActorFilter(actor))
          .select('query normalizedQuery source resultCount lastSearchedAt createdAt updatedAt')
          .lean(),
        query
      )
        .filter()
        .paginate()
        .sort()
        .fields()
    : null;

  const [popularCategories, featuredVendors, searchHistory, meta] =
    await Promise.all([
      getPopularCategories(),
      getFeaturedSearchVendors(),
      historyQuery?.modelQuery ?? Promise.resolve([]),
      historyQuery?.countTotal() ?? Promise.resolve({
        page: 1,
        limit: Number(query.limit || 10),
        total: 0,
        totalPage: 0,
      }),
    ]);

  const followedVendorIds = await getFollowedVendorIdSet(actor.userId);
  const result = {
    popularCategories,
    featuredVendors: featuredVendors.map((vendor) =>
      withFollowingFlag(vendor, followedVendorIds)
    ),
    searchHistory,
    meta,
  };

  await setCache(cacheKey, result);
  return result;
};

/** Clears all search history for the current user or guest. */
const clearSearchHistory = async (traceId: string, actor: TSearchActor) => {
  assertSearchActorExists(traceId, actor);

  const result = await Search.deleteMany(buildSearchActorFilter(actor));
  if (result.deletedCount === 0) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'No search history found to clear',
      traceId
    );
  }

  await invalidateSearchActorCache(actor);
  return result;
};

/** Deletes one search history item owned by the current user or guest. */
const deleteAIntoDB = async (
  traceId: string,
  id: string,
  actor: TSearchActor
) => {
  assertSearchActorExists(traceId, actor);

  const result = await Search.findOneAndDelete({
    _id: id,
    ...buildSearchActorFilter(actor),
  });
  if (!result) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Search history deletion failed',
      traceId
    );
  }

  await invalidateSearchActorCache(actor);
  return result;
};

/** Merges guest search history into the authenticated user's history. */
const mergeGuestSearchHistory = async (guestId: string | undefined, userId: string) => {
  if (!guestId?.trim() || !userId) return { merged: 0 };

  const guestHistory = await Search.find({ guestId: guestId.trim() }).lean();
  if (!guestHistory.length) return { merged: 0 };

  await Promise.all(
    guestHistory.map((history) =>
      Search.findOneAndUpdate(
        { userId, normalizedQuery: history.normalizedQuery },
        {
          $setOnInsert: {
            userId,
            normalizedQuery: history.normalizedQuery,
          },
          $set: {
            query: history.query,
            source: history.source,
            resultCount: history.resultCount,
            lastSearchedAt: history.lastSearchedAt,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      )
    )
  );

  await Search.deleteMany({ guestId: guestId.trim() });
  await Promise.all([
    invalidateSearchActorCache({ guestId: guestId.trim() }),
    invalidateSearchActorCache({ userId }),
  ]);

  return { merged: guestHistory.length };
};

/** Rebuilds the Typesense product index from MongoDB. */
const reindexIntoTypesense = async () => reindexTypesense();

export const SearchService = {
  searchDataIntoDB,
  insertIntoDB,
  getAllIntoDB,
  clearSearchHistory,
  deleteAIntoDB,
  mergeGuestSearchHistory,
  reindexIntoTypesense,
};
