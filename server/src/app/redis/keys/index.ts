import { REDIS_PREFIXES } from '@/app/constant';
import { createRedisKey } from '@/app/utils/system.utils';

export const REDIS_KEYS = {
  CONTENTS: createRedisKey('contents', 'cache'),
  CATEGORY_LIST: createRedisKey(REDIS_PREFIXES.category, 'list'),

  UNREAD_NOTIFICATION: (userId: string) => createRedisKey(REDIS_PREFIXES.unreadNotification, userId),
  RECENTLY_VIEWED_PRODUCTS: (userId: string) =>
    createRedisKey(REDIS_PREFIXES.recentlyViewedProducts, userId),
  WISHLIST: (userId: string) => createRedisKey(REDIS_PREFIXES.wishlist, userId),
  WISHLIST_PRODUCTS: (userId: string) =>
    createRedisKey(REDIS_PREFIXES.wishlist, userId, 'products'),
  PRODUCT_LIST: (scope: string) =>
    createRedisKey(REDIS_PREFIXES.product, 'list', scope),
  PRODUCT_SINGLE: (productId: string, userId = 'anonymous') =>
    createRedisKey(REDIS_PREFIXES.product, 'single', productId, userId),
  PRODUCT_RECENTLY_VIEWED: (userId: string) =>
    createRedisKey(REDIS_PREFIXES.product, 'recently-viewed', userId),
  SEARCH_RESULT: (userId: string, searchTerm: string) =>
    createRedisKey(REDIS_PREFIXES.search, 'result', userId, searchTerm),
  SEARCH_HISTORY: (userId: string, scope: string) =>
    createRedisKey(REDIS_PREFIXES.search, 'history', userId, scope),
  CART: (userId: string) => createRedisKey(REDIS_PREFIXES.cart, userId),
  RIDER_ONLINE_GEO: createRedisKey('rider', 'online', 'geo'),
  RIDER_AVAILABILITY: (riderId: string) =>
    createRedisKey('rider', 'availability', riderId),

  REGISTER_OTP: (email: string) => createRedisKey(REDIS_PREFIXES.otp, email),
  RESET_OTP: (email: string) => createRedisKey(REDIS_PREFIXES.otp, 'reset', email),

  SETTINGS_SINGLE: (key: string, vendorId = 'platform') =>
    createRedisKey(REDIS_PREFIXES.settings, vendorId, key),
  SETTINGS_GENERALS: (vendorId: string) =>
    createRedisKey(REDIS_PREFIXES.settings, vendorId, 'generals')
} as const;

