import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
import { Product } from '@/app/modules/product/product.model';
import { Search } from '@/app/modules/search/search.model';
import { FILTER_PAGE_GENDERS, FILTER_PAGE_SIZES } from '@/app/constant';
import { TSearchActor } from '@/app/modules/search/search.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { deleteCachePattern } from '@/app/redis/helpers';

/** Validates a non-empty search term and returns a trimmed value. */
export const normalizeSearchTerm = (
  traceId: string,
  searchTerm: unknown
) => {
  if (typeof searchTerm !== 'string' || searchTerm.trim() === '') {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Search term is required and must be a non-empty string',
      traceId
    );
  }

  return searchTerm.trim();
};

/** Converts a query into a stable, duplicate-safe history key. */
export const normalizeSearchQuery = (query: string) =>
  query.trim().replace(/\s+/g, ' ').toLowerCase();

/** Escapes user input before building a regex search. */
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a bounded result limit for search lists. */
export const resolveSearchLimit = (limit: unknown, fallback = 10) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 30);
};

/** Resolves a cache/history actor where auth user takes priority over guest id. */
export const resolveSearchActor = (
  userId?: string,
  guestId?: string | string[]
): TSearchActor => {
  if (userId) return { userId };
  const rawGuestId = Array.isArray(guestId) ? guestId[0] : guestId;
  return rawGuestId?.trim() ? { guestId: rawGuestId.trim() } : {};
};

/** Returns a stable actor key for Redis cache scopes. */
export const getSearchActorCacheKey = (actor: TSearchActor) => {
  if (actor.userId) return `user:${actor.userId}`;
  if (actor.guestId) return `guest:${actor.guestId}`;
  return 'anonymous';
};

/** Throws when an endpoint requires a user or guest identity. */
export const assertSearchActorExists = (
  traceId: string,
  actor: TSearchActor
) => {
  if (!actor.userId && !actor.guestId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'x-guest-id header or authentication is required for search history',
      traceId
    );
  }
};

/** Builds a Mongo filter scoped to the current user or guest identity. */
export const buildSearchActorFilter = (actor: TSearchActor) =>
  actor.userId ? { userId: actor.userId } : { guestId: actor.guestId };

let searchIndexesReady = false;

/** Drops legacy search indexes that block multiple history rows per user. */
export const ensureSearchIndexes = async () => {
  if (searchIndexesReady) return;

  const indexes = await Search.collection.indexes();
  const legacyIndexes = indexes.filter((index) => {
    const keys = Object.keys(index.key ?? {});
    return (
      keys.includes('modelType') ||
      keys.includes('refId') ||
      (Boolean(index.unique) &&
        keys.length === 1 &&
        (keys[0] === 'userId' || keys[0] === 'guestId'))
    );
  });

  await Promise.all(
    legacyIndexes
      .map((index) => index.name)
      .filter(Boolean)
      .map((name) => Search.collection.dropIndex(name as string).catch(() => undefined))
  );

  await Search.syncIndexes();
  searchIndexesReady = true;
};

/** Clears cached search data for a single search actor. */
export const invalidateSearchActorCache = async (actor: TSearchActor) => {
  await deleteCachePattern(`search:history:${getSearchActorCacheKey(actor)}*`);
};

/** Builds title phrase suggestions from matched product-like documents. */
export const buildProductSuggestions = (
  products: Array<{ title?: string }>,
  limit = 8
) => {
  const seen = new Set<string>();
  const suggestions: Array<{ query: string; resultCount: number }> = [];

  for (const product of products) {
    const phrases = [product.title];
    for (const phrase of phrases) {
      if (!phrase) continue;
      const query = phrase.trim().replace(/\s+/g, ' ');
      const normalized = normalizeSearchQuery(query);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      suggestions.push({ query, resultCount: 1 });
      if (suggestions.length >= limit) return suggestions;
    }
  }

  return suggestions;
};

/** Returns categories that currently have at least one product. */
export const getPopularCategories = async () => {
  const categoryIds = await Product.distinct('category', { isDeleted: false });
  if (categoryIds.length === 0) return [];

  return Category.find({ _id: { $in: categoryIds } })
    .select('_id title icon')
    .sort({ title: 1 })
    .lean();
};

/** Returns max 10 vendors ranked by highest rating. */
export const getFeaturedSearchVendors = async () =>
  User.find({
    role: USER_ROLE.vendor,
    status: 'active',
    isDeleted: false,
    avgRating: { $gt: 0 },
  })
    .select('_id name profileAvatar location avgRating ratingCount')
    .sort({ avgRating: -1, ratingCount: -1, createdAt: -1 })
    .limit(10)
    .lean();

/** Returns filter-page options from live product catalog usage. */
export const getFilterPageData = async () => {
  const productMatch = { isDeleted: false };

  const [priceRows, categories, brands, colors] = await Promise.all([
    Product.aggregate([
      { $match: productMatch },
      {
        $group: {
          _id: null,
          maxPrice: { $max: { $ifNull: ['$discountPrice', '$price'] } },
        },
      },
    ]),
    Product.aggregate([
      { $match: { ...productMatch, category: { $ne: null } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $project: {
          _id: '$category._id',
          title: '$category.title'
        },
      },
    ]),
    Product.aggregate([
      {
        $match: {
          ...productMatch,
          brand: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: { $toLower: '$brand' },
          brand: { $first: '$brand' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $project: { _id: 0, brand: 1 } },
    ]),
    Product.aggregate([
      { $match: productMatch },
      { $unwind: '$colors' },
      {
        $match: {
          'colors.name': { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: { $toLower: '$colors.name' },
          name: { $first: '$colors.name' },
          code: { $first: '$colors.code' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $project: { _id: 0, name: 1, code: 1 } },
    ]),
  ]);

  return {
    minPrice: 0,
    maxPrice: Number(priceRows[0]?.maxPrice ?? 0),
    category: categories,
    brand: brands.map((item) => item.brand),
    color: colors,
    size: [...FILTER_PAGE_SIZES],
    gender: [...FILTER_PAGE_GENDERS],
  };
};


