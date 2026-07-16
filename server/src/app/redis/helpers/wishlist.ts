import { getRedisClient } from '@/app/configs/redis.config';
import { REDIS_KEYS } from '@/app/redis/keys';

export const isWishlistProduct = async (userId: string, productId: string) => {
  const redis = getRedisClient();
  const isMember = await redis.sismember(REDIS_KEYS.WISHLIST(userId), productId);

  return isMember === 1;
};

export const addWishlistProduct = async (userId: string, productId: string) => {
  const redis = getRedisClient();
  await redis.sadd(REDIS_KEYS.WISHLIST(userId), productId);
};

export const removeWishlistProduct = async (
  userId: string,
  productId: string
) => {
  const redis = getRedisClient();
  await redis.srem(REDIS_KEYS.WISHLIST(userId), productId);
};

export const getWishlistProductIds = async (userId: string) => {
  const redis = getRedisClient();
  return redis.smembers(REDIS_KEYS.WISHLIST(userId));
};
