import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import { SEARCH_TYPE } from '@/app/modules/search/search.constant';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
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

/** Escapes user input before building a regex search. */
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a bounded result limit for search lists. */
export const resolveSearchLimit = (limit: unknown, fallback = 10) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 30);
};

/** Ensures the requesting user exists and is not deleted. */
export const assertSearchUserExists = async (
  traceId: string,
  userId: string
) => {
  const user = await User.findById(userId).select('role isDeleted').lean();
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  return user;
};

/** Checks whether a selected search result still points to a valid record. */
export const assertValidSearchReference = async (
  traceId: string,
  modelType: SEARCH_TYPE,
  refId: string
) => {
  const exists =
    modelType === SEARCH_TYPE.User
      ? await User.exists({
          _id: refId,
          role: USER_ROLE.vendor,
          status: USER_STATUS.active,
          isDeleted: false,
        })
      : await Product.exists({ _id: refId, isDeleted: false });

  if (!exists) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      `Invalid ${modelType} reference ID`,
      traceId
    );
  }
};

/** Clears cached search data for a single user after history changes. */
export const invalidateUserSearchCache = async (userId: string) => {
  await deleteCachePattern(`search:*:${userId}:*`);
};

