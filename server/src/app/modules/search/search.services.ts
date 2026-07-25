import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import {
  assertSearchUserExists,
  assertValidSearchReference,
  escapeRegex,
  invalidateUserSearchCache,
  normalizeSearchTerm,
  resolveSearchLimit,
} from '@/app/modules/search/search.helpers';
import { Search } from '@/app/modules/search/search.model';
import {
  TInsertSearchPayload,
  TSearchQuery,
} from '@/app/modules/search/search.types';
import {
  reindexTypesense,
  searchTypesense,
} from '@/app/modules/search/search.typesense';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import {
  getCache,
  setCache,
} from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';

/** Searches active vendor shops and available products by one search term. */
const searchDataIntoDB = async (
  traceId: string,
  query: TSearchQuery,
  userId: string
) => {
  await assertSearchUserExists(traceId, userId);

  const searchTerm = normalizeSearchTerm(traceId, query.searchTerm);
  const limit = resolveSearchLimit(query.limit);
  const cacheKey = REDIS_KEYS.SEARCH_RESULT(
    userId,
    `${searchTerm.toLowerCase()}:${limit}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  try {
    const typesenseResult = await searchTypesense(searchTerm, query);
    await setCache(cacheKey, typesenseResult, 120);
    return typesenseResult;
  } catch (error) {
    console.warn(
      '[Typesense] Search failed, using MongoDB fallback:',
      error instanceof Error ? error.message : error
    );
  }

  const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');

  const [shops, products] = await Promise.all([
    User.find({
      role: USER_ROLE.vendor,
      status: USER_STATUS.active,
      isDeleted: false,
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ],
    })
      .select('_id name email phone profileAvatar address location')
      .limit(limit)
      .lean(),
    Product.find({
      isDeleted: false,
      $or: [
        { title: searchRegex },
        { brand: searchRegex },
        { description: searchRegex },
        { sku: searchRegex },
      ],
    })
      .populate([
        { path: 'vendorId', select: 'name profileAvatar' },
        { path: 'category', select: 'title icon' },
      ])
      .select('title brand images price discountPrice stock vendorId category')
      .sort({ stock: -1, createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const result = {
    shops,
    products,
    facets: [],
    found: {
      shops: shops.length,
      products: products.length,
    },
    fallback: 'mongodb',
  };
  await setCache(cacheKey, result, 120);
  return result;
};

/** Stores or refreshes a clicked search result in user history. */
const insertIntoDB = async (
  traceId: string,
  payload: TInsertSearchPayload,
  userId: string
) => {
  await assertSearchUserExists(traceId, userId);
  await assertValidSearchReference(traceId, payload.modelType, payload.refId);

  const history = await Search.findOneAndUpdate(
    {
      userId,
      modelType: payload.modelType,
      refId: payload.refId,
    },
    {
      $setOnInsert: { userId, modelType: payload.modelType, refId: payload.refId },
      $set: { updatedAt: new Date() },
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    }
  )
    .populate([{ path: 'refId', select: '_id name title profileAvatar images price discountPrice' }])
    .select('-__v');

  await invalidateUserSearchCache(userId);
  return history;
};

/** Returns suggested search data and the user's saved search history. */
const getAllIntoDB = async (
  traceId: string,
  query: Record<string, unknown>,
  userId: string
) => {
  await assertSearchUserExists(traceId, userId);

  const cacheKey = REDIS_KEYS.SEARCH_HISTORY(userId, JSON.stringify(query));
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [popularShops, popularProducts] = await Promise.all([
    User.find({
      role: USER_ROLE.vendor,
      status: USER_STATUS.active,
      isDeleted: false,
    })
      .select('_id name profileAvatar address')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Product.find({ isDeleted: false })
      .select('_id title brand images price discountPrice stock')
      .sort({ stock: -1, createdAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const historyQuery = new QueryBuilder(
    Search.find({ userId })
      .populate([
        {
          path: 'refId',
          select: '_id name title profileAvatar images price discountPrice',
        },
      ])
      .select('modelType refId createdAt updatedAt')
      .lean(),
    query
  )
    .filter()
    .paginate()
    .sort()
    .fields();

  const [searchHistory, meta] = await Promise.all([
    historyQuery.modelQuery,
    historyQuery.countTotal(),
  ]);

  const result = {
    data: {
      popularShops,
      popularProducts,
      searchHistory,
    },
    meta,
  };

  await setCache(cacheKey, result, 120);
  return result;
};

/** Clears all search history for the authenticated user. */
const clearSearchHistory = async (traceId: string, userId: string) => {
  await assertSearchUserExists(traceId, userId);

  const result = await Search.deleteMany({ userId });
  if (result.deletedCount === 0) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'No search history found to clear',
      traceId
    );
  }

  await invalidateUserSearchCache(userId);
  return result;
};

/** Deletes one search history item owned by the authenticated user. */
const deleteAIntoDB = async (
  traceId: string,
  id: string,
  userId: string
) => {
  const result = await Search.findOneAndDelete({ _id: id, userId });
  if (!result) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Search history deletion failed',
      traceId
    );
  }

  await invalidateUserSearchCache(userId);
  return result;
};

/** Rebuilds Typesense indexes from MongoDB for products and shops. */
const reindexIntoTypesense = async () => reindexTypesense();

export const SearchService = {
  searchDataIntoDB,
  insertIntoDB,
  getAllIntoDB,
  clearSearchHistory,
  deleteAIntoDB,
  reindexIntoTypesense,
};

