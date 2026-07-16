import { getRedisClient } from '@/app/configs/redis.config';
import { TCartItem } from '@/app/modules/cart/cart.interface';
import { REDIS_KEYS } from '@/app/redis/keys';

const CART_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export const getCartItemsFromCache = async (userId: string) => {
  const redis = getRedisClient();
  const cachedItems = await redis.hgetall(REDIS_KEYS.CART(userId));

  return Object.values(cachedItems).map((item) => JSON.parse(item) as TCartItem);
};

export const syncCartItemsToCache = async (
  userId: string,
  items: TCartItem[]
) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.CART(userId);

  await redis.del(key);
  if (items.length === 0) return;

  const hashPayload = items.reduce<Record<string, string>>((payload, item) => {
    payload[`${item.productId}:${item.size}:${item.color.code}`] = JSON.stringify(item);
    return payload;
  }, {});

  await redis.hset(key, hashPayload);
  await redis.expire(key, CART_CACHE_TTL_SECONDS);
};

export const clearCartCache = async (userId: string) => {
  const redis = getRedisClient();
  await redis.del(REDIS_KEYS.CART(userId));
};
