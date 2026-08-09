import { getRedisClient } from '@/app/configs/redis.config';
import { REDIS_KEYS } from '@/app/redis/keys';

const RECENTLY_VIEWED_LIMIT = 10;

export const addRecentlyViewedProduct = async (
  userId: string,
  productId: string
) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.RECENTLY_VIEWED_PRODUCTS(userId);
  const score = Date.now();

  await redis.eval(
    `
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
      local count = redis.call('ZCARD', KEYS[1])
      local limit = tonumber(ARGV[3])
      if count > limit then
        redis.call('ZREMRANGEBYRANK', KEYS[1], 0, count - limit - 1)
      end
      return count
    `,
    1,
    key,
    score,
    productId,
    RECENTLY_VIEWED_LIMIT
  );
};

export const getRecentlyViewedProductIds = async (userId: string) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.RECENTLY_VIEWED_PRODUCTS(userId);

  return redis.zrevrange(key, 0, RECENTLY_VIEWED_LIMIT - 1);
};

export const mergeRecentlyViewedProducts = async (
  guestKey: string,
  userKey: string
) => {
  const redis = getRedisClient();
  const guestRedisKey = REDIS_KEYS.RECENTLY_VIEWED_PRODUCTS(guestKey);
  const userRedisKey = REDIS_KEYS.RECENTLY_VIEWED_PRODUCTS(userKey);
  const guestItems = await redis.zrevrange(guestRedisKey, 0, -1, 'WITHSCORES');

  if (guestItems.length === 0) return { merged: 0 };

  const pipeline = redis.pipeline();
  for (let index = 0; index < guestItems.length; index += 2) {
    pipeline.zadd(userRedisKey, guestItems[index + 1], guestItems[index]);
  }
  pipeline.zremrangebyrank(userRedisKey, 0, -RECENTLY_VIEWED_LIMIT - 1);
  pipeline.del(guestRedisKey);
  await pipeline.exec();

  return { merged: guestItems.length / 2 };
};


