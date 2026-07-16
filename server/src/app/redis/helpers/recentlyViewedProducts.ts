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
