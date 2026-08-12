import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
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

/** Clears cached search data for a single search actor. */
export const invalidateSearchActorCache = async (actor: TSearchActor) => {
  await deleteCachePattern(`search:history:${getSearchActorCacheKey(actor)}*`);
};

/** Builds title phrase suggestions from matched product-like documents. */
export const buildProductSuggestions = (
  products: Array<{ title?: string; brand?: string }>,
  limit = 8
) => {
  const seen = new Set<string>();
  const suggestions: Array<{ query: string; resultCount: number }> = [];

  for (const product of products) {
    const phrases = [product.title, [product.brand, product.title].filter(Boolean).join(' ')];
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

/** Returns all category chips for search screen discovery. */
export const getPopularCategories = async () =>
  Category.find().select('_id title').sort({ title: 1 }).lean();

/** Returns max 10 high-rated vendors for search screen discovery. */
export const getFeaturedSearchVendors = async () =>
  User.find({
    role: USER_ROLE.vendor,
    status: 'active',
    isDeleted: false,
  })
    .select('_id name profileAvatar location avgRating ratingCount')
    .sort({ avgRating: -1, ratingCount: -1, createdAt: -1 })
    .limit(10)
    .lean();


